package dev.jasonpearson.automobile.junit

import java.io.File
import java.text.SimpleDateFormat
import java.util.Date
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

  private val agent = AutoMobileAgent()

  init {
    AutoMobileSharedUtils.deviceChecker.checkDeviceAvailability()
  }

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

      println("Running AutoMobile test: ${method.name} with plan: $planPath")

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
    val classLoader = klass.classLoader
    val resource =
        classLoader.getResource(planPath)
            ?: throw IllegalArgumentException("YAML plan not found in test resources: $planPath")

    return File(resource.toURI()).path
  }

  private fun executeAutoMobilePlan(planPath: String, annotation: AutoMobileTest, testName: String): ExecutionResult {
    val startTime = System.currentTimeMillis()
    val debugMode = System.getProperty("automobile.debug", "false").toBoolean()

    try {
      if (debugMode) {
        println("=== JUNIT RUNNER - START ===")
        println("Test Class: ${klass.simpleName}")
        println("Test Method: $testName")
        println("Plan Path: $planPath")
        println("Device: ${annotation.device}")
        println("Timeout: ${annotation.timeoutMs}ms")
        println("AI Assistance: ${annotation.aiAssistance}")
      }

      // Read the YAML plan content
      val planContent = File(planPath).readText()

      if (debugMode) {
        println("Plan content length: ${planContent.length} bytes")
      }

      // Base64 encode the plan content to safely pass through command line
      val base64Content = java.util.Base64.getEncoder().encodeToString(planContent.toByteArray())

      if (debugMode) {
        println("Base64 encoded length: ${base64Content.length} bytes")
      }

      val command = buildAutoMobileExecutePlanCommand(base64Content, annotation)

      println("Executing command: ${command.joinToString(" ")}")

      val executionStartTime = System.currentTimeMillis()
      val result = AutoMobileSharedUtils.executeCommand(command, annotation.timeoutMs)
      val commandExecutionTime = System.currentTimeMillis() - executionStartTime
      val executionTime = System.currentTimeMillis() - startTime

      if (debugMode) {
        println("=== Execution Result ===")
        println("Command Execution Time: ${commandExecutionTime}ms")
        println("Total Execution Time: ${executionTime}ms")
        println("Exit Code: ${result.exitCode}")
        println("Output Length: ${result.output.length} bytes")
        println("Error Output Length: ${result.errorOutput.length} bytes")
        println("\nAutoMobile CLI output:\n${result.output}")
        if (result.errorOutput.isNotEmpty()) {
          println("\nAutoMobile CLI errors:\n${result.errorOutput}")
        }
      }

      // Write log file for this test execution
      val logFile = writeTestLog(
          testName = testName,
          className = klass.simpleName,
          stdout = result.output,
          stderr = result.errorOutput,
          exitCode = result.exitCode,
          executionTimeMs = executionTime,
          success = result.exitCode == 0
      )

      println("Test output written to: ${logFile.absolutePath}")

      val finalResult = if (result.exitCode == 0) {
        if (debugMode) {
          println("=== JUNIT RUNNER - COMPLETED SUCCESSFULLY ===")
        }
        ExecutionResult(
            success = true,
            exitCode = result.exitCode,
            output = result.output,
            executionTimeMs = executionTime,
            logFile = logFile)
      } else {
        if (debugMode) {
          println("=== Execution Failed - Handling Failure ===")
        }
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

      if (debugMode) {
        println("=== JUNIT RUNNER - FAILED WITH EXCEPTION ===")
        println("Exception: ${e.message}")
        e.printStackTrace()
      }

      return ExecutionResult(
          success = false,
          exitCode = -1,
          errorMessage = e.message ?: "Unknown error",
          executionTimeMs = executionTime)
    }
  }

  private fun buildAutoMobileExecutePlanCommand(
      base64PlanContent: String,
      annotation: AutoMobileTest
  ): List<String> {
    val command = mutableListOf("npx", "auto-mobile", "--cli")

    // Read system properties dynamically to allow test configuration
    val debugMode = System.getProperty("automobile.debug", "false").toBoolean()

    command.add("executePlan")
    // Pass base64-encoded plan content prefixed with "base64:" to indicate encoding
    command.addAll(listOf("--planContent", "base64:$base64PlanContent"))
    command.addAll(listOf("--platform", "android"))

    if (annotation.device != "auto") {
      command.addAll(listOf("--device", annotation.device))
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

    val ciMode = System.getProperty("automobile.ci.mode", "false").toBoolean()
    if (!annotation.aiAssistance || ciMode) {
      println("AI assistance disabled or in CI mode, marking test as failed")
      return ExecutionResult(
          success = false,
          exitCode = exitCode,
          output = output,
          errorMessage =
              "AutoMobile CLI failed with exit code $exitCode" +
                  if (errorOutput.isNotEmpty()) "\nErrors: $errorOutput" else "",
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
          errorMessage =
              "AutoMobile CLI failed and AI recovery unsuccessful" +
                  if (errorOutput.isNotEmpty()) "\nErrors: $errorOutput" else "",
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
    val command = mutableListOf<String>()
    val useNpx = System.getProperty("automobile.use.npx", "true").toBoolean()

    if (useNpx) {
      command.addAll(listOf("npx", "auto-mobile", "--cli"))
    } else {
      command.addAll(listOf("auto-mobile", "--cli"))
    }

    command.addAll(listOf("test", "run", planPath))

    if (annotation.device != "auto") {
      command.addAll(listOf("--device", annotation.device))
    }

    val debugMode = System.getProperty("automobile.debug", "false").toBoolean()
    if (debugMode) {
      command.add("--debug")
    }

    return command
  }

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
        success: Boolean
    ): File {
      val timestamp = SimpleDateFormat("yyyyMMdd-HHmmss-SSS").format(Date())
      val sanitizedTestName = testName.replace(Regex("[^a-zA-Z0-9_-]"), "_")
      val sanitizedClassName = className.replace(Regex("[^a-zA-Z0-9_-]"), "_")
      val logFile = File(LOG_DIR, "${timestamp}_${sanitizedClassName}_${sanitizedTestName}.log")

      val logContent = buildString {
        appendLine("=".repeat(80))
        appendLine("Test Execution Log")
        appendLine("=".repeat(80))
        appendLine("Test Class: $className")
        appendLine("Test Method: $testName")
        appendLine("Timestamp: ${SimpleDateFormat("yyyy-MM-dd HH:mm:ss.SSS").format(Date())}")
        appendLine("Status: ${if (success) "SUCCESS" else "FAILED"}")
        appendLine("Exit Code: $exitCode")
        appendLine("Execution Time: ${executionTimeMs}ms")
        appendLine("=".repeat(80))
        appendLine()

        if (stdout.isNotEmpty()) {
          appendLine("STDOUT:")
          appendLine("-".repeat(80))
          appendLine(stdout)
          appendLine("-".repeat(80))
          appendLine()
        }

        if (stderr.isNotEmpty()) {
          appendLine("STDERR:")
          appendLine("-".repeat(80))
          appendLine(stderr)
          appendLine("-".repeat(80))
          appendLine()
        }

        if (stdout.isEmpty() && stderr.isEmpty()) {
          appendLine("(No output captured)")
          appendLine()
        }

        appendLine("=".repeat(80))
        appendLine("End of Log")
        appendLine("=".repeat(80))
      }

      logFile.writeText(logContent)
      cleanupOldLogs()

      return logFile
    }

    /**
     * Clean up old log files, keeping only the most recent MAX_LOGS_TO_KEEP files.
     */
    private fun cleanupOldLogs() {
      val logFiles = LOG_DIR.listFiles { file -> file.isFile && file.extension == "log" }
          ?: return

      if (logFiles.size > MAX_LOGS_TO_KEEP) {
        logFiles
            .sortedByDescending { it.lastModified() }
            .drop(MAX_LOGS_TO_KEEP)
            .forEach { it.delete() }
      }
    }
  }
}
