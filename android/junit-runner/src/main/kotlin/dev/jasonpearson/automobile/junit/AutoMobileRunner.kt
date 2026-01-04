package dev.jasonpearson.automobile.junit

import java.io.File
import java.text.SimpleDateFormat
import java.util.Date
import java.util.UUID
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import kotlin.jvm.java
import org.junit.runner.notification.Failure
import org.junit.runner.notification.RunNotifier
import org.junit.runners.BlockJUnit4ClassRunner
import org.junit.runners.model.FrameworkMethod

/**
 * Custom JUnit runner for executing AutoMobile YAML test plans.
 *
 * This runner detects @AutoMobileTest annotations, executes the specified YAML plans using the
 * AutoMobile CLI (via npx), and provides AI-assisted failure recovery. When no plan is provided but
 * a prompt is specified with AI assistance enabled, it generates a YAML plan from the prompt using
 * the AI agent via AutoMobile MCP server.
 */
class AutoMobileRunner(private val klass: Class<*>) : BlockJUnit4ClassRunner(klass) {

  // Phase 4: Lazy initialization of AutoMobileAgent (only initialized if AI assistance needed)
  private val agent: AutoMobileAgent
    get() = LazyInitializer.getAgent()

  override fun run(notifier: RunNotifier) {
    // Skip the entire class if no devices are available
    if (!AutoMobileSharedUtils.deviceChecker.areDevicesAvailable()) {
      println("No Android devices found - skipping entire test class: ${klass.simpleName}")

      // Mark all tests in the class as ignored
      for (child in children) {
        val description = describeChild(child)
        notifier.fireTestIgnored(description)
      }
      return
    }

    // Proceed with normal execution if devices are available
    super.run(notifier)
  }

  override fun getChildren(): List<FrameworkMethod> {
    return super.getChildren()
  }

  override fun childrenInvoker(notifier: RunNotifier): org.junit.runners.model.Statement {
    // Get max parallel forks from system property, default to number of available processors
    val configuredForks = SystemPropertyCache.get("junit.parallel.forks",
      Runtime.getRuntime().availableProcessors().toString()).toIntOrNull() ?: 2

    // Limit parallelism to the number of available devices to prevent contention
    // This ensures tests don't compete for limited device resources
    val deviceCount = AutoMobileSharedUtils.deviceChecker.getDeviceCount()
    val maxParallelForks = if (deviceCount > 0) {
      val effectiveForks = configuredForks.coerceAtMost(deviceCount)
      if (effectiveForks < configuredForks) {
        println("AutoMobileRunner: Limiting parallelism from $configuredForks to $effectiveForks (only $deviceCount device(s) available)")
      }
      effectiveForks
    } else {
      // No devices detected - fall back to configured value (tests may fail or be skipped)
      configuredForks
    }

    val children = getChildren()

    println("AutoMobileRunner: childrenInvoker called with ${children.size} children, maxParallelForks=$maxParallelForks, deviceCount=$deviceCount")

    // Only parallelize if we have multiple children and parallelism is enabled
    if (children.size <= 1 || maxParallelForks <= 1) {
      println("AutoMobileRunner: Using SEQUENTIAL execution (children=${children.size}, forks=$maxParallelForks)")
      // Fall back to sequential execution
      return super.childrenInvoker(notifier)
    }

    println("AutoMobileRunner: Using PARALLEL execution with $maxParallelForks threads")

    // Return a Statement that executes children in parallel
    return object : org.junit.runners.model.Statement() {
      override fun evaluate() {
        // Create thread pool for parallel execution
        val executor = Executors.newFixedThreadPool(maxParallelForks.coerceAtMost(children.size))

        try {
          // Submit each test method for parallel execution
          val futures = children.map { child ->
            executor.submit {
              println("[${Thread.currentThread().name}] Starting test: ${describeChild(child).methodName}")
              // Synchronize notifier access to ensure thread safety
              runChild(child, SynchronizedRunNotifier(notifier))
              println("[${Thread.currentThread().name}] Finished test: ${describeChild(child).methodName}")
            }
          }

          // Wait for all test methods to complete and collect any exceptions
          val exceptions = mutableListOf<Throwable>()
          futures.forEach { future ->
            try {
              future.get()
            } catch (e: Exception) {
              // Collect exceptions to report after all tests complete
              exceptions.add(e.cause ?: e)
            }
          }

          // If any test failed, throw the first exception
          if (exceptions.isNotEmpty()) {
            throw exceptions.first()
          }
        } finally {
          executor.shutdown()
          executor.awaitTermination(1, TimeUnit.HOURS)
        }
      }
    }
  }

  override fun runChild(method: FrameworkMethod, notifier: RunNotifier) {
    val autoMobileTest = method.getAnnotation(AutoMobileTest::class.java)

    if (autoMobileTest != null) {
      runAutoMobileTest(method, autoMobileTest, notifier)
    } else {
      super.runChild(method, notifier)
    }
  }

  private fun runAutoMobileTest(
      method: FrameworkMethod,
      annotation: AutoMobileTest,
      notifier: RunNotifier
  ) {
    val description = describeChild(method)
    notifier.fireTestStarted(description)

    try {
      val planPath = getPlanPathOrGenerate(method, annotation)
      val resolvedPlanPath = resolvePlanPath(planPath)

      val debugMode = SystemPropertyCache.getBoolean("automobile.debug", false)
      if (debugMode) {
        println("Running AutoMobile test: ${method.name} with plan: $planPath")
      }

      val result = executeAutoMobilePlan(resolvedPlanPath, annotation, method.name)

      if (!result.success) {
        val errorMessage = buildString {
          append("AutoMobile test failed: ${result.errorMessage}")
          if (result.logFile != null) {
            append("\n\nFull test output written to: ${result.logFile.absolutePath}")
          }
        }
        val failure =
            Failure(
                description,
                AutoMobileTestException(errorMessage))
        notifier.fireTestFailure(failure)
      }
    } catch (e: Exception) {
      println("Error running AutoMobile test ${method.name}: ${e.message}")
      val failure = Failure(description, e)
      notifier.fireTestFailure(failure)
    } finally {
      notifier.fireTestFinished(description)
    }
  }

  private fun getPlanPathOrGenerate(method: FrameworkMethod, annotation: AutoMobileTest): String {
    return when {
      annotation.plan.isNotEmpty() -> annotation.plan
      annotation.prompt.isNotEmpty() && annotation.aiAssistance -> {
        generatePlanFromPrompt(method, annotation)
      }
      else ->
          throw IllegalArgumentException(
              "Either 'plan' or 'prompt' (with aiAssistance=true) must be specified in @AutoMobileTest")
    }
  }

  private fun generatePlanFromPrompt(method: FrameworkMethod, annotation: AutoMobileTest): String {
    val className = klass.simpleName
    val methodName = method.name

    // Get test resources directory
    val testResourcesDir =
        File(
            klass.classLoader.getResource(".")?.toURI()
                ?: throw RuntimeException("Cannot find test resources directory"))

    return agent.generatePlanFromPrompt(annotation.prompt, className, methodName, testResourcesDir)
  }

  private fun resolvePlanPath(planPath: String): String {
    // Check cache first to avoid repeated classpath resolution
    PlanCache.getCachedPath(planPath)?.let { return it }

    val classLoader = klass.classLoader
    val resource =
        classLoader.getResource(planPath)
            ?: throw IllegalArgumentException("YAML plan not found in test resources: $planPath")

    val resolvedPath = File(resource.toURI()).path
    PlanCache.cachePath(planPath, resolvedPath)
    return resolvedPath
  }

  private fun executeAutoMobilePlan(planPath: String, annotation: AutoMobileTest, testName: String): ExecutionResult {
    val startTime = System.currentTimeMillis()

    try {
      // Read the YAML plan content (with caching for repeated plans)
      val planReadStart = System.currentTimeMillis()
      val planContent = PlanCache.getCachedContent(planPath) ?: run {
        val content = File(planPath).readText()
        PlanCache.cacheContent(planPath, content)
        content
      }
      PerformanceTracker.measure("Plan file read", planReadStart)

      // Base64 encode the plan content to safely pass through command line
      val base64Start = System.currentTimeMillis()
      val base64Content = java.util.Base64.getEncoder().encodeToString(planContent.toByteArray())
      PerformanceTracker.measure("Base64 encoding", base64Start)

      // Generate unique session UUID for this test execution to enable proper device assignment
      val sessionUuid = UUID.randomUUID().toString()
      println("[${Thread.currentThread().name}] Generated session UUID: $sessionUuid for test: $testName")

      val cmdBuildStart = System.currentTimeMillis()
      val command = buildAutoMobileExecutePlanCommand(base64Content, annotation, sessionUuid)
      PerformanceTracker.measure("Command building", cmdBuildStart)

      // Gate verbose output behind debug mode
      val debugMode = SystemPropertyCache.getBoolean("automobile.debug", false)
      if (debugMode) {
        println("Executing command: ${command.joinToString(" ")}")
      }

      val execStart = System.currentTimeMillis()
      val result = AutoMobileSharedUtils.executeCommand(command, annotation.timeoutMs)
      PerformanceTracker.measure("Command execution", execStart)

      val executionTime = System.currentTimeMillis() - startTime

      // Write log file for this test execution
      val logWriteStart = System.currentTimeMillis()
      val logFile = writeTestLog(
          testName = testName,
          className = klass.simpleName,
          stdout = result.output,
          stderr = result.errorOutput,
          exitCode = result.exitCode,
          executionTimeMs = executionTime,
          success = result.exitCode == 0,
          performanceMeasurements = PerformanceTracker.getMeasurements()
      )
      PerformanceTracker.measure("Log file write", logWriteStart)
      PerformanceTracker.clear()

      if (debugMode) {
        println("Test output written to: ${logFile.absolutePath}")
      }

      val finalResult = if (result.exitCode == 0) {
        ExecutionResult(
            success = true,
            exitCode = result.exitCode,
            output = result.output,
            executionTimeMs = executionTime,
            logFile = logFile)
      } else {
        handleFailure(
            annotation,
            result.exitCode,
            result.output,
            result.errorOutput,
            executionTime,
            logFile)
      }

      return finalResult
    } catch (e: Exception) {
      val executionTime = System.currentTimeMillis() - startTime
      println("Error executing AutoMobile plan: ${e.message}")

      return ExecutionResult(
          success = false,
          exitCode = -1,
          errorMessage = e.message ?: "Unknown error",
          executionTimeMs = executionTime)
    }
  }

  private fun buildAutoMobileExecutePlanCommand(
      base64PlanContent: String,
      annotation: AutoMobileTest,
      sessionUuid: String
  ): List<String> {
    // Phase 8: Pre-sized ArrayList to avoid list resizing overhead
    // Typical command has 10-12 elements depending on options (including session UUID)
    val command = ArrayList<String>(14)

    // Prefer local development version first (cached to avoid repeated filesystem checks)
    if (localAutoMobileExists()) {
      // Phase 8: Direct adds instead of addAll(listOf(...)) to reduce allocations
      command.add("bun")
      command.add(localAutoMobilePath)
      command.add("--cli")
    } else {
      // Use bunx for package execution (bunx caches resolution)
      command.add("bunx")
      command.add("auto-mobile")
      command.add("--cli")
    }

    // Use cached system properties to avoid repeated reads
    // Enable debug mode by default for comprehensive logging during parallel execution
    val debugMode = SystemPropertyCache.getBoolean("automobile.debug", true)

    command.add("executePlan")
    // Phase 8: Direct adds with inline string building instead of intermediate list allocation
    command.add("--planContent")
    command.add("base64:$base64PlanContent")
    command.add("--platform")
    command.add("android")

    // Add session UUID to enable proper device assignment in parallel execution
    command.add("--session-uuid")
    command.add(sessionUuid)

    if (annotation.device != "auto") {
      command.add("--device")
      command.add(annotation.device)
    }

    if (debugMode) {
      command.add("--debug")
    }

    return command
  }

  private fun handleFailure(
      annotation: AutoMobileTest,
      exitCode: Int,
      output: String,
      errorOutput: String,
      baseExecutionTime: Long,
      logFile: File
  ): ExecutionResult {

    val ciMode = SystemPropertyCache.getBoolean("automobile.ci.mode", false)
    if (!annotation.aiAssistance || ciMode) {
      println("AI assistance disabled or in CI mode, marking test as failed")
      return ExecutionResult(
          success = false,
          exitCode = exitCode,
          output = output,
          errorMessage = buildString {
            append("AutoMobile CLI failed with exit code ")
            append(exitCode)
            if (errorOutput.isNotEmpty()) {
              append("\nErrors: ")
              append(errorOutput)
            }
          },
          executionTimeMs = baseExecutionTime,
          logFile = logFile)
    }

    println("Attempting AI-assisted recovery for failed test")

    val recoveryResult = agent.attemptAiRecovery(output, errorOutput)

    return if (recoveryResult.success) {
      println("AI recovery successful")
      ExecutionResult(
          success = true,
          exitCode = 0,
          output = "$output\n[AI Recovery Applied]",
          aiRecoveryAttempted = true,
          aiRecoverySuccessful = true,
          executionTimeMs = baseExecutionTime + recoveryResult.recoveryTimeMs,
          logFile = logFile)
    } else {
      println("AI recovery failed")
      ExecutionResult(
          success = false,
          exitCode = exitCode,
          output = output,
          errorMessage = buildString {
            append("AutoMobile CLI failed and AI recovery unsuccessful")
            if (errorOutput.isNotEmpty()) {
              append("\nErrors: ")
              append(errorOutput)
            }
          },
          aiRecoveryAttempted = true,
          aiRecoverySuccessful = false,
          executionTimeMs = baseExecutionTime + recoveryResult.recoveryTimeMs,
          logFile = logFile)
    }
  }

  /** Extract plan path from annotation - used by tests via reflection */
  private fun getPlanPath(annotation: AutoMobileTest): String {
    return if (annotation.plan.isNotEmpty()) {
      annotation.plan
    } else {
      throw IllegalArgumentException("Plan path not specified in annotation")
    }
  }

  /** Build AutoMobile command - used by tests via reflection */
  private fun buildAutoMobileCommand(planPath: String, annotation: AutoMobileTest): List<String> {
    // Phase 8: Pre-sized ArrayList to avoid list resizing
    val command = ArrayList<String>(10)
    val useBunx = SystemPropertyCache.getBoolean("automobile.use.bunx", true)

    // Check for local development version first (cached to avoid repeated filesystem checks)
    if (localAutoMobileExists()) {
      // Phase 8: Direct adds instead of addAll(listOf(...))
      command.add("bun")
      command.add(localAutoMobilePath)
      command.add("--cli")
    } else if (useBunx) {
      command.add("bunx")
      command.add("auto-mobile")
      command.add("--cli")
    } else {
      command.add("auto-mobile")
      command.add("--cli")
    }

    command.add("test")
    command.add("run")
    command.add(planPath)

    if (annotation.device != "auto") {
      command.add("--device")
      command.add(annotation.device)
    }

    val debugMode = SystemPropertyCache.getBoolean("automobile.debug", false)
    if (debugMode) {
      command.add("--debug")
    }

    return command
  }

  // Cached local AutoMobile file check to avoid repeated filesystem operations
  private fun localAutoMobileExists(): Boolean = localAutoMobileExistsCache ?: File(localAutoMobilePath).exists().also { localAutoMobileExistsCache = it }

  private val localAutoMobilePath: String
    get() = File("../../dist/src/index.js").absolutePath

  private var localAutoMobileExistsCache: Boolean? = null

  private data class ExecutionResult(
      val success: Boolean,
      val exitCode: Int,
      val output: String = "",
      val errorMessage: String = "",
      val executionTimeMs: Long = 0L,
      val aiRecoveryAttempted: Boolean = false,
      val aiRecoverySuccessful: Boolean = false,
      val logFile: File? = null
  )

  class AutoMobileTestException(message: String) : Exception(message)

  companion object {
    private val LOG_DIR = File("scratch/test-logs").apply {
      if (!exists()) {
        mkdirs()
      }
    }

    private const val MAX_LOGS_TO_KEEP = 10

    // Phase 7: Cache frequently used strings to avoid repeated allocations
    private val SEPARATOR_LONG = "=".repeat(80)
    private val SEPARATOR_SHORT = "-".repeat(80)

    // Phase 7: Thread-local SimpleDateFormat for log content (not filename - that uses compact format)
    private val logTimestampFormat: ThreadLocal<SimpleDateFormat> = ThreadLocal.withInitial {
      SimpleDateFormat("yyyy-MM-dd HH:mm:ss.SSS")
    }

    /**
     * Write test execution output to a log file in the scratch directory.
     * Returns the path to the log file.
     */
    fun writeTestLog(
        testName: String,
        className: String,
        stdout: String,
        stderr: String,
        exitCode: Int,
        executionTimeMs: Long,
        success: Boolean,
        performanceMeasurements: List<Pair<String, Long>> = emptyList()
    ): File {
      val timestamp = SimpleDateFormat("yyyyMMdd-HHmmss-SSS").format(Date())
      // Phase 6: Use cached regex patterns to avoid repeated compilation
      val sanitizationRegex = RegexCache.getRegex("[^a-zA-Z0-9_-]")
      val sanitizedTestName = testName.replace(sanitizationRegex, "_")
      val sanitizedClassName = className.replace(sanitizationRegex, "_")
      val logFile = File(LOG_DIR, "${timestamp}_${sanitizedClassName}_${sanitizedTestName}.log")

      val logContent = buildString {
        // Phase 7: Use cached separator strings instead of repeated string allocations
        appendLine(SEPARATOR_LONG)
        appendLine("Test Execution Log")
        appendLine(SEPARATOR_LONG)
        appendLine("Test Class: $className")
        appendLine("Test Method: $testName")
        appendLine("Timestamp: ${logTimestampFormat.get().format(Date())}")
        appendLine("Status: ${if (success) "SUCCESS" else "FAILED"}")
        appendLine("Exit Code: $exitCode")
        appendLine("Execution Time: ${executionTimeMs}ms")
        appendLine(SEPARATOR_LONG)
        appendLine()

        if (performanceMeasurements.isNotEmpty()) {
          appendLine("PERFORMANCE METRICS:")
          appendLine(SEPARATOR_SHORT)
          performanceMeasurements.forEach { (label, duration) ->
            appendLine("  $label: ${duration}ms")
          }
          appendLine(SEPARATOR_SHORT)
          appendLine()
        }

        if (stdout.isNotEmpty()) {
          appendLine("STDOUT:")
          appendLine(SEPARATOR_SHORT)
          appendLine(stdout)
          appendLine(SEPARATOR_SHORT)
          appendLine()
        }

        if (stderr.isNotEmpty()) {
          appendLine("STDERR:")
          appendLine(SEPARATOR_SHORT)
          appendLine(stderr)
          appendLine(SEPARATOR_SHORT)
          appendLine()
        }

        if (stdout.isEmpty() && stderr.isEmpty()) {
          appendLine("(No output captured)")
          appendLine()
        }

        appendLine(SEPARATOR_LONG)
        appendLine("End of Log")
        appendLine(SEPARATOR_LONG)
      }

      // Use async log writing to remove file I/O from critical path
      AsyncLogWriter.writeAsync(logFile, logContent) { writtenFile ->
        // Deferred cleanup: only run cleanup when log count > 2x threshold
        deferredCleanupOldLogs()
      }

      return logFile
    }

    /**
     * Deferred log cleanup - only runs cleanup when log count exceeds 2x the max threshold.
     * This avoids running cleanup on every test execution.
     */
    private fun deferredCleanupOldLogs() {
      val logFiles = LOG_DIR.listFiles { file -> file.isFile && file.extension == "log" }
          ?: return

      // Only cleanup when we have significantly more logs than needed (2x threshold)
      val cleanupThreshold = MAX_LOGS_TO_KEEP * 2
      if (logFiles.size > cleanupThreshold) {
        logFiles
            .sortedByDescending { it.lastModified() }
            .drop(MAX_LOGS_TO_KEEP)
            .forEach { it.delete() }
      }
    }
  }
}

/**
 * Thread-safe wrapper for RunNotifier to ensure synchronized access from parallel test threads.
 */
private class SynchronizedRunNotifier(private val delegate: RunNotifier) : RunNotifier() {

  @Synchronized
  override fun fireTestStarted(description: org.junit.runner.Description) {
    delegate.fireTestStarted(description)
  }

  @Synchronized
  override fun fireTestFinished(description: org.junit.runner.Description) {
    delegate.fireTestFinished(description)
  }

  @Synchronized
  override fun fireTestFailure(failure: Failure) {
    delegate.fireTestFailure(failure)
  }

  @Synchronized
  override fun fireTestAssumptionFailed(failure: Failure) {
    delegate.fireTestAssumptionFailed(failure)
  }

  @Synchronized
  override fun fireTestIgnored(description: org.junit.runner.Description) {
    delegate.fireTestIgnored(description)
  }

  @Synchronized
  override fun addListener(listener: org.junit.runner.notification.RunListener) {
    delegate.addListener(listener)
  }

  @Synchronized
  override fun removeListener(listener: org.junit.runner.notification.RunListener) {
    delegate.removeListener(listener)
  }
}
