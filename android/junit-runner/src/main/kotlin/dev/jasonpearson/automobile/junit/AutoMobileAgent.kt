package dev.jasonpearson.automobile.junit

import ai.koog.agents.core.agent.AIAgent
import ai.koog.agents.core.tools.SimpleTool
import ai.koog.agents.core.tools.ToolRegistry
import ai.koog.prompt.executor.clients.anthropic.AnthropicModels
import ai.koog.prompt.executor.clients.google.GoogleModels
import ai.koog.prompt.executor.clients.openai.OpenAIModels
import ai.koog.prompt.executor.llms.all.simpleAnthropicExecutor
import ai.koog.prompt.executor.llms.all.simpleGoogleAIExecutor
import ai.koog.prompt.executor.llms.all.simpleOpenAIExecutor
import java.io.File
import java.net.URI
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpResponse
import java.time.Duration
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.Serializable
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject

/**
 * Handles AI agent loop functionality for AutoMobile test execution using Koog framework.
 *
 * This class manages AI-powered plan generation from prompts and AI-assisted failure recovery using
 * the AutoMobile MCP server with support for OpenAI, Anthropic, and Google models.
 */
class AutoMobileAgent(
    private val configProvider: ConfigProvider = DefaultConfigProvider(),
    private val fileSystemOperations: FileSystemOperations = DefaultFileSystemOperations(),
    private val aiAgentFactory: AIAgentFactory = DefaultAIAgentFactory(),
    private val timeProvider: TimeProvider = DefaultTimeProvider(),
    private val mcpClient: MCPClient = DefaultMCPClient(),
) {

  companion object {
    private const val MAX_TOOL_CALLS = 5
  }

  /** Supported AI model providers */
  enum class ModelProvider {
    OPENAI,
    ANTHROPIC,
    GOOGLE,
  }

  /** Configuration for AI model selection */
  data class ModelConfig(
      val provider: ModelProvider,
      val apiKey: String,
      val proxyEndpoint: String? = null,
  )

  /** Generates a YAML test plan from a prompt using AI agent via Koog framework. */
  fun generatePlanFromPrompt(
      prompt: String,
      className: String,
      methodName: String,
      testResourcesDir: File,
  ): String {
    val generatedPlanName = "${className}_${methodName}.yaml"
    val generatedPlanPath = "test-plans/generated/$generatedPlanName"

    // Create the generated plans directory if it doesn't exist
    val generatedPlansDir = File(testResourcesDir, "test-plans/generated")

    fileSystemOperations.createDirectories(generatedPlansDir)

    val generatedPlanFile = File(generatedPlansDir, generatedPlanName)

    // Check if plan already exists and is recent
    if (
        fileSystemOperations.fileExists(generatedPlanFile) &&
            !shouldRegeneratePlan(generatedPlanFile)
    ) {
      println("Using existing generated plan: $generatedPlanPath")
      return generatedPlanPath
    }

    println("Generating YAML plan from prompt for test: ${className}.${methodName}")
    println("Prompt: $prompt")

    try {
      val planContent = generatePlanContent(prompt, className, methodName)
      fileSystemOperations.writeTextToFile(generatedPlanFile, planContent)
      println("Generated plan saved to: ${generatedPlanFile.absolutePath}")
      return generatedPlanPath
    } catch (e: Exception) {
      throw RuntimeException("Failed to generate YAML plan from prompt: ${e.message}", e)
    }
  }

  /** Attempts AI-assisted recovery for failed test execution using AutoMobile MCP server. */
  fun attemptAiRecovery(failureOutput: String, errorOutput: String): RecoveryResult {
    val startTime = timeProvider.currentTimeMillis()

    try {
      // Initialize MCP connection
      val mcpServerUrl = configProvider.getMcpServerUrl()
      if (!mcpClient.isConnected()) {
        mcpClient.connect(mcpServerUrl)
      }

      val modelConfig = configProvider.getModelConfig()
      val aiAgent = aiAgentFactory.createAIAgentWithMCPTools(modelConfig, mcpClient)

      val recoveryPrompt =
          """
        An AutoMobile test execution failed with the following details:

        FAILURE OUTPUT:
        $failureOutput

        ERROR OUTPUT:
        $errorOutput

        You have access to AutoMobile tools to observe and interact with the device:
        - observe: Get current device state and UI hierarchy
        - tapOn: Tap on UI elements by text, coordinates, or description
        - typeText: Enter text into input fields
        - swipe: Perform swipe gestures for scrolling
        - waitFor: Wait for elements to appear or conditions to be met
        - goBack: Navigate back in the app

        Please analyze the failure and attempt recovery by:
        1. First observing the current device state
        2. Understanding what went wrong
        3. Taking corrective actions to get the test back on track
        4. You have a maximum of $MAX_TOOL_CALLS tool calls to achieve recovery

        Focus on common mobile testing issues like:
        - Elements not found (try alternative selectors or wait longer)
        - Timing issues (add appropriate waits)
        - UI state problems (navigate to correct screen)
        - Pop-ups or dialogs blocking interaction
        - Network or loading issues

        Start by observing the current state, then take specific actions to recover.
      """
              .trimIndent()

      val recoveryResult = runBlocking {
        try {
          println("Starting AI recovery with AutoMobile MCP tools...")

          val response = aiAgent.run(recoveryPrompt) ?: ""

          println("AI recovery completed")
          println("Recovery response: $response")

          // Determine success based on the response content
          val success =
              response.contains("recovery", ignoreCase = true) &&
                  !response.contains("failed", ignoreCase = true)

          val recoveryTime = timeProvider.currentTimeMillis() - startTime
          RecoveryResult(success, recoveryTime)
        } catch (e: Exception) {
          println("AI recovery execution failed: ${e.message}")
          val recoveryTime = timeProvider.currentTimeMillis() - startTime
          RecoveryResult(false, recoveryTime)
        }
      }

      return recoveryResult
    } catch (e: Exception) {
      println("AI recovery initialization failed: ${e.message}")
    } finally {
      // Cleanup MCP connection if needed
      try {
        mcpClient.disconnect()
      } catch (e: Exception) {
        println("Warning: Failed to cleanly disconnect MCP client: ${e.message}")
      }
    }

    val recoveryTime = timeProvider.currentTimeMillis() - startTime
    return RecoveryResult(false, recoveryTime)
  }

  private fun shouldRegeneratePlan(planFile: File): Boolean {
    // Regenerate if file is older than 1 hour (configurable via system property)
    val maxAgeMs = configProvider.getPlanMaxAgeMs()
    val fileAge = timeProvider.currentTimeMillis() - fileSystemOperations.getLastModified(planFile)
    return fileAge > maxAgeMs
  }

  private fun generatePlanContent(prompt: String, className: String, methodName: String): String {
    println("Generating plan content using Koog AI agent...")

    try {
      val modelConfig = configProvider.getModelConfig()
      val aiAgent = aiAgentFactory.createAIAgent(modelConfig)

      val planGenerationPrompt =
          """
        Generate an AutoMobile YAML test plan for the following requirement:

        Test Class: $className
        Test Method: $methodName
        User Request: $prompt

        Create a comprehensive YAML plan that includes:
        1. A descriptive name and description
        2. Step-by-step actions using AutoMobile tools like:
           - observe (to check device state)
           - tapOn (to tap elements by text or coordinates)
           - typeText (to enter text)
           - swipe (for scrolling)
           - waitFor (for timing)

        Follow this YAML structure:
        ---
        name: descriptive-test-name
        description: Clear description of what the test does
        steps:
          - tool: observe
            withViewHierarchy: true
            label: Initial observation
          - tool: tapOn
            text: "element text"
            label: Tap on specific element
          # Add more steps as needed

        Make the plan specific and actionable for mobile automation.
      """
              .trimIndent()

      return runBlocking {
        try {
          val response = aiAgent.run(planGenerationPrompt)

          // Extract YAML content from the response
          val yamlContent = extractYamlFromResponse(response)

          if (yamlContent.isEmpty()) {
            throw RuntimeException("AI agent generated empty YAML content")
          }

          val debugMode = configProvider.isDebugMode()
          if (debugMode) {
            println("AI agent generated plan:\n$yamlContent")
          }

          yamlContent
        } catch (e: Exception) {
          throw RuntimeException("Plan generation via AI agent failed: ${e.message}", e)
        }
      }
    } catch (e: Exception) {
      throw RuntimeException("Failed to initialize AI agent for plan generation: ${e.message}", e)
    }
  }

  private fun extractYamlFromResponse(response: String?): String {
    if (response.isNullOrBlank()) return ""
    // Look for YAML content between ```yaml and ``` or ```yml and ```
    val yamlRegex = """```ya?ml\s*\n(.*?)\n```""".toRegex(RegexOption.DOT_MATCHES_ALL)
    val match = yamlRegex.find(response)

    return if (match != null) {
      match.groupValues[1].trim()
    } else {
      // If no code blocks found, look for content starting with ---
      val lines = response.lines()
      val yamlStartIndex = lines.indexOfFirst { it.trim().startsWith("---") }

      if (yamlStartIndex != -1) {
        lines.drop(yamlStartIndex).joinToString("\n").trim()
      } else {
        // Fallback: return the entire response if it looks like YAML
        if (response.contains("name:") && response.contains("steps:")) {
          response.trim()
        } else {
          ""
        }
      }
    }
  }

  data class RecoveryResult(val success: Boolean, val recoveryTimeMs: Long)

  // MCP Client interface and implementation
  interface MCPClient {
    fun isConnected(): Boolean

    fun connect(serverUrl: String)

    fun disconnect()

    fun callTool(toolName: String, parameters: Map<String, Any>): String

    fun listAvailableTools(): List<MCPToolDefinition>
  }

  @Serializable data class MCPRequest(val method: String, val params: JsonObject)

  @Serializable
  data class MCPResponse(val result: JsonElement? = null, val error: JsonElement? = null)

  @Serializable
  data class MCPToolDefinition(
      val name: String,
      val description: String,
      val inputSchema: JsonElement,
  )

  @Serializable data class MCPListToolsResponse(val tools: List<MCPToolDefinition>)

  class DefaultMCPClient : MCPClient {
    private val httpClient = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(10)).build()
    private var serverUrl: String? = null
    private val koogJson = Json { ignoreUnknownKeys = true }

    override fun isConnected(): Boolean {
      return serverUrl != null && testConnection()
    }

    override fun connect(serverUrl: String) {
      this.serverUrl = serverUrl
      if (!testConnection()) {
        throw RuntimeException("Failed to connect to AutoMobile MCP server at $serverUrl")
      }
      println("Connected to AutoMobile MCP server at $serverUrl")
    }

    override fun disconnect() {
      serverUrl = null
    }

    override fun callTool(toolName: String, parameters: Map<String, Any>): String {
      val url = serverUrl ?: throw RuntimeException("MCP client not connected")

      try {
        // Create the JSON request manually by building the JSON string
        val paramsJsonBuilder = StringBuilder("{")
        parameters.entries.forEachIndexed { index, (key, value) ->
          if (index > 0) paramsJsonBuilder.append(", ")
          paramsJsonBuilder.append("\"$key\": ")
          when (value) {
            is String -> paramsJsonBuilder.append("\"$value\"")
            is Number -> paramsJsonBuilder.append(value.toString())
            is Boolean -> paramsJsonBuilder.append(value.toString())
            else -> paramsJsonBuilder.append("\"$value\"")
          }
        }
        paramsJsonBuilder.append("}")

        val requestJson =
            """{"method":"tools/call","params":{"name":"$toolName","arguments":${paramsJsonBuilder}}}"""

        val request =
            HttpRequest.newBuilder()
                .uri(URI.create("$url/mcp"))
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(requestJson))
                .timeout(Duration.ofSeconds(30))
                .build()

        val response = httpClient.send(request, HttpResponse.BodyHandlers.ofString())

        if (response.statusCode() != 200) {
          throw RuntimeException(
              "MCP server returned status ${response.statusCode()}: ${response.body()}"
          )
        }

        val mcpResponse = koogJson.decodeFromString<MCPResponse>(response.body())

        if (mcpResponse.error != null) {
          throw RuntimeException("MCP server error: ${mcpResponse.error}")
        }

        return mcpResponse.result?.toString() ?: ""
      } catch (e: Exception) {
        throw RuntimeException("Failed to call MCP tool $toolName: ${e.message}", e)
      }
    }

    override fun listAvailableTools(): List<MCPToolDefinition> {
      val url = serverUrl ?: throw RuntimeException("MCP client not connected")

      try {
        val requestJson = """{"method":"tools/list","params":{}}"""

        val request =
            HttpRequest.newBuilder()
                .uri(URI.create("$url/mcp"))
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(requestJson))
                .timeout(Duration.ofSeconds(10))
                .build()

        val response = httpClient.send(request, HttpResponse.BodyHandlers.ofString())

        if (response.statusCode() != 200) {
          throw RuntimeException(
              "MCP server returned status ${response.statusCode()}: ${response.body()}"
          )
        }

        val mcpResponse = koogJson.decodeFromString<MCPResponse>(response.body())

        if (mcpResponse.error != null) {
          throw RuntimeException("MCP server error: ${mcpResponse.error}")
        }

        val listResponse =
            koogJson.decodeFromString<MCPListToolsResponse>(mcpResponse.result!!.toString())
        return listResponse.tools
      } catch (e: Exception) {
        throw RuntimeException("Failed to list MCP tools: ${e.message}", e)
      }
    }

    private fun testConnection(): Boolean {
      val url = serverUrl ?: return false

      try {
        val request =
            HttpRequest.newBuilder()
                .uri(URI.create("$url/health"))
                .timeout(Duration.ofSeconds(5))
                .build()

        val response = httpClient.send(request, HttpResponse.BodyHandlers.ofString())
        return response.statusCode() == 200
      } catch (e: Exception) {
        return false
      }
    }
  }

  // Class-based AutoMobile MCP Tools (no reflection required)
  // These tools use Koog's SimpleTool pattern for Robolectric compatibility

  /** Observe the current device state and UI hierarchy */
  class ObserveTool(private val mcpClient: MCPClient) :
      SimpleTool<ObserveTool.Args>(
          argsSerializer = Args.serializer(),
          name = "observe",
          description = "Observe the current device state and UI hierarchy",
      ) {

    @Serializable
    data class Args(val withViewHierarchy: Boolean = true, val includeInvisible: Boolean = false)

    override suspend fun execute(args: Args): String {
      val parameters =
          mapOf(
              "withViewHierarchy" to args.withViewHierarchy,
              "includeInvisible" to args.includeInvisible,
          )
      return mcpClient.callTool("observe", parameters)
    }
  }

  /** Tap on UI elements by text, coordinates, or description */
  class TapOnTool(private val mcpClient: MCPClient) :
      SimpleTool<TapOnTool.Args>(
          argsSerializer = Args.serializer(),
          name = "tapOn",
          description = "Tap on UI elements by text, coordinates, or description",
      ) {

    @Serializable
    data class Args(
        val text: String? = null,
        val id: String? = null,
        val x: Int? = null,
        val y: Int? = null,
    )

    override suspend fun execute(args: Args): String {
      val parameters = mutableMapOf<String, Any>()
      args.text?.let { parameters["text"] = it }
      args.id?.let { parameters["id"] = it }
      args.x?.let { parameters["x"] = it }
      args.y?.let { parameters["y"] = it }

      if (parameters.isEmpty()) {
        throw IllegalArgumentException("Must specify either text, id, or coordinates (x, y)")
      }

      return mcpClient.callTool("tapOn", parameters)
    }
  }

  /** Enter text into input fields or send text to the device */
  class TypeTextTool(private val mcpClient: MCPClient) :
      SimpleTool<TypeTextTool.Args>(
          argsSerializer = Args.serializer(),
          name = "typeText",
          description = "Enter text into input fields or send text to the device",
      ) {

    @Serializable data class Args(val text: String)

    override suspend fun execute(args: Args): String {
      val parameters = mapOf("text" to args.text)
      return mcpClient.callTool("sendText", parameters)
    }
  }

  /** Input text with optional IME action */
  class InputTextTool(private val mcpClient: MCPClient) :
      SimpleTool<InputTextTool.Args>(
          argsSerializer = Args.serializer(),
          name = "inputText",
          description = "Input text with optional IME action",
      ) {

    @Serializable data class Args(val text: String, val imeAction: String? = null)

    override suspend fun execute(args: Args): String {
      val parameters = mutableMapOf<String, Any>("text" to args.text)
      args.imeAction?.let { parameters["imeAction"] = it }
      return mcpClient.callTool("inputText", parameters)
    }
  }

  /** Perform swipe gestures for scrolling or navigation */
  class SwipeTool(private val mcpClient: MCPClient) :
      SimpleTool<SwipeTool.Args>(
          argsSerializer = Args.serializer(),
          name = "swipe",
          description = "Perform swipe gestures for scrolling or navigation",
      ) {

    @Serializable
    data class Args(val direction: String = "up", val containerElementId: String? = null)

    override suspend fun execute(args: Args): String {
      val parameters = mutableMapOf<String, Any>("direction" to args.direction)

      return if (args.containerElementId != null) {
        parameters["containerElementId"] = args.containerElementId
        mcpClient.callTool("scroll", parameters)
      } else {
        parameters["includeSystemInsets"] = false
        parameters["duration"] = 300
        mcpClient.callTool("swipeOnScreen", parameters)
      }
    }
  }

  /** Scroll within a container element */
  class ScrollTool(private val mcpClient: MCPClient) :
      SimpleTool<ScrollTool.Args>(
          argsSerializer = Args.serializer(),
          name = "scroll",
          description = "Scroll within a container element",
      ) {

    @Serializable
    data class Args(
        val containerElementId: String,
        val direction: String = "up",
        val lookForText: String? = null,
        val lookForElementId: String? = null,
    )

    override suspend fun execute(args: Args): String {
      val parameters =
          mutableMapOf<String, Any>(
              "containerElementId" to args.containerElementId,
              "direction" to args.direction,
          )

      if (args.lookForText != null || args.lookForElementId != null) {
        val lookFor = mutableMapOf<String, Any>()
        args.lookForText?.let { lookFor["text"] = it }
        args.lookForElementId?.let { lookFor["elementId"] = it }
        parameters["lookFor"] = lookFor
      }

      return mcpClient.callTool("scroll", parameters)
    }
  }

  /** Wait for elements to appear or conditions to be met */
  class WaitForTool(private val mcpClient: MCPClient) :
      SimpleTool<WaitForTool.Args>(
          argsSerializer = Args.serializer(),
          name = "waitFor",
          description = "Wait for elements to appear or conditions to be met",
      ) {

    @Serializable
    data class Args(
        val text: String? = null,
        val elementId: String? = null,
        val timeout: Int = 5000,
    )

    override suspend fun execute(args: Args): String {
      // Note: The current MCP server doesn't have a dedicated waitFor tool
      // We'll simulate it by repeatedly calling observe until the element is found
      val startTime = System.currentTimeMillis()
      val endTime = startTime + args.timeout

      while (System.currentTimeMillis() < endTime) {
        try {
          val observeResult = mcpClient.callTool("observe", mapOf("withViewHierarchy" to true))

          // Check if the element we're waiting for is present
          if (args.text != null && observeResult.contains(args.text, ignoreCase = true)) {
            return "Element with text '${args.text}' found"
          }

          if (args.elementId != null && observeResult.contains(args.elementId)) {
            return "Element with ID '${args.elementId}' found"
          }

          Thread.sleep(500) // Wait 500ms before checking again
        } catch (e: Exception) {
          // Continue waiting if there's an error
        }
      }

      val target = args.text ?: args.elementId ?: "unknown"
      throw RuntimeException("Timeout waiting for element: $target")
    }
  }

  /** Navigate back in the app using the back button */
  class GoBackTool(private val mcpClient: MCPClient) :
      SimpleTool<GoBackTool.Args>(
          argsSerializer = Args.serializer(),
          name = "goBack",
          description = "Navigate back in the app using the back button",
      ) {

    @Serializable class Args

    override suspend fun execute(args: Args): String {
      val parameters = mapOf("button" to "back")
      return mcpClient.callTool("pressButton", parameters)
    }
  }

  /** Press a hardware button */
  class PressButtonTool(private val mcpClient: MCPClient) :
      SimpleTool<PressButtonTool.Args>(
          argsSerializer = Args.serializer(),
          name = "pressButton",
          description = "Press a hardware button",
      ) {

    @Serializable data class Args(val button: String)

    override suspend fun execute(args: Args): String {
      val parameters = mapOf("button" to args.button)
      return mcpClient.callTool("pressButton", parameters)
    }
  }

  /** Clear text from input fields */
  class ClearTextTool(private val mcpClient: MCPClient) :
      SimpleTool<ClearTextTool.Args>(
          argsSerializer = Args.serializer(),
          name = "clearText",
          description = "Clear text from input fields",
      ) {

    @Serializable class Args

    override suspend fun execute(args: Args): String {
      return mcpClient.callTool("clearText", emptyMap())
    }
  }

  /** Launch an app by package ID */
  class LaunchAppTool(private val mcpClient: MCPClient) :
      SimpleTool<LaunchAppTool.Args>(
          argsSerializer = Args.serializer(),
          name = "launchApp",
          description = "Launch an app by package ID",
      ) {

    @Serializable data class Args(val appId: String)

    override suspend fun execute(args: Args): String {
      val parameters = mapOf("appId" to args.appId)
      return mcpClient.callTool("launchApp", parameters)
    }
  }

  /** Terminate an app by package ID */
  class TerminateAppTool(private val mcpClient: MCPClient) :
      SimpleTool<TerminateAppTool.Args>(
          argsSerializer = Args.serializer(),
          name = "terminateApp",
          description = "Terminate an app by package ID",
      ) {

    @Serializable data class Args(val appId: String)

    override suspend fun execute(args: Args): String {
      val parameters = mapOf("appId" to args.appId)
      return mcpClient.callTool("terminateApp", parameters)
    }
  }

  /** Double tap on coordinates */
  class DoubleTapOnTool(private val mcpClient: MCPClient) :
      SimpleTool<DoubleTapOnTool.Args>(
          argsSerializer = Args.serializer(),
          name = "doubleTapOn",
          description = "Double tap on coordinates",
      ) {

    @Serializable data class Args(val x: Int, val y: Int)

    override suspend fun execute(args: Args): String {
      val parameters = mapOf("x" to args.x, "y" to args.y)
      return mcpClient.callTool("doubleTapOn", parameters)
    }
  }

  /** Long press on coordinates or elements */
  class LongPressOnTool(private val mcpClient: MCPClient) :
      SimpleTool<LongPressOnTool.Args>(
          argsSerializer = Args.serializer(),
          name = "longPressOn",
          description = "Long press on coordinates or elements",
      ) {

    @Serializable
    data class Args(
        val text: String? = null,
        val id: String? = null,
        val x: Int? = null,
        val y: Int? = null,
        val duration: Int = 1000,
    )

    override suspend fun execute(args: Args): String {
      val parameters = mutableMapOf<String, Any>("duration" to args.duration)
      args.text?.let { parameters["text"] = it }
      args.id?.let { parameters["id"] = it }
      args.x?.let { parameters["x"] = it }
      args.y?.let { parameters["y"] = it }

      if (parameters.size == 1) { // Only duration was set
        throw IllegalArgumentException("Must specify either text, id, or coordinates (x, y)")
      }

      return mcpClient.callTool("longPressOn", parameters)
    }
  }

  /** Helper to create all MCP tools for an agent */
  class AutoMobileMCPToolFactory(private val mcpClient: MCPClient) {
    fun createAllTools(): List<SimpleTool<*>> =
        listOf(
            ObserveTool(mcpClient),
            TapOnTool(mcpClient),
            TypeTextTool(mcpClient),
            InputTextTool(mcpClient),
            SwipeTool(mcpClient),
            ScrollTool(mcpClient),
            WaitForTool(mcpClient),
            GoBackTool(mcpClient),
            PressButtonTool(mcpClient),
            ClearTextTool(mcpClient),
            LaunchAppTool(mcpClient),
            TerminateAppTool(mcpClient),
            DoubleTapOnTool(mcpClient),
            LongPressOnTool(mcpClient),
        )
  }

  // Dependency interfaces for better testability
  interface ConfigProvider {
    fun getModelConfig(): ModelConfig

    fun getPlanMaxAgeMs(): Long

    fun isDebugMode(): Boolean

    fun getMcpServerUrl(): String
  }

  interface FileSystemOperations {
    fun createDirectories(dir: File)

    fun fileExists(file: File): Boolean

    fun writeTextToFile(file: File, content: String)

    fun getLastModified(file: File): Long
  }

  interface AIAgentFactory {
    fun createAIAgent(config: ModelConfig): AIAgent<String, String>

    fun createAIAgentWithMCPTools(
        config: ModelConfig,
        mcpClient: MCPClient,
    ): AIAgent<String, String>
  }

  interface TimeProvider {
    fun currentTimeMillis(): Long
  }

  // Default implementations
  class DefaultConfigProvider : ConfigProvider {
    override fun getModelConfig(): ModelConfig {
      // Check for model provider preference (default to OpenAI)
      val provider =
          when (System.getProperty("automobile.ai.provider", "openai")?.lowercase()) {
            "anthropic" -> ModelProvider.ANTHROPIC
            "google" -> ModelProvider.GOOGLE
            else -> ModelProvider.OPENAI
          }

      // Get API key for the selected provider
      val apiKey =
          when (provider) {
            ModelProvider.OPENAI ->
                System.getenv("OPENAI_API_KEY")
                    ?: System.getProperty("automobile.openai.api.key")
                    ?: throw RuntimeException(
                        "OpenAI API key not found. Set OPENAI_API_KEY environment variable or automobile.openai.api.key system property"
                    )

            ModelProvider.ANTHROPIC ->
                System.getenv("ANTHROPIC_API_KEY")
                    ?: System.getProperty("automobile.anthropic.api.key")
                    ?: throw RuntimeException(
                        "Anthropic API key not found. Set ANTHROPIC_API_KEY environment variable or automobile.anthropic.api.key system property"
                    )

            ModelProvider.GOOGLE ->
                System.getenv("GOOGLE_API_KEY")
                    ?: System.getProperty("automobile.google.api.key")
                    ?: throw RuntimeException(
                        "Google API key not found. Set GOOGLE_API_KEY environment variable or automobile.google.api.key system property"
                    )
          }

      // Optional proxy endpoint
      val proxyEndpoint = System.getProperty("automobile.ai.proxy.endpoint")

      return ModelConfig(provider, apiKey, proxyEndpoint)
    }

    override fun getPlanMaxAgeMs(): Long {
      return System.getProperty("automobile.plan.max.age.ms", "3600000").toLong() // 1 hour default
    }

    override fun isDebugMode(): Boolean {
      return System.getProperty("automobile.debug", "false").toBoolean()
    }

    override fun getMcpServerUrl(): String {
      return System.getProperty("automobile:localhost:3000")
    }
  }

  class DefaultFileSystemOperations : FileSystemOperations {
    override fun createDirectories(dir: File) {
      if (!dir.exists()) {
        dir.mkdirs()
      }
    }

    override fun fileExists(file: File): Boolean = file.exists()

    override fun writeTextToFile(file: File, content: String) {
      file.writeText(content)
    }

    override fun getLastModified(file: File): Long = file.lastModified()
  }

  class DefaultAIAgentFactory : AIAgentFactory {
    override fun createAIAgent(config: ModelConfig): AIAgent<String, String> {
      val executor =
          when (config.provider) {
            ModelProvider.OPENAI -> simpleOpenAIExecutor(config.apiKey)
            ModelProvider.ANTHROPIC -> simpleAnthropicExecutor(config.apiKey)
            ModelProvider.GOOGLE -> simpleGoogleAIExecutor(config.apiKey)
          }

      val model =
          when (config.provider) {
            ModelProvider.OPENAI -> OpenAIModels.Chat.GPT4o
            ModelProvider.ANTHROPIC -> AnthropicModels.Sonnet_4
            ModelProvider.GOOGLE -> GoogleModels.Gemini2_5Pro
          }

      val systemPrompt =
          """
          You are an expert in mobile test automation using the AutoMobile framework.
          You help generate YAML test plans and provide recovery suggestions for failed tests.

          Your responses should be:
          - Specific and actionable
          - Focused on mobile automation best practices
          - Clear and concise
          - Include proper YAML formatting when generating plans

          When generating YAML plans, always include proper structure with name, description, and steps.
          When providing recovery suggestions, focus on common mobile testing issues and practical solutions.
          """
              .trimIndent()

      return AIAgent(
          promptExecutor = executor,
          llmModel = model,
          toolRegistry = ToolRegistry.EMPTY,
          systemPrompt = systemPrompt,
      )
    }

    override fun createAIAgentWithMCPTools(
        config: ModelConfig,
        mcpClient: MCPClient,
    ): AIAgent<String, String> {
      val executor =
          when (config.provider) {
            ModelProvider.OPENAI -> simpleOpenAIExecutor(config.apiKey)
            ModelProvider.ANTHROPIC -> simpleAnthropicExecutor(config.apiKey)
            ModelProvider.GOOGLE -> simpleGoogleAIExecutor(config.apiKey)
          }

      val model =
          when (config.provider) {
            ModelProvider.OPENAI -> OpenAIModels.Chat.GPT4o
            ModelProvider.ANTHROPIC -> AnthropicModels.Sonnet_4
            ModelProvider.GOOGLE -> GoogleModels.Gemini2_5Pro
          }

      // Create AutoMobile MCP tools using class-based pattern (no reflection)
      val toolFactory = AutoMobileMCPToolFactory(mcpClient)
      val toolRegistry = ToolRegistry { toolFactory.createAllTools().forEach { tool(it) } }

      val systemPrompt =
          """
        You are an expert mobile test automation recovery agent using the AutoMobile framework.

        Your goal is to analyze test failures and take corrective actions using available tools.
        You have access to AutoMobile tools for observing and interacting with mobile devices.
        The available tools are discovered dynamically from the MCP server.

        IMPORTANT CONSTRAINTS:
        - You have a maximum of $MAX_TOOL_CALLS tool calls per recovery attempt
        - Always start by observing the current device state
        - Focus on practical, immediate fixes rather than complex workarounds
        - If you can't fix the issue within the tool call limit, explain what you discovered

        Core tools typically available:
        - observe: Get current UI state and hierarchy
        - tapOn: Tap elements by text, id, or coordinates
        - typeText/inputText: Enter text in input fields
        - swipe/scroll: Navigate with gestures or within containers
        - waitFor: Wait for elements or conditions (implemented as polling)
        - goBack/pressButton: Navigate back or press hardware buttons
        - launchApp/terminateApp: Manage app lifecycle
        - clearText: Clear input fields

        Additional tools may be available depending on the MCP server configuration.

        Always be methodical: observe first, understand the problem, then take targeted actions.
        Use the most appropriate tool for each interaction based on what's available.
      """
              .trimIndent()

      return AIAgent(
          promptExecutor = executor,
          llmModel = model,
          toolRegistry = toolRegistry,
          systemPrompt = systemPrompt,
      )
    }
  }

  class DefaultTimeProvider : TimeProvider {
    override fun currentTimeMillis(): Long = System.currentTimeMillis()
  }
}
