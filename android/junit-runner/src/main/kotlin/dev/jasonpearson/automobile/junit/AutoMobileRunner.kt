package dev.jasonpearson.automobile.junit

import java.io.File
import java.text.SimpleDateFormat
import java.util.Date
import java.util.UUID
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import kotlin.jvm.java
import kotlin.random.Random
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.runner.notification.Failure
import org.junit.runner.notification.RunNotifier
import org.junit.runners.BlockJUnit4ClassRunner
import org.junit.runners.model.FrameworkMethod

/**
 * Custom JUnit runner for executing AutoMobile YAML test plans.
 *
 * This runner detects @AutoMobileTest annotations, executes the specified YAML plans via the
 * AutoMobile daemon socket, and provides AI-assisted failure recovery. When no plan is provided but
 * a prompt is specified with AI assistance enabled, it generates a YAML plan from the prompt using
 * the AI agent via AutoMobile MCP server.
 */
class AutoMobileRunner(private val klass: Class<*>) : BlockJUnit4ClassRunner(klass) {

  // Use companion object for testability - allows tests to inject a fake connectivity checker
  private val connectivityChecker: DaemonConnectivityChecker
    get() = testConnectivityChecker ?: DefaultDaemonConnectivityChecker()

  // Phase 4: Lazy initialization of AutoMobileAgent (only initialized if AI assistance needed)
  private val agent: AutoMobileAgent
    get() = LazyInitializer.getAgent()

  private val orderedChildren: List<FrameworkMethod> by lazy {
    val children = super.getChildren()

    val requestedStrategy =
        parseTimingOrderingStrategy(
            SystemPropertyCache.get("automobile.junit.timing.ordering", "auto").trim().lowercase()
        )
    val parallelForks =
        if (requestedStrategy == TimingOrderingStrategy.AUTO) {
          resolveEffectiveParallelForks()
        } else {
          1
        }
    val selection = resolveTimingOrderingSelection(requestedStrategy, parallelForks)
    val timingAvailable = TestTimingCache.hasTimings()
    logTimingOrdering(selection, timingAvailable)

    val timingOrderingActive = selection.resolved != TimingOrderingStrategy.NONE && timingAvailable
    val timingOrderedChildren =
        if (!timingOrderingActive) {
          children
        } else {
          orderChildrenByTiming(children, selection.resolved)
        }

    val shuffleEnabled = SystemPropertyCache.getBoolean("automobile.junit.shuffle.enabled", true)
    if (!shuffleEnabled || timingOrderedChildren.size <= 1 || timingOrderingActive) {
      if (shuffleEnabled && timingOrderingActive) {
        println(
            "AutoMobileRunner: Shuffle enabled but timing ordering is active; preserving timing order."
        )
      }
      timingOrderedChildren
    } else {
      val seedProperty = SystemPropertyCache.get("automobile.junit.shuffle.seed", "").trim()
      val seed = seedProperty.toLongOrNull() ?: System.currentTimeMillis()
      println("AutoMobileRunner: Shuffling test order with seed=$seed")
      timingOrderedChildren.shuffled(Random(seed))
    }
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
    val heartbeat = DaemonHeartbeat.startBackground()
    try {
      super.run(notifier)
    } finally {
      heartbeat.close()
    }
  }

  override fun getChildren(): List<FrameworkMethod> {
    return orderedChildren
  }

  private enum class TimingOrderingStrategy(val label: String) {
    NONE("none"),
    AUTO("auto"),
    DURATION_ASC("shortest-first"),
    DURATION_DESC("longest-first"),
  }

  private data class TimingOrderingSelection(
      val requested: TimingOrderingStrategy,
      val resolved: TimingOrderingStrategy,
  )

  private data class TimingCandidate(
      val method: FrameworkMethod,
      val index: Int,
      val durationMs: Int?,
  )

  private fun parseTimingOrderingStrategy(rawValue: String): TimingOrderingStrategy {
    return when (rawValue) {
      "auto" -> TimingOrderingStrategy.AUTO
      "duration-asc",
      "duration_asc",
      "shortest-first",
      "shortest_first",
      "shortest" -> TimingOrderingStrategy.DURATION_ASC
      "duration-desc",
      "duration_desc",
      "longest-first",
      "longest_first",
      "longest" -> TimingOrderingStrategy.DURATION_DESC
      "none",
      "off",
      "false",
      "disabled" -> TimingOrderingStrategy.NONE
      else -> TimingOrderingStrategy.NONE
    }
  }

  private fun resolveTimingOrderingSelection(
      requested: TimingOrderingStrategy,
      parallelForks: Int,
  ): TimingOrderingSelection {
    val resolved =
        when (requested) {
          TimingOrderingStrategy.AUTO ->
              if (parallelForks > 1) {
                TimingOrderingStrategy.DURATION_DESC
              } else {
                TimingOrderingStrategy.DURATION_ASC
              }
          else -> requested
        }
    return TimingOrderingSelection(requested, resolved)
  }

  private fun resolveEffectiveParallelForks(): Int {
    val configuredForks =
        SystemPropertyCache.get(
                "junit.parallel.forks",
                Runtime.getRuntime().availableProcessors().toString(),
            )
            .toIntOrNull() ?: 2
    val safeConfiguredForks = if (configuredForks > 0) configuredForks else 1
    val deviceCount = AutoMobileSharedUtils.deviceChecker.getDeviceCount()
    return if (deviceCount > 0) {
      safeConfiguredForks.coerceAtMost(deviceCount)
    } else {
      safeConfiguredForks
    }
  }

  private fun logTimingOrdering(selection: TimingOrderingSelection, timingAvailable: Boolean) {
    val message =
        if (selection.requested == TimingOrderingStrategy.AUTO) {
          "AutoMobileRunner: Timing ordering=auto (resolved=${selection.resolved.label}), timing data available=$timingAvailable"
        } else {
          "AutoMobileRunner: Timing ordering=${selection.requested.label}, timing data available=$timingAvailable"
        }
    println(message)
  }

  private fun orderChildrenByTiming(
      children: List<FrameworkMethod>,
      strategy: TimingOrderingStrategy,
  ): List<FrameworkMethod> {
    if (strategy == TimingOrderingStrategy.NONE || children.isEmpty()) {
      return children
    }

    val className = klass.simpleName
    val candidates =
        children.mapIndexed { index, method ->
          TimingCandidate(
              method = method,
              index = index,
              durationMs = TestTimingCache.getTiming(className, method.name)?.averageDurationMs,
          )
        }

    val withTiming = candidates.filter { it.durationMs != null }
    val withoutTiming = candidates.filter { it.durationMs == null }

    if (withTiming.isEmpty()) {
      return children
    }

    val sortedWithTiming =
        when (strategy) {
          TimingOrderingStrategy.DURATION_DESC ->
              withTiming.sortedWith(
                  compareByDescending<TimingCandidate> { it.durationMs }.thenBy { it.index }
              )
          TimingOrderingStrategy.DURATION_ASC ->
              withTiming.sortedWith(
                  compareBy<TimingCandidate> { it.durationMs }.thenBy { it.index }
              )
          TimingOrderingStrategy.AUTO,
          TimingOrderingStrategy.NONE -> withTiming
        }

    val sortedWithoutTiming = withoutTiming.sortedBy { it.index }

    return sortedWithTiming.map { it.method } + sortedWithoutTiming.map { it.method }
  }

  override fun childrenInvoker(notifier: RunNotifier): org.junit.runners.model.Statement {
    // Get max parallel forks from system property, default to number of available processors
    val configuredForks =
        SystemPropertyCache.get(
                "junit.parallel.forks",
                Runtime.getRuntime().availableProcessors().toString(),
            )
            .toIntOrNull() ?: 2

    // Limit parallelism to the number of available devices to prevent contention
    // This ensures tests don't compete for limited device resources
    val deviceCount = AutoMobileSharedUtils.deviceChecker.getDeviceCount()
    val maxParallelForks =
        if (deviceCount > 0) {
          val effectiveForks = configuredForks.coerceAtMost(deviceCount)
          if (effectiveForks < configuredForks) {
            println(
                "AutoMobileRunner: Limiting parallelism from $configuredForks to $effectiveForks (only $deviceCount device(s) available)"
            )
          }
          effectiveForks
        } else {
          // No devices detected - fall back to configured value (tests may fail or be skipped)
          configuredForks
        }

    val children = getChildren()

    println(
        "AutoMobileRunner: childrenInvoker called with ${children.size} children, maxParallelForks=$maxParallelForks, deviceCount=$deviceCount"
    )

    // Only parallelize if we have multiple children and parallelism is enabled
    if (children.size <= 1 || maxParallelForks <= 1) {
      println(
          "AutoMobileRunner: Using SEQUENTIAL execution (children=${children.size}, forks=$maxParallelForks)"
      )
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
          val futures =
              children.map { child ->
                executor.submit {
                  println(
                      "[${Thread.currentThread().name}] Starting test: ${describeChild(child).methodName}"
                  )
                  // Synchronize notifier access to ensure thread safety
                  runChild(child, SynchronizedRunNotifier(notifier))
                  println(
                      "[${Thread.currentThread().name}] Finished test: ${describeChild(child).methodName}"
                  )
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
    val className = klass.simpleName

    if (autoMobileTest != null) {
      MemoryMonitor.onTestStart(className, method.name)
      runAutoMobileTest(method, autoMobileTest, notifier)
    } else {
      MemoryMonitor.onTestStart(className, method.name)
      val outcomeNotifier = OutcomeTrackingRunNotifier(notifier)
      try {
        super.runChild(method, outcomeNotifier)
      } catch (e: Exception) {
        outcomeNotifier.recordFailure(e.message)
        throw e
      } finally {
        MemoryMonitor.onTestFinish(
            className,
            method.name,
            outcomeNotifier.wasSuccessful(),
            outcomeNotifier.failureMessage(),
        )
      }
    }
  }

  private fun runAutoMobileTest(
      method: FrameworkMethod,
      annotation: AutoMobileTest,
      notifier: RunNotifier,
  ) {
    val description = describeChild(method)
    notifier.fireTestStarted(description)
    var success = true
    var failureMessage: String? = null

    try {
      if (annotation.cleanupAfter && annotation.appId.isBlank()) {
        println(
            "[WARNING] AutoMobile test ${method.name} requested cleanup but appId is blank; skipping cleanup."
        )
      }
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
        success = false
        failureMessage = result.errorMessage.ifBlank { "AutoMobile test failed" }
        val failure = Failure(description, AutoMobileTestException(errorMessage))
        notifier.fireTestFailure(failure)
      }
    } catch (e: Exception) {
      println("Error running AutoMobile test ${method.name}: ${e.message}")
      success = false
      failureMessage = e.message
      val failure = Failure(description, e)
      notifier.fireTestFailure(failure)
    } finally {
      notifier.fireTestFinished(description)
      MemoryMonitor.onTestFinish(klass.simpleName, method.name, success, failureMessage)
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
              "Either 'plan' or 'prompt' (with aiAssistance=true) must be specified in @AutoMobileTest"
          )
    }
  }

  private fun generatePlanFromPrompt(method: FrameworkMethod, annotation: AutoMobileTest): String {
    val className = klass.simpleName
    val methodName = method.name

    // Get test resources directory
    val testResourcesDir =
        File(
            klass.classLoader.getResource(".")?.toURI()
                ?: throw RuntimeException("Cannot find test resources directory")
        )

    return agent.generatePlanFromPrompt(annotation.prompt, className, methodName, testResourcesDir)
  }

  private fun resolvePlanPath(planPath: String): String {
    // Check cache first to avoid repeated classpath resolution
    PlanCache.getCachedPath(planPath)?.let {
      return it
    }

    val classLoader = klass.classLoader
    val resource =
        classLoader.getResource(planPath)
            ?: throw IllegalArgumentException("YAML plan not found in test resources: $planPath")

    val resolvedPath = File(resource.toURI()).path
    PlanCache.cachePath(planPath, resolvedPath)
    return resolvedPath
  }

  private fun executeAutoMobilePlan(
      planPath: String,
      annotation: AutoMobileTest,
      testName: String,
  ): ExecutionResult {
    val startTime = System.currentTimeMillis()
    val json = Json { ignoreUnknownKeys = true }

    try {
      // Read the YAML plan content (with caching for repeated plans)
      val planReadStart = System.currentTimeMillis()
      val planContent =
          PlanCache.getCachedContent(planPath)
              ?: run {
                val content = File(planPath).readText()
                PlanCache.cacheContent(planPath, content)
                content
              }
      PerformanceTracker.measure("Plan file read", planReadStart)

      // Base64 encode the plan content to safely pass through command line
      val base64Start = System.currentTimeMillis()
      val base64Content = java.util.Base64.getEncoder().encodeToString(planContent.toByteArray())
      PerformanceTracker.measure("Base64 encoding", base64Start)

      val debugMode = SystemPropertyCache.getBoolean("automobile.debug", false)
      val maxRetries = annotation.maxRetries.coerceAtLeast(0)
      var attempt = 0
      var response: DaemonResponse
      var parseResult: ParsedToolResult
      var outputPayload: String
      var errorMessage: String?
      var executionTime = 0L

      while (true) {
        attempt++
        // Generate unique session UUID for this attempt to enable proper device assignment
        val sessionUuid = UUID.randomUUID().toString()
        println(
            "[${Thread.currentThread().name}] Generated session UUID: $sessionUuid for test: $testName (attempt $attempt)"
        )

        val requestBuildStart = System.currentTimeMillis()
        val daemonRequestArgs =
            buildDaemonExecutePlanArgs(
                base64Content,
                annotation,
                sessionUuid,
                testName,
                klass.simpleName,
            )
        PerformanceTracker.measure("Daemon request build", requestBuildStart)

        if (debugMode) {
          println("Executing via daemon socket: executePlan")
        }

        DaemonHeartbeat.registerSession(sessionUuid)
        val execStart = System.currentTimeMillis()
        response =
            try {
              DaemonSocketClientManager.callTool(
                  "executePlan",
                  daemonRequestArgs,
                  annotation.timeoutMs,
              )
            } finally {
              DaemonHeartbeat.unregisterSession(sessionUuid)
            }
        PerformanceTracker.measure("Daemon request execution", execStart)

        // Verify daemon is still alive after test execution
        // This helps detect if the daemon crashed or was killed by heartbeat timeout
        verifyDaemonHealth(testName)

        executionTime = System.currentTimeMillis() - startTime

        outputPayload =
            response.result?.let { json.encodeToString(JsonElement.serializer(), it) } ?: ""
        parseResult = parseDaemonToolResult(response, json)
        errorMessage = response.error ?: parseResult.errorMessage

        val success = response.success && parseResult.success
        if (success) {
          break
        }

        if (attempt > maxRetries || !shouldRetry(errorMessage)) {
          break
        }

        println(
            "[${Thread.currentThread().name}] Retrying AutoMobile plan after error: $errorMessage"
        )
        PerformanceTracker.clear()
        Thread.sleep(RETRY_BACKOFF_MS)
      }

      // Write log file for this test execution
      val logWriteStart = System.currentTimeMillis()
      val logFile =
          writeTestLog(
              testName = testName,
              className = klass.simpleName,
              stdout = outputPayload,
              stderr = errorMessage ?: "",
              exitCode = if (response.success && parseResult.success) 0 else 1,
              executionTimeMs = executionTime,
              success = response.success && parseResult.success,
              performanceMeasurements = PerformanceTracker.getMeasurements(),
          )
      PerformanceTracker.measure("Log file write", logWriteStart)

      if (debugMode) {
        println("Test output written to: ${logFile.absolutePath}")
      }

      val finalResult =
          if (response.success && parseResult.success) {
            ExecutionResult(
                success = true,
                exitCode = 0,
                output = outputPayload,
                executionTimeMs = executionTime,
                logFile = logFile,
            )
          } else {
            handleFailure(
                annotation,
                1,
                outputPayload,
                response.error ?: parseResult.errorMessage,
                executionTime,
                logFile,
            )
          }

      return finalResult
    } catch (e: Exception) {
      val executionTime = System.currentTimeMillis() - startTime
      println("Error executing AutoMobile plan: ${e.message}")

      return ExecutionResult(
          success = false,
          exitCode = -1,
          errorMessage = e.message ?: "Unknown error",
          executionTimeMs = executionTime,
      )
    } finally {
      PerformanceTracker.clear()
    }
  }

  private fun shouldRetry(errorMessage: String?): Boolean {
    if (errorMessage.isNullOrBlank()) {
      return false
    }
    val normalized = errorMessage.lowercase()
    return normalized.contains("request timed out") ||
        normalized.contains("plan execution in progress") ||
        normalized.contains("daemon request timeout")
  }

  private fun buildDaemonExecutePlanArgs(
      base64PlanContent: String,
      annotation: AutoMobileTest,
      sessionUuid: String,
      testName: String,
      className: String,
  ): JsonObject {
    val values =
        mutableMapOf<String, kotlinx.serialization.json.JsonElement>(
            "planContent" to JsonPrimitive("base64:$base64PlanContent"),
            "platform" to JsonPrimitive("android"),
            "startStep" to JsonPrimitive(0),
            "sessionUuid" to JsonPrimitive(sessionUuid),
        )

    values["testMetadata"] = buildTestMetadata(testName, className)

    if (annotation.device != "auto") {
      values["deviceId"] = JsonPrimitive(annotation.device)
    }

    if (annotation.cleanupAfter && annotation.appId.isNotBlank()) {
      values["cleanupAppId"] = JsonPrimitive(annotation.appId)
      values["cleanupClearAppData"] = JsonPrimitive(annotation.clearAppData)
    }

    return JsonObject(values)
  }

  private fun buildTestMetadata(testName: String, className: String): JsonObject {
    val metadata =
        mutableMapOf<String, kotlinx.serialization.json.JsonElement>(
            "testClass" to JsonPrimitive(className),
            "testMethod" to JsonPrimitive(testName),
            "isCi" to JsonPrimitive(resolveCiMode()),
        )

    // @deprecated AUTO_MOBILE_APP_VERSION - use AUTOMOBILE_APP_VERSION instead
    val appVersion =
        firstNonBlank(
            SystemPropertyCache.get("automobile.app.version", ""),
            System.getenv("AUTOMOBILE_APP_VERSION"),
            System.getenv("AUTO_MOBILE_APP_VERSION"),
            System.getenv("APP_VERSION"),
        )
    if (appVersion != null) {
      metadata["appVersion"] = JsonPrimitive(appVersion)
    }

    // @deprecated AUTO_MOBILE_GIT_COMMIT - use AUTOMOBILE_GIT_COMMIT instead
    val gitCommit =
        firstNonBlank(
            SystemPropertyCache.get("automobile.git.commit", ""),
            System.getenv("AUTOMOBILE_GIT_COMMIT"),
            System.getenv("AUTO_MOBILE_GIT_COMMIT"),
            System.getenv("GITHUB_SHA"),
            System.getenv("GIT_COMMIT"),
            System.getenv("CI_COMMIT_SHA"),
        )
    if (gitCommit != null) {
      metadata["gitCommit"] = JsonPrimitive(gitCommit)
    }

    val targetSdk = resolveTargetSdk()
    if (targetSdk != null) {
      metadata["targetSdk"] = JsonPrimitive(targetSdk)
    }

    val jdkVersion =
        firstNonBlank(
            System.getProperty("java.version"),
            System.getProperty("java.runtime.version"),
        )
    if (jdkVersion != null) {
      metadata["jdkVersion"] = JsonPrimitive(jdkVersion)
    }

    val jvmTarget =
        firstNonBlank(
            System.getProperty("kotlin.jvm.target"),
            System.getProperty("java.specification.version"),
        )
    if (jvmTarget != null) {
      metadata["jvmTarget"] = JsonPrimitive(jvmTarget)
    }

    val gradleVersion =
        firstNonBlank(
            System.getProperty("org.gradle.version"),
            System.getProperty("gradle.version"),
        )
    if (gradleVersion != null) {
      metadata["gradleVersion"] = JsonPrimitive(gradleVersion)
    }

    return JsonObject(metadata)
  }

  // @deprecated AUTO_MOBILE_TARGET_SDK - use AUTOMOBILE_TARGET_SDK instead
  private fun resolveTargetSdk(): Int? {
    val candidate =
        firstNonBlank(
            SystemPropertyCache.get("automobile.android.targetSdk", ""),
            SystemPropertyCache.get("automobile.targetSdk", ""),
            System.getenv("AUTOMOBILE_TARGET_SDK"),
            System.getenv("AUTO_MOBILE_TARGET_SDK"),
            System.getenv("ANDROID_TARGET_SDK"),
        )
    return candidate?.toIntOrNull()
  }

  private fun resolveCiMode(): Boolean {
    if (SystemPropertyCache.getBoolean("automobile.ci.mode", false)) {
      return true
    }
    val envValue = System.getenv("CI") ?: return false
    return envValue.equals("true", ignoreCase = true) || envValue == "1"
  }

  private fun firstNonBlank(vararg values: String?): String? {
    return values.firstOrNull { !it.isNullOrBlank() }
  }

  private fun buildFailureMessage(
      failedStep: FailedStepInfo?,
      executedSteps: Int?,
      totalSteps: Int?,
      fallbackError: String?,
  ): String {
    return buildString {
      if (failedStep != null) {
        append("Test plan execution failed at step ${failedStep.stepIndex + 1} (${failedStep.tool}):")
        append("\n  Error: ${failedStep.error}")
        if (executedSteps != null && totalSteps != null) {
          append("\n  Executed: $executedSteps/$totalSteps steps")
        }
        if (failedStep.device != null) {
          append("\n  Device: ${failedStep.device}")
        }
      } else {
        append(fallbackError ?: "AutoMobile plan failed")
      }
    }
  }

  private fun parseDaemonToolResult(response: DaemonResponse, json: Json): ParsedToolResult {
    if (!response.success) {
      return ParsedToolResult(false, response.error ?: "Daemon returned failure")
    }

    val resultElement =
        response.result ?: return ParsedToolResult(false, "Daemon returned empty result")

    val resultObject = resultElement.jsonObject
    val contentArray = resultObject["content"]
    if (contentArray is JsonArray && contentArray.isNotEmpty()) {
      val first = contentArray[0].jsonObject
      val type = first["type"]?.jsonPrimitive?.content
      if (type == "text") {
        val text = first["text"]?.jsonPrimitive?.content
        if (text != null) {
          val parsed = json.parseToJsonElement(text).jsonObject
          val success = parsed["success"]?.jsonPrimitive?.content?.toBooleanStrictOrNull()
          if (success == true) {
            return ParsedToolResult(true, "")
          }
          val failedStepObj = parsed["failedStep"]?.jsonObject
          val failedStep =
              if (failedStepObj != null) {
                FailedStepInfo(
                    stepIndex =
                        failedStepObj["stepIndex"]?.jsonPrimitive?.content?.toIntOrNull() ?: 0,
                    tool = failedStepObj["tool"]?.jsonPrimitive?.content ?: "unknown",
                    error =
                        failedStepObj["error"]?.jsonPrimitive?.content ?: "Unknown step error",
                    device = failedStepObj["device"]?.jsonPrimitive?.content,
                )
              } else {
                null
              }
          val executedSteps = parsed["executedSteps"]?.jsonPrimitive?.content?.toIntOrNull()
          val totalSteps = parsed["totalSteps"]?.jsonPrimitive?.content?.toIntOrNull()
          val fallbackError = parsed["error"]?.jsonPrimitive?.content

          val errorMessage =
              buildFailureMessage(failedStep, executedSteps, totalSteps, fallbackError)
          return ParsedToolResult(false, errorMessage)
        }
      }
    }

    return ParsedToolResult(false, "Unexpected daemon response format")
  }

  private fun handleFailure(
      annotation: AutoMobileTest,
      exitCode: Int,
      output: String,
      errorOutput: String,
      baseExecutionTime: Long,
      logFile: File,
  ): ExecutionResult {

    val ciMode = SystemPropertyCache.getBoolean("automobile.ci.mode", false)
    if (!annotation.aiAssistance || ciMode) {
      println("AI assistance disabled or in CI mode, marking test as failed")
      return ExecutionResult(
          success = false,
          exitCode = exitCode,
          output = output,
          errorMessage =
              buildString {
                append("AutoMobile plan execution failed with exit code ")
                append(exitCode)
                if (errorOutput.isNotEmpty()) {
                  append("\nErrors: ")
                  append(errorOutput)
                }
              },
          executionTimeMs = baseExecutionTime,
          logFile = logFile,
      )
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
          logFile = logFile,
      )
    } else {
      println("AI recovery failed")
      ExecutionResult(
          success = false,
          exitCode = exitCode,
          output = output,
          errorMessage =
              buildString {
                append("AutoMobile plan execution failed and AI recovery unsuccessful")
                if (errorOutput.isNotEmpty()) {
                  append("\nErrors: ")
                  append(errorOutput)
                }
              },
          aiRecoveryAttempted = true,
          aiRecoverySuccessful = false,
          executionTimeMs = baseExecutionTime + recoveryResult.recoveryTimeMs,
          logFile = logFile,
      )
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

  /**
   * Verify the daemon is still alive after test execution. This helps detect if the daemon crashed
   * or was killed by heartbeat timeout. Logs a warning if the daemon is not responding, which aids
   * debugging.
   */
  private fun verifyDaemonHealth(testName: String) {
    val checker = connectivityChecker
    if (!checker.isDaemonAlive()) {
      println("[WARNING] Daemon is no longer responding after test: $testName")
      println("[WARNING] This may indicate the daemon crashed or was killed by heartbeat timeout.")
      println(
          "[WARNING] Subsequent tests may fail. Consider increasing heartbeat timeout or checking daemon logs."
      )
    }
  }

  private data class ExecutionResult(
      val success: Boolean,
      val exitCode: Int,
      val output: String = "",
      val errorMessage: String = "",
      val executionTimeMs: Long = 0L,
      val aiRecoveryAttempted: Boolean = false,
      val aiRecoverySuccessful: Boolean = false,
      val logFile: File? = null,
  )

  private data class FailedStepInfo(
      val stepIndex: Int,
      val tool: String,
      val error: String,
      val device: String?,
  )

  private data class ParsedToolResult(val success: Boolean, val errorMessage: String)

  class AutoMobileTestException(message: String) : Exception(message)

  companion object {
    /**
     * Injectable connectivity checker for testing. Set this to a fake implementation before running
     * tests to verify daemon health check behavior.
     */
    @JvmStatic internal var testConnectivityChecker: DaemonConnectivityChecker? = null

    private val LOG_DIR =
        File("scratch/test-logs").apply {
          if (!exists()) {
            mkdirs()
          }
        }

    private const val MAX_LOGS_TO_KEEP = 10
    private const val RETRY_BACKOFF_MS = 2000L

    // Phase 7: Cache frequently used strings to avoid repeated allocations
    private val SEPARATOR_LONG = "=".repeat(80)
    private val SEPARATOR_SHORT = "-".repeat(80)

    // Phase 7: Thread-local SimpleDateFormat for log content (not filename - that uses compact
    // format)
    private val logTimestampFormat: ThreadLocal<SimpleDateFormat> =
        ThreadLocal.withInitial { SimpleDateFormat("yyyy-MM-dd HH:mm:ss.SSS") }

    /**
     * Write test execution output to a log file in the scratch directory. Returns the path to the
     * log file.
     */
    fun writeTestLog(
        testName: String,
        className: String,
        stdout: String,
        stderr: String,
        exitCode: Int,
        executionTimeMs: Long,
        success: Boolean,
        performanceMeasurements: List<Pair<String, Long>> = emptyList(),
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
     * Deferred log cleanup - only runs cleanup when log count exceeds 2x the max threshold. This
     * avoids running cleanup on every test execution.
     */
    private fun deferredCleanupOldLogs() {
      val logFiles = LOG_DIR.listFiles { file -> file.isFile && file.extension == "log" } ?: return

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

/** Thread-safe wrapper for RunNotifier to ensure synchronized access from parallel test threads. */
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

private class OutcomeTrackingRunNotifier(private val delegate: RunNotifier) : RunNotifier() {
  @Volatile private var failed = false
  @Volatile private var failureMessage: String? = null

  fun wasSuccessful(): Boolean {
    return !failed
  }

  fun failureMessage(): String? {
    return failureMessage
  }

  fun recordFailure(message: String?) {
    if (!failed) {
      failed = true
      failureMessage = message
    }
  }

  override fun fireTestStarted(description: org.junit.runner.Description) {
    delegate.fireTestStarted(description)
  }

  override fun fireTestFinished(description: org.junit.runner.Description) {
    delegate.fireTestFinished(description)
  }

  override fun fireTestFailure(failure: Failure) {
    recordFailure(failure.message)
    delegate.fireTestFailure(failure)
  }

  override fun fireTestAssumptionFailed(failure: Failure) {
    delegate.fireTestAssumptionFailed(failure)
  }

  override fun fireTestIgnored(description: org.junit.runner.Description) {
    delegate.fireTestIgnored(description)
  }

  override fun addListener(listener: org.junit.runner.notification.RunListener) {
    delegate.addListener(listener)
  }

  override fun removeListener(listener: org.junit.runner.notification.RunListener) {
    delegate.removeListener(listener)
  }
}
