package dev.jasonpearson.automobile.junit

import dev.jasonpearson.automobile.validation.ToolResult
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

/**
 * Internal executor class that handles the actual execution of AutoMobile plans with parameter
 * substitution and daemon socket integration.
 */
internal object AutoMobilePlanExecutor {

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
      val errorMessages = validationResult.errors.joinToString("\n") { err ->
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

  private fun executeProcessedPlan(
      planContent: String,
      options: AutoMobilePlanExecutionOptions,
  ): InternalExecutionResult {

    val json = Json { ignoreUnknownKeys = true }
    val sessionUuid = UUID.randomUUID().toString()

    val args =
        mutableMapOf<String, JsonElement>(
            "planContent" to
                JsonPrimitive(
                    "base64:" +
                        java.util.Base64.getEncoder().encodeToString(planContent.toByteArray())
                ),
            "platform" to JsonPrimitive("android"),
            "startStep" to JsonPrimitive(0),
            "sessionUuid" to JsonPrimitive(sessionUuid),
        )

    if (options.device != "auto") {
      args["deviceId"] = JsonPrimitive(options.device)
    }

    if (options.debugMode) {
      println("Executing plan via daemon socket: executePlan")
    }

    DaemonHeartbeat.registerSession(sessionUuid)
    val response =
        try {
          DaemonSocketClientManager.callTool("executePlan", JsonObject(args), options.timeoutMs)
        } finally {
          DaemonHeartbeat.unregisterSession(sessionUuid)
        }
    val outputPayload =
        response.result?.let { json.encodeToString(JsonElement.serializer(), it) } ?: ""
    val parsed = parseDaemonToolResult(response, json)
    val toolResults = parseToolResults(response, json, options.debugMode)

    if (options.debugMode) {
      println("Daemon response:\n$outputPayload")
      if (!response.error.isNullOrBlank()) {
        println("Daemon error: ${response.error}")
      }
    }

    return if (response.success && parsed.success) {
      InternalExecutionResult(
          success = true,
          exitCode = 0,
          output = outputPayload,
          toolResults = toolResults,
      )
    } else {
      handleFailure(
          CommandResult(1, outputPayload, response.error ?: parsed.errorMessage),
          options,
          toolResults,
      )
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
          if (success == false) {
            val errorMessage = parsed["error"]?.jsonPrimitive?.content ?: "AutoMobile plan failed"
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
  ): List<ToolResult> {
    return try {
      val resultElement = response.result ?: return emptyList()
      val contentArray = resultElement.jsonObject["content"] as? JsonArray ?: return emptyList()
      val contentText =
          contentArray.firstOrNull { element ->
            (element as? JsonObject)?.get("type")?.jsonPrimitive?.content == "text"
          }
              ?.jsonObject
              ?.get("text")
              ?.jsonPrimitive
              ?.content
              ?: return emptyList()
      val payload = json.parseToJsonElement(contentText).jsonObject
      val stepsElement =
          payload["toolResults"]
              ?: payload["toolResult"]
              ?: payload["steps"]
              ?: return emptyList()
      val stepsArray = stepsElement as? JsonArray ?: return emptyList()

      stepsArray.mapIndexedNotNull { index, stepElement ->
        parseToolResultStep(index, stepElement, debugMode)
      }
    } catch (e: Exception) {
      if (debugMode) {
        println("Warning: Failed to parse tool results: ${e.message}")
      }
      emptyList()
    }
  }

  private fun parseToolResultStep(
      stepIndex: Int,
      stepElement: JsonElement,
      debugMode: Boolean,
  ): ToolResult? {
    return try {
      val stepObject = stepElement as? JsonObject ?: return null
      val toolName =
          stepObject["toolName"]?.jsonPrimitive?.content
              ?: stepObject["tool"]?.jsonPrimitive?.content
              ?: stepObject["name"]?.jsonPrimitive?.content
      if (toolName.isNullOrBlank()) {
        if (debugMode) {
          println("Warning: Missing tool name for step $stepIndex")
        }
        return null
      }

      val resolvedStepIndex =
          (stepObject["stepIndex"] as? JsonPrimitive)?.intOrNull
              ?: (stepObject["index"] as? JsonPrimitive)?.intOrNull
              ?: stepIndex

      val responseElement =
          stepObject["response"]
              ?: stepObject["result"]
              ?: stepObject["payload"]
              ?: stepObject["output"]

      when {
        responseElement != null -> parseToolResultElement(resolvedStepIndex, toolName, responseElement)
        stepObject["content"] != null ->
            ToolResultParser.parseToolResultFromMcpResponse(
                resolvedStepIndex,
                toolName,
                stepObject,
            )
        else -> ToolResultParser.parseToolResult(resolvedStepIndex, toolName, stepObject)
      }
    } catch (e: Exception) {
      if (debugMode) {
        println("Warning: Failed to parse tool result at step $stepIndex: ${e.message}")
      }
      null
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

  private fun handleFailure(
      result: CommandResult,
      options: AutoMobilePlanExecutionOptions,
      toolResults: List<ToolResult> = emptyList(),
  ): InternalExecutionResult {

    val ciMode = System.getProperty("automobile.ci.mode", "false").toBoolean()
    if (!options.aiAssistance || ciMode) {
      return InternalExecutionResult(
          success = false,
          exitCode = result.exitCode,
          output = result.output,
          errorMessage =
              "AutoMobile plan execution failed with exit code ${result.exitCode}" +
                  if (result.errorOutput.isNotEmpty()) "\nErrors: ${result.errorOutput}" else "",
          toolResults = toolResults,
      )
    }

    // TODO: Implement AI recovery similar to AutoMobileRunner
    println("AI recovery not yet implemented for programmatic execution")

    return InternalExecutionResult(
        success = false,
        exitCode = result.exitCode,
        output = result.output,
        errorMessage =
            "AutoMobile plan execution failed with exit code ${result.exitCode}" +
                if (result.errorOutput.isNotEmpty()) "\nErrors: ${result.errorOutput}" else "",
        aiRecoveryAttempted = false,
        aiRecoverySuccessful = false,
        toolResults = toolResults,
    )
  }

  private data class InternalExecutionResult(
      val success: Boolean,
      val exitCode: Int,
      val output: String = "",
      val errorMessage: String = "",
      val aiRecoveryAttempted: Boolean = false,
      val aiRecoverySuccessful: Boolean = false,
      val toolResults: List<ToolResult> = emptyList(),
  )

  private data class ParsedToolResult(val success: Boolean, val errorMessage: String)
}
