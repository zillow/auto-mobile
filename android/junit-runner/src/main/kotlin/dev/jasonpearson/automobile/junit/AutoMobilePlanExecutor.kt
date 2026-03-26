package dev.jasonpearson.automobile.junit

import dev.jasonpearson.automobile.validation.ErrorToolResult
import dev.jasonpearson.automobile.validation.ToolResult
import dev.jasonpearson.automobile.validation.ToolResultEntry
import dev.jasonpearson.automobile.validation.ToolResultParser
import java.io.File
import java.util.UUID
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Test

/**
 * Internal executor class that handles the actual execution of AutoMobile plans with parameter
 * substitution, daemon socket integration, and AI-assisted recovery via Koog.
 */
internal object AutoMobilePlanExecutor {

  /** Injectable agent for testing. When null, uses [LazyInitializer.getAgent]. */
  @JvmStatic internal var testAgent: AutoMobileAgent? = null

  private val agent: AutoMobileAgent
    get() = testAgent ?: LazyInitializer.getAgent()

  /** Detected test context from stack trace inspection. */
  private data class TestContext(val className: String, val methodName: String)

  /**
   * Detect the calling test class and method from the current stack trace. Looks for methods
   * annotated with @Test by inspecting the call stack.
   */
  private fun detectTestContext(): TestContext? {
    val stackTrace = Thread.currentThread().stackTrace

    for (element in stackTrace) {
      // Skip internal classes
      if (
          element.className.startsWith("java.") ||
              element.className.startsWith("kotlin.") ||
              element.className.startsWith("jdk.") ||
              element.className.startsWith("sun.") ||
              element.className.contains("AutoMobilePlan")
      ) {
        continue
      }

      try {
        val clazz = Class.forName(element.className)
        val methods = clazz.declaredMethods

        for (method in methods) {
          if (method.name == element.methodName && method.isAnnotationPresent(Test::class.java)) {
            // Found a @Test annotated method in the call stack
            val simpleClassName = clazz.simpleName
            return TestContext(simpleClassName, method.name)
          }
        }
      } catch (_: ClassNotFoundException) {
        // Class not found, skip
      } catch (_: NoClassDefFoundError) {
        // Class definition error, skip
      }
    }

    return null
  }

  /** Build test metadata JSON object for the daemon request. */
  private fun buildTestMetadata(testContext: TestContext): JsonObject {
    val metadata =
        mutableMapOf<String, JsonElement>(
            "testClass" to JsonPrimitive(testContext.className),
            "testMethod" to JsonPrimitive(testContext.methodName),
            "isCi" to JsonPrimitive(resolveCiMode()),
        )

    // Add optional metadata if available
    val appVersion = firstNonBlank(
        System.getProperty("automobile.app.version", ""),
        System.getenv("AUTOMOBILE_APP_VERSION"),
        System.getenv("APP_VERSION"),
    )
    if (appVersion != null) {
      metadata["appVersion"] = JsonPrimitive(appVersion)
    }

    val gitCommit = firstNonBlank(
        System.getProperty("automobile.git.commit", ""),
        System.getenv("AUTOMOBILE_GIT_COMMIT"),
        System.getenv("GITHUB_SHA"),
        System.getenv("GIT_COMMIT"),
        System.getenv("CI_COMMIT_SHA"),
    )
    if (gitCommit != null) {
      metadata["gitCommit"] = JsonPrimitive(gitCommit)
    }

    val targetSdk = firstNonBlank(
        System.getProperty("automobile.android.targetSdk", ""),
        System.getProperty("automobile.targetSdk", ""),
        System.getenv("AUTOMOBILE_TARGET_SDK"),
        System.getenv("ANDROID_TARGET_SDK"),
    )?.toIntOrNull()
    if (targetSdk != null) {
      metadata["targetSdk"] = JsonPrimitive(targetSdk)
    }

    val jdkVersion = firstNonBlank(
        System.getProperty("java.version"),
        System.getProperty("java.runtime.version"),
    )
    if (jdkVersion != null) {
      metadata["jdkVersion"] = JsonPrimitive(jdkVersion)
    }

    val jvmTarget = firstNonBlank(
        System.getProperty("kotlin.jvm.target"),
        System.getProperty("java.specification.version"),
    )
    if (jvmTarget != null) {
      metadata["jvmTarget"] = JsonPrimitive(jvmTarget)
    }

    val gradleVersion = firstNonBlank(
        System.getProperty("org.gradle.version"),
        System.getProperty("gradle.version"),
    )
    if (gradleVersion != null) {
      metadata["gradleVersion"] = JsonPrimitive(gradleVersion)
    }

    return JsonObject(metadata)
  }

  private fun resolveCiMode(): Boolean {
    val sysProp = System.getProperty("automobile.ci.mode")
    if (sysProp != null) {
      // Explicit system property takes precedence over environment
      return sysProp.toBoolean()
    }
    val envValue = System.getenv("CI") ?: return false
    return envValue.equals("true", ignoreCase = true) || envValue == "1"
  }

  private fun firstNonBlank(vararg values: String?): String? {
    return values.firstOrNull { !it.isNullOrBlank() }
  }

  /** Execute an AutoMobile plan with parameter substitution. */
  fun execute(
      planPath: String,
      parameters: Map<String, Any>,
      options: AutoMobilePlanExecutionOptions,
  ): AutoMobilePlanExecutionResult {

    val startTime = System.currentTimeMillis()

    try {
      // Resolve and validate the plan file path first, before any other checks
      val resolvedPlanPath = resolvePlanPath(planPath)

      // Check device availability after plan file validation
      if (!AutoMobileSharedUtils.deviceChecker.areDevicesAvailable()) {
        val executionTime = System.currentTimeMillis() - startTime
        return AutoMobilePlanExecutionResult(
            success = false,
            exitCode = -1,
            errorMessage = "No Android devices available for plan execution",
            executionTimeMs = executionTime,
            parametersUsed = parameters,
        )
      }

      // Load and process the plan with parameter substitution
      val processedPlanContent = loadAndProcessPlan(resolvedPlanPath, parameters)

      if (options.debugMode) {
        println("Executing AutoMobile plan: $planPath")
        println("Parameters: $parameters")
        println("Processed plan content:\n$processedPlanContent")
      }

      // Execute the processed plan
      val result = executeProcessedPlan(processedPlanContent, options)

      val executionTime = System.currentTimeMillis() - startTime

      return AutoMobilePlanExecutionResult(
          success = result.success,
          exitCode = result.exitCode,
          output = result.output,
          errorMessage = result.errorMessage,
          executionTimeMs = executionTime,
          aiRecoveryAttempted = result.aiRecoveryAttempted,
          aiRecoverySuccessful = result.aiRecoverySuccessful,
          parametersUsed = parameters,
          toolResults = result.toolResults,
      )
    } catch (e: Exception) {
      val executionTime = System.currentTimeMillis() - startTime
      return AutoMobilePlanExecutionResult(
          success = false,
          exitCode = -1,
          errorMessage = "Plan execution failed: ${e.message}",
          executionTimeMs = executionTime,
          parametersUsed = parameters,
      )
    }
  }

  private fun resolvePlanPath(planPath: String): String {
    // Try to find the plan in test resources first
    val classLoader = Thread.currentThread().contextClassLoader
    val resource = classLoader.getResource(planPath)

    if (resource != null) {
      return File(resource.toURI()).path
    }

    // If not found in resources, try as absolute path
    val file = File(planPath)
    if (file.exists()) {
      return file.absolutePath
    }

    throw IllegalArgumentException("YAML plan not found: $planPath")
  }

  private fun loadAndProcessPlan(planPath: String, parameters: Map<String, Any>): String {
    val planContent = File(planPath).readText()

    // Perform parameter substitution using template syntax ${parameter_name}
    var processedContent = planContent
    if (parameters.isNotEmpty()) {
      parameters.forEach { (key, value) ->
        val placeholder = "\${$key}"
        val stringValue =
            when (value) {
              is String -> value
              is Enum<*> -> value.name
              else -> value.toString()
            }
        processedContent = processedContent.replace(placeholder, stringValue)
      }
    }

    // Validate YAML schema after parameter substitution
    val validationResult = PlanSchemaValidator.validateYaml(processedContent)
    if (!validationResult.valid) {
      val errorMessages =
          validationResult.errors.joinToString("\n") { err ->
            val location = if (err.line != null) " (line ${err.line})" else ""
            "${err.field}: ${err.message}$location"
          }
      throw IllegalArgumentException(
          "Plan YAML validation failed:\n$errorMessages\n\n" +
              "The plan does not conform to the AutoMobile test plan schema. " +
              "Check schemas/test-plan.schema.json for details."
      )
    }

    return processedContent
  }

  // ── Plan execution with recovery ──────────────────────────────────────────

  private fun executeProcessedPlan(
      planContent: String,
      options: AutoMobilePlanExecutionOptions,
  ): InternalExecutionResult {
    return executePlanFromStep(planContent, options, startStep = 0, recoveryAlreadyAttempted = false)
  }

  /**
   * Execute a plan starting at [startStep]. If the plan fails and recovery has not yet been
   * attempted, the Koog agent is invoked to work around the failure. On successful recovery the
   * plan resumes from the step after the failed one. Recovery is allowed at most once per test.
   */
  /**
   * @param deviceIdOverride When non-null, pins execution to this device. Used after recovery to
   *   ensure the resumed plan runs on the same device the agent just recovered.
   */
  private fun executePlanFromStep(
      planContent: String,
      options: AutoMobilePlanExecutionOptions,
      startStep: Int,
      recoveryAlreadyAttempted: Boolean,
      deviceIdOverride: String? = null,
  ): InternalExecutionResult {

    val json = Json { ignoreUnknownKeys = true }
    val maxRetries = options.maxRetries.coerceAtLeast(0)
    var attempt = 0

    var response: DaemonResponse
    var outputPayload: String
    var parsed: ParsedToolResult
    var toolResults: List<ToolResultEntry>

    // Retry loop for transient failures (timeouts, daemon busy)
    while (true) {
      attempt++
      val sessionUuid = UUID.randomUUID().toString()

      val args =
          mutableMapOf<String, JsonElement>(
              "planContent" to
                  JsonPrimitive(
                      "base64:" +
                          java.util.Base64.getEncoder().encodeToString(planContent.toByteArray())
                  ),
              "platform" to JsonPrimitive("android"),
              "startStep" to JsonPrimitive(startStep),
              "sessionUuid" to JsonPrimitive(sessionUuid),
          )

      // Pin to the recovered device if specified, otherwise use the configured device
      val effectiveDeviceId = deviceIdOverride ?: options.device.takeIf { it != "auto" }
      if (effectiveDeviceId != null) {
        args["deviceId"] = JsonPrimitive(effectiveDeviceId)
      }

      // Detect calling test context and include metadata for test run recording
      val testContext = detectTestContext()
      if (testContext != null) {
        args["testMetadata"] = buildTestMetadata(testContext)
      }

      if (options.debugMode) {
        println("Executing plan via daemon socket: executePlan (startStep=$startStep, attempt=$attempt)")
      }

      DaemonHeartbeat.registerSession(sessionUuid)
      response =
          try {
            DaemonSocketClientManager.callTool("executePlan", JsonObject(args), options.timeoutMs)
          } finally {
            DaemonHeartbeat.unregisterSession(sessionUuid)
          }
      outputPayload =
          response.result?.let { json.encodeToString(JsonElement.serializer(), it) } ?: ""
      parsed = parseDaemonToolResult(response, json)
      toolResults = parseToolResults(response, json, options.debugMode)

      if (options.debugMode) {
        println("Daemon response:\n$outputPayload")
        if (!response.error.isNullOrBlank()) {
          println("Daemon error: ${response.error}")
        }
      }

      val success = response.success && parsed.success
      if (success) {
        return InternalExecutionResult(
            success = true,
            exitCode = 0,
            output = outputPayload,
            toolResults = toolResults,
        )
      }

      val errorMessage = response.error ?: parsed.errorMessage
      if (attempt > maxRetries || !isTransientError(errorMessage)) {
        break
      }

      println("Retrying plan execution after transient error (attempt $attempt): $errorMessage")
      Thread.sleep(RETRY_BACKOFF_MS)
    }

    // Non-transient failure or retries exhausted — attempt recovery if allowed
    val failedStepContext = buildFailedStepContext(response, json, planContent, options.device)
    return handleFailure(
        result = CommandResult(1, outputPayload, response.error ?: parsed.errorMessage),
        options = options,
        toolResults = toolResults,
        failedStepContext = failedStepContext,
        planContent = planContent,
        recoveryAlreadyAttempted = recoveryAlreadyAttempted,
    )
  }

  // ── Failure handling & recovery ───────────────────────────────────────────

  private fun handleFailure(
      result: CommandResult,
      options: AutoMobilePlanExecutionOptions,
      toolResults: List<ToolResultEntry>,
      failedStepContext: FailedStepContext?,
      planContent: String,
      recoveryAlreadyAttempted: Boolean,
  ): InternalExecutionResult {

    val errorMessage =
        "AutoMobile plan execution failed with exit code ${result.exitCode}" +
            if (result.errorOutput.isNotEmpty()) "\nErrors: ${result.errorOutput}" else ""

    System.err.println(errorMessage)

    val ciMode = resolveCiMode()
    val recoveryFlagEnabled = agent.recoveryConfigProvider.isRecoveryEnabled()
    if (!options.aiAssistance || !recoveryFlagEnabled || ciMode || recoveryAlreadyAttempted || failedStepContext == null) {
      if (recoveryAlreadyAttempted) {
        println("Recovery already attempted for this test — failing without retry")
      }
      if (!recoveryFlagEnabled) {
        println("AI recovery disabled via ai-recovery feature flag")
      }
      return InternalExecutionResult(
          success = false,
          exitCode = result.exitCode,
          output = result.output,
          errorMessage = errorMessage,
          toolResults = toolResults,
      )
    }

    // Attempt Koog-powered recovery
    println("Attempting AI-assisted recovery for failed step ${failedStepContext.failedStepIndex + 1} (${failedStepContext.failedTool})")

    val recoveryOutcome = agent.attemptAiRecovery(failedStepContext)

    if (!recoveryOutcome.success) {
      println("AI recovery failed")
      return InternalExecutionResult(
          success = false,
          exitCode = result.exitCode,
          output = result.output,
          errorMessage = errorMessage,
          aiRecoveryAttempted = true,
          aiRecoverySuccessful = false,
          toolResults = toolResults,
      )
    }

    // Recovery succeeded — resume the plan from the step after the failed one,
    // pinned to the same device the agent just recovered
    val resumeStep = failedStepContext.failedStepIndex + 1
    println("AI recovery succeeded, resuming plan from step ${resumeStep + 1}")

    val resumeResult = executePlanFromStep(
        planContent = planContent,
        options = options,
        startStep = resumeStep,
        recoveryAlreadyAttempted = true, // prevent recursive recovery
        deviceIdOverride = failedStepContext.deviceId,
    )

    return InternalExecutionResult(
        success = resumeResult.success,
        exitCode = resumeResult.exitCode,
        output = resumeResult.output,
        errorMessage = resumeResult.errorMessage,
        aiRecoveryAttempted = true,
        aiRecoverySuccessful = resumeResult.success,
        toolResults = toolResults + resumeResult.toolResults,
    )
  }

  // ── Build FailedStepContext from daemon response ──────────────────────────

  private fun buildFailedStepContext(
      response: DaemonResponse,
      json: Json,
      planContent: String,
      deviceId: String?,
  ): FailedStepContext? {
    try {
      val resultElement = response.result ?: return null
      val contentArray = resultElement.jsonObject["content"] as? JsonArray ?: return null
      val contentText =
          contentArray
              .firstOrNull { element ->
                (element as? JsonObject)?.get("type")?.jsonPrimitive?.content == "text"
              }
              ?.jsonObject
              ?.get("text")
              ?.jsonPrimitive
              ?.content ?: return null
      val payload = json.parseToJsonElement(contentText).jsonObject

      val failedStepObj = payload["failedStep"]?.jsonObject ?: return null
      val failedStepIndex =
          failedStepObj["stepIndex"]?.jsonPrimitive?.content?.toIntOrNull() ?: return null
      val failedTool = failedStepObj["tool"]?.jsonPrimitive?.content ?: "unknown"
      val error = failedStepObj["error"]?.jsonPrimitive?.content ?: "Unknown error"
      val failedDevice = failedStepObj["device"]?.jsonPrimitive?.content

      // Build succeeded steps from toolResults in the payload
      val succeededSteps = mutableListOf<SucceededStepSummary>()
      val toolResultsArray = (payload["toolResults"] ?: payload["toolResult"]) as? JsonArray
      if (toolResultsArray != null) {
        for ((index, stepElement) in toolResultsArray.withIndex()) {
          if (index >= failedStepIndex) break
          val stepObj = stepElement as? JsonObject ?: continue
          val tool =
              stepObj["toolName"]?.jsonPrimitive?.content
                  ?: stepObj["tool"]?.jsonPrimitive?.content
                  ?: "unknown"
          succeededSteps.add(SucceededStepSummary(stepIndex = index, tool = tool))
        }
      }

      return FailedStepContext(
          failedStepIndex = failedStepIndex,
          failedTool = failedTool,
          error = error,
          succeededSteps = succeededSteps,
          planContent = planContent,
          deviceId = failedDevice ?: deviceId?.takeIf { it != "auto" },
      )
    } catch (e: Exception) {
      println("Warning: Failed to build recovery context: ${e.message}")
      return null
    }
  }

  // ── Response parsing ──────────────────────────────────────────────────────

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
          if (success == false) {
            val failedStepObj = parsed["failedStep"]?.jsonObject
            val errorMessage = if (failedStepObj != null) {
              val stepIndex = failedStepObj["stepIndex"]?.jsonPrimitive?.content?.toIntOrNull() ?: 0
              val tool = failedStepObj["tool"]?.jsonPrimitive?.content ?: "unknown"
              val stepError = failedStepObj["error"]?.jsonPrimitive?.content ?: "Unknown step error"
              val executedSteps = parsed["executedSteps"]?.jsonPrimitive?.content?.toIntOrNull()
              val totalSteps = parsed["totalSteps"]?.jsonPrimitive?.content?.toIntOrNull()
              buildString {
                append("Test plan execution failed at step ${stepIndex + 1} ($tool):")
                append("\n  Error: $stepError")
                if (executedSteps != null && totalSteps != null) {
                  append("\n  Executed: $executedSteps/$totalSteps steps")
                }
              }
            } else {
              parsed["error"]?.jsonPrimitive?.content ?: "AutoMobile plan failed"
            }
            return ParsedToolResult(false, errorMessage)
          }
          return ParsedToolResult(true, "")
        }
      }
    }

    return ParsedToolResult(false, "Unexpected daemon response format")
  }

  private fun parseToolResults(
      response: DaemonResponse,
      json: Json,
      debugMode: Boolean,
  ): List<ToolResultEntry> {
    return try {
      val resultElement = response.result ?: return emptyList()
      val contentArray = resultElement.jsonObject["content"] as? JsonArray ?: return emptyList()
      val contentText =
          contentArray
              .firstOrNull { element ->
                (element as? JsonObject)?.get("type")?.jsonPrimitive?.content == "text"
              }
              ?.jsonObject
              ?.get("text")
              ?.jsonPrimitive
              ?.content ?: return emptyList()
      val payload = json.parseToJsonElement(contentText).jsonObject
      val stepsElement = payload["toolResults"] ?: payload["toolResult"] ?: return emptyList()
      val stepsArray = stepsElement as? JsonArray ?: return emptyList()

      stepsArray.mapIndexed { index, stepElement ->
        parseToolResultStep(index, stepElement, debugMode)
      }
    } catch (e: Exception) {
      if (debugMode) {
        println("Warning: Failed to parse tool results: ${e.message}")
      }
      listOf(
          buildErrorToolResult(
              stepIndex = -1,
              toolName = null,
              errorMessage = e.message ?: "Failed to parse tool results",
          )
      )
    }
  }

  private fun parseToolResultStep(
      stepIndex: Int,
      stepElement: JsonElement,
      debugMode: Boolean,
  ): ToolResultEntry {
    val stepObject =
        stepElement as? JsonObject
            ?: return buildErrorToolResult(
                stepIndex = stepIndex,
                toolName = null,
                errorMessage = "Tool result is not a JSON object",
                payload = stepElement,
            )
    val toolName =
        stepObject["toolName"]?.jsonPrimitive?.content
            ?: stepObject["tool"]?.jsonPrimitive?.content
            ?: stepObject["name"]?.jsonPrimitive?.content

    val resolvedStepIndex =
        (stepObject["stepIndex"] as? JsonPrimitive)?.intOrNull
            ?: (stepObject["index"] as? JsonPrimitive)?.intOrNull
            ?: stepIndex

    if (toolName.isNullOrBlank()) {
      val errorMessage =
          extractErrorMessage(stepObject) ?: "Missing tool name for step $resolvedStepIndex"
      if (debugMode) {
        println("Warning: $errorMessage")
      }
      return buildErrorToolResult(
          stepIndex = resolvedStepIndex,
          toolName = null,
          errorMessage = errorMessage,
          payload = stepObject,
      )
    }

    val responseElement =
        stepObject["response"]
            ?: stepObject["result"]
            ?: stepObject["payload"]
            ?: stepObject["output"]

    return try {
      when {
        responseElement != null ->
            parseToolResultElement(resolvedStepIndex, toolName, responseElement)
        stepObject["content"] != null ->
            ToolResultParser.parseToolResultFromMcpResponse(
                resolvedStepIndex,
                toolName,
                stepObject,
            )
        else -> ToolResultParser.parseToolResult(resolvedStepIndex, toolName, stepObject)
      }
    } catch (e: Exception) {
      val errorMessage =
          extractErrorMessage(stepObject, responseElement)
              ?: e.message
              ?: "Failed to parse tool result"
      if (debugMode) {
        println("Warning: Failed to parse tool result at step $resolvedStepIndex: $errorMessage")
      }
      buildErrorToolResult(
          stepIndex = resolvedStepIndex,
          toolName = toolName,
          errorMessage = errorMessage,
          payload = stepObject,
      )
    }
  }

  private fun parseToolResultElement(
      stepIndex: Int,
      toolName: String,
      element: JsonElement,
  ): ToolResult {
    return when (element) {
      is JsonObject ->
          if (element.containsKey("content")) {
            ToolResultParser.parseToolResultFromMcpResponse(stepIndex, toolName, element)
          } else {
            ToolResultParser.parseToolResult(stepIndex, toolName, element)
          }
      is JsonPrimitive -> ToolResultParser.parseToolResult(stepIndex, toolName, element.content)
      else -> ToolResultParser.parseToolResult(stepIndex, toolName, element)
    }
  }

  private fun buildErrorToolResult(
      stepIndex: Int,
      toolName: String?,
      errorMessage: String,
      payload: JsonElement? = null,
  ): ErrorToolResult {
    return ErrorToolResult(
        stepIndex = stepIndex,
        toolName = toolName,
        errorMessage = errorMessage,
        payload = payload,
    )
  }

  private fun extractErrorMessage(
      stepObject: JsonObject,
      responseElement: JsonElement? = null,
  ): String? {
    val stepError = (stepObject["error"] as? JsonPrimitive)?.content
    if (!stepError.isNullOrBlank()) {
      return stepError
    }
    val responseError = (responseElement as? JsonObject)?.get("error") as? JsonPrimitive
    return responseError?.content
  }

  // ── Retry helpers ────────────────────────────────────────────────────────

  private const val RETRY_BACKOFF_MS = 2000L

  private fun isTransientError(errorMessage: String?): Boolean {
    if (errorMessage.isNullOrBlank()) return false
    val normalized = errorMessage.lowercase()
    return normalized.contains("request timed out") ||
        normalized.contains("plan execution in progress") ||
        normalized.contains("daemon request timeout")
  }

  // ── Internal types ────────────────────────────────────────────────────────

  private data class InternalExecutionResult(
      val success: Boolean,
      val exitCode: Int,
      val output: String = "",
      val errorMessage: String = "",
      val aiRecoveryAttempted: Boolean = false,
      val aiRecoverySuccessful: Boolean = false,
      val toolResults: List<ToolResultEntry> = emptyList(),
  )

  private data class ParsedToolResult(val success: Boolean, val errorMessage: String)
}
