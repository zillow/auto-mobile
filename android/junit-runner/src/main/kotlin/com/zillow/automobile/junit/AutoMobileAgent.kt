package com.zillow.automobile.junit

import ai.koog.agents.core.agent.AIAgent
import ai.koog.agents.core.tools.ToolRegistry
import ai.koog.agents.core.tools.annotations.LLMDescription
import ai.koog.agents.core.tools.annotations.Tool as ToolAnnotation
import ai.koog.agents.core.tools.reflect.ToolSet
import ai.koog.agents.core.tools.reflect.asTools
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
import kotlinx.serialization.builtins.serializer
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
    private val mcpClient: MCPClient = DefaultMCPClient()
) {

  companion object {
    private const val MAX_TOOL_CALLS = 5
  }

  /** Supported AI model providers */
  enum class ModelProvider {
    OPENAI,
    ANTHROPIC,
    GOOGLE
  }

  /** Configuration for AI model selection */
  data class ModelConfig(
      val provider: ModelProvider,
      val apiKey: String,
      val proxyEndpoint: String? = null
  )

  /** Generates a YAML test plan from a prompt using AI agent via Koog framework. */
  fun generatePlanFromPrompt(
      prompt: String,
      className: String,
      methodName: String,
      testResourcesDir: File
  ): String {
    val generatedPlanName = "${className}_${methodName}.yaml"
    val generatedPlanPath = "test-plans/generated/$generatedPlanName"

    // Create the generated plans directory if it doesn't exist
    val generatedPlansDir = File(testResourcesDir, "test-plans/generated")

    fileSystemOperations.createDirectories(generatedPlansDir)

    val generatedPlanFile = File(generatedPlansDir, generatedPlanName)

    // Check if plan already exists and is recent
    if (fileSystemOperations.fileExists(generatedPlanFile) &&
        !shouldRegeneratePlan(generatedPlanFile)) {
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

          val response = aiAgent.runAndGetResult(recoveryPrompt) ?: ""

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
          val response = aiAgent.runAndGetResult(planGenerationPrompt)

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
      val inputSchema: JsonElement
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
        // Create the JSON request manually since we're dealing with Map<String, Any>
        val paramsJson =
            koogJson.encodeToString(
                kotlinx.serialization.serializer<Map<String, Any>>(), parameters)
        val requestJson =
            """{"method":"tools/call","params":{"name":"$toolName","arguments":$paramsJson}}"""

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
              "MCP server returned status ${response.statusCode()}: ${response.body()}")
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
              "MCP server returned status ${response.statusCode()}: ${response.body()}")
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

  // Dynamic AutoMobile MCP Tools using ToolSet pattern
  class AutoMobileMCPTools(private val mcpClient: MCPClient) : ToolSet {
    private val availableTools: List<MCPToolDefinition> by lazy { mcpClient.listAvailableTools() }

    init {
      // Validate that we have the expected core tools
      val coreTools = listOf("observe", "tapOn", "typeText", "swipe", "waitFor", "goBack")
      val availableToolNames = availableTools.map { it.name }

      val missingTools = coreTools.filter { it !in availableToolNames }
      if (missingTools.isNotEmpty()) {
        println(
            "Warning: Some expected core tools are not available: ${missingTools.joinToString(", ")}")
        println("Available tools: ${availableToolNames.joinToString(", ")}")
      }
    }

    @ToolAnnotation
    @LLMDescription("Observe the current device state and UI hierarchy")
    fun observe(withViewHierarchy: Boolean = true, includeInvisible: Boolean = false): String {
      val parameters =
          mapOf("withViewHierarchy" to withViewHierarchy, "includeInvisible" to includeInvisible)
      return mcpClient.callTool("observe", parameters)
    }

    @ToolAnnotation
    @LLMDescription("Tap on UI elements by text, coordinates, or description")
    fun tapOn(text: String? = null, id: String? = null, x: Int? = null, y: Int? = null): String {
      val parameters = mutableMapOf<String, Any>()
      text?.let { parameters["text"] = it }
      id?.let { parameters["id"] = it }
      x?.let { parameters["x"] = it }
      y?.let { parameters["y"] = it }

      if (parameters.isEmpty()) {
        throw IllegalArgumentException("Must specify either text, id, or coordinates (x, y)")
      }

      return mcpClient.callTool("tapOn", parameters)
    }

    @ToolAnnotation
    @LLMDescription("Enter text into input fields or send text to the device")
    fun typeText(text: String): String {
      val parameters = mapOf("text" to text)
      return mcpClient.callTool("sendText", parameters)
    }

    @ToolAnnotation
    @LLMDescription("Input text with optional IME action")
    fun inputText(text: String, imeAction: String? = null): String {
      val parameters = mutableMapOf<String, Any>("text" to text)
      imeAction?.let { parameters["imeAction"] = it }
      return mcpClient.callTool("inputText", parameters)
    }

    @ToolAnnotation
    @LLMDescription("Perform swipe gestures for scrolling or navigation")
    fun swipe(direction: String = "up", containerElementId: String? = null): String {
      val parameters = mutableMapOf<String, Any>("direction" to direction)

      if (containerElementId != null) {
        parameters["containerElementId"] = containerElementId
        return mcpClient.callTool("scroll", parameters)
      } else {
        parameters["includeSystemInsets"] = false
        parameters["duration"] = 300
        return mcpClient.callTool("swipeOnScreen", parameters)
      }
    }

    @ToolAnnotation
    @LLMDescription("Scroll within a container element")
    fun scroll(
        containerElementId: String,
        direction: String = "up",
        lookForText: String? = null,
        lookForElementId: String? = null
    ): String {
      val parameters =
          mutableMapOf<String, Any>(
              "containerElementId" to containerElementId, "direction" to direction)

      if (lookForText != null || lookForElementId != null) {
        val lookFor = mutableMapOf<String, Any>()
        lookForText?.let { lookFor["text"] = it }
        lookForElementId?.let { lookFor["elementId"] = it }
        parameters["lookFor"] = lookFor
      }

      return mcpClient.callTool("scroll", parameters)
    }

    @ToolAnnotation
    @LLMDescription("Wait for elements to appear or conditions to be met")
    fun waitFor(text: String? = null, elementId: String? = null, timeout: Int = 5000): String {
      // Note: The current MCP server doesn't have a dedicated waitFor tool
      // We'll simulate it by repeatedly calling observe until the element is found
      val startTime = System.currentTimeMillis()
      val endTime = startTime + timeout

      while (System.currentTimeMillis() < endTime) {
        try {
          val observeResult = observe(withViewHierarchy = true)

          // Check if the element we're waiting for is present
          if (text != null && observeResult.contains(text, ignoreCase = true)) {
            return "Element with text '$text' found"
          }

          if (elementId != null && observeResult.contains(elementId)) {
            return "Element with ID '$elementId' found"
          }

          Thread.sleep(500) // Wait 500ms before checking again
        } catch (e: Exception) {
          // Continue waiting if there's an error
        }
      }

      val target = text ?: elementId ?: "unknown"
      throw RuntimeException("Timeout waiting for element: $target")
    }

    @ToolAnnotation
    @LLMDescription("Navigate back in the app using the back button")
    fun goBack(): String {
      val parameters = mapOf("button" to "back")
      return mcpClient.callTool("pressButton", parameters)
    }

    @ToolAnnotation
    @LLMDescription("Press a hardware button")
    fun pressButton(button: String): String {
      val parameters = mapOf("button" to button)
      return mcpClient.callTool("pressButton", parameters)
    }

    @ToolAnnotation
    @LLMDescription("Clear text from input fields")
    fun clearText(): String {
      return mcpClient.callTool("clearText", emptyMap())
    }

    @ToolAnnotation
    @LLMDescription("Launch an app by package ID")
    fun launchApp(appId: String): String {
      val parameters = mapOf("appId" to appId)
      return mcpClient.callTool("launchApp", parameters)
    }

    @ToolAnnotation
    @LLMDescription("Terminate an app by package ID")
    fun terminateApp(appId: String): String {
      val parameters = mapOf("appId" to appId)
      return mcpClient.callTool("terminateApp", parameters)
    }

    @ToolAnnotation
    @LLMDescription("Double tap on coordinates")
    fun doubleTapOn(x: Int, y: Int): String {
      val parameters = mapOf("x" to x, "y" to y)
      return mcpClient.callTool("doubleTapOn", parameters)
    }

    @ToolAnnotation
    @LLMDescription("Long press on coordinates or elements")
    fun longPressOn(
        text: String? = null,
        id: String? = null,
        x: Int? = null,
        y: Int? = null,
        duration: Int = 1000
    ): String {
      val parameters = mutableMapOf<String, Any>("duration" to duration)
      text?.let { parameters["text"] = it }
      id?.let { parameters["id"] = it }
      x?.let { parameters["x"] = it }
      y?.let { parameters["y"] = it }

      if (parameters.size == 1) { // Only duration was set
        throw IllegalArgumentException("Must specify either text, id, or coordinates (x, y)")
      }

      return mcpClient.callTool("longPressOn", parameters)
    }

    // Generic tool calling method for any tool not explicitly implemented above
    fun callGenericTool(toolName: String, parameters: Map<String, Any> = emptyMap()): String {
      return mcpClient.callTool(toolName, parameters)
    }

    // Method to list all available tools for debugging/introspection
    fun listAvailableTools(): List<String> {
      return availableTools.map { it.name }
    }
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
    fun createAIAgent(config: ModelConfig): AIAgent

    fun createAIAgentWithMCPTools(config: ModelConfig, mcpClient: MCPClient): AIAgent
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
                        "OpenAI API key not found. Set OPENAI_API_KEY environment variable or automobile.openai.api.key system property")

            ModelProvider.ANTHROPIC ->
                System.getenv("ANTHROPIC_API_KEY")
                    ?: System.getProperty("automobile.anthropic.api.key")
                    ?: throw RuntimeException(
                        "Anthropic API key not found. Set ANTHROPIC_API_KEY environment variable or automobile.anthropic.api.key system property")

            ModelProvider.GOOGLE ->
                System.getenv("GOOGLE_API_KEY")
                    ?: System.getProperty("automobile.google.api.key")
                    ?: throw RuntimeException(
                        "Google API key not found. Set GOOGLE_API_KEY environment variable or automobile.google.api.key system property")
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
      return System.getProperty("automobile.mcp.server.url", "http://localhost:3000")
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
    override fun createAIAgent(config: ModelConfig): AIAgent {
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
            ModelProvider.GOOGLE -> GoogleModels.Gemini2_5ProPreview0506
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
          executor = executor,
          llmModel = model,
          toolRegistry = ToolRegistry.EMPTY,
          systemPrompt = systemPrompt)
    }

    override fun createAIAgentWithMCPTools(config: ModelConfig, mcpClient: MCPClient): AIAgent {
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
            ModelProvider.GOOGLE -> GoogleModels.Gemini2_5ProPreview0506
          }

      // Create AutoMobile MCP tools using ToolSet pattern
      val mcpTools = AutoMobileMCPTools(mcpClient)
      val toolRegistry = ToolRegistry { tools(mcpTools.asTools()) }

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
          executor = executor,
          llmModel = model,
          toolRegistry = toolRegistry,
          systemPrompt = systemPrompt)
    }
  }

  class DefaultTimeProvider : TimeProvider {
    override fun currentTimeMillis(): Long = System.currentTimeMillis()
  }
}
