package dev.jasonpearson.automobile.junit

import ai.koog.agents.core.agent.AIAgent
import io.mockk.*
import java.io.File
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import org.junit.jupiter.api.io.TempDir

class AutoMobileAgentTest {

  private lateinit var mockConfigProvider: AutoMobileAgent.ConfigProvider
  private lateinit var mockFileSystemOperations: AutoMobileAgent.FileSystemOperations
  private lateinit var mockAiAgentFactory: AutoMobileAgent.AIAgentFactory
  private lateinit var mockTimeProvider: AutoMobileAgent.TimeProvider
  private lateinit var mockMcpClient: AutoMobileAgent.MCPClient
  private lateinit var mockAIAgent: AIAgent<String, String>
  private lateinit var autoMobileAgent: AutoMobileAgent

  @TempDir lateinit var tempDir: File

  @BeforeEach
  fun setUp() {
    mockConfigProvider = mockk()
    mockFileSystemOperations = mockk()
    mockAiAgentFactory = mockk()
    mockTimeProvider = mockk()
    mockMcpClient = mockk()
    mockAIAgent = mockk(relaxed = true)

    autoMobileAgent =
        AutoMobileAgent(
            configProvider = mockConfigProvider,
            fileSystemOperations = mockFileSystemOperations,
            aiAgentFactory = mockAiAgentFactory,
            timeProvider = mockTimeProvider,
            mcpClient = mockMcpClient,
            recoveryConfigProvider = StaticRecoveryConfigProvider(maxToolCalls = 5),
        )
  }

  @Test
  fun `generatePlanFromPrompt creates new plan when file does not exist`() {
    // Arrange
    val prompt = "Test login functionality"
    val className = "LoginTest"
    val methodName = "testLogin"
    val expectedPlanPath = "test-plans/generated/LoginTest_testLogin.yaml"
    val generatedPlansDir = File(tempDir, "test-plans/generated")
    val planFile = File(generatedPlansDir, "LoginTest_testLogin.yaml")
    val modelConfig = AutoMobileAgent.ModelConfig(AutoMobileAgent.ModelProvider.OPENAI, "test-key")
    val expectedYamlContent =
        """
        ---
        name: login-test
        description: Test login functionality
        steps:
          - tool: observe
            withViewHierarchy: true
            label: Initial observation
        """
            .trimIndent()

    every { mockFileSystemOperations.createDirectories(generatedPlansDir) } just runs
    every { mockFileSystemOperations.fileExists(planFile) } returns false
    every { mockConfigProvider.getModelConfig() } returns modelConfig
    every { mockAiAgentFactory.createAIAgent(modelConfig) } returns mockAIAgent
    every { mockConfigProvider.isDebugMode() } returns false
    every { mockFileSystemOperations.writeTextToFile(planFile, any()) } just runs

    coEvery { mockAIAgent.run(any()) } returns
        """
            ```yaml
            $expectedYamlContent
            ```
        """
            .trimIndent()

    // Act
    val result = autoMobileAgent.generatePlanFromPrompt(prompt, className, methodName, tempDir)

    // Assert
    assertEquals(expectedPlanPath, result)
    verify { mockFileSystemOperations.createDirectories(generatedPlansDir) }
    verify { mockFileSystemOperations.fileExists(planFile) }
    verify { mockFileSystemOperations.writeTextToFile(planFile, any()) }
    coVerify { mockAIAgent.run(any()) }
  }

  @Test
  fun `generatePlanFromPrompt uses existing plan when file exists and is recent`() {
    // Arrange
    val prompt = "Test login functionality"
    val className = "LoginTest"
    val methodName = "testLogin"
    val expectedPlanPath = "test-plans/generated/LoginTest_testLogin.yaml"
    val generatedPlansDir = File(tempDir, "test-plans/generated")
    val planFile = File(generatedPlansDir, "LoginTest_testLogin.yaml")
    val currentTime = 1000L
    val fileTime = 500L
    val maxAge = 3600000L // 1 hour

    every { mockFileSystemOperations.createDirectories(generatedPlansDir) } just runs
    every { mockFileSystemOperations.fileExists(planFile) } returns true
    every { mockTimeProvider.currentTimeMillis() } returns currentTime
    every { mockFileSystemOperations.getLastModified(planFile) } returns fileTime
    every { mockConfigProvider.getPlanMaxAgeMs() } returns maxAge

    // Act
    val result = autoMobileAgent.generatePlanFromPrompt(prompt, className, methodName, tempDir)

    // Assert
    assertEquals(expectedPlanPath, result)
    verify { mockFileSystemOperations.createDirectories(generatedPlansDir) }
    verify { mockFileSystemOperations.fileExists(planFile) }
    verify(exactly = 0) { mockFileSystemOperations.writeTextToFile(any(), any()) }
    coVerify(exactly = 0) { mockAIAgent.run(any()) }
  }

  @Test
  fun `generatePlanFromPrompt regenerates plan when file is old`() {
    // Arrange
    val prompt = "Test login functionality"
    val className = "LoginTest"
    val methodName = "testLogin"
    val generatedPlansDir = File(tempDir, "test-plans/generated")
    val planFile = File(generatedPlansDir, "LoginTest_testLogin.yaml")
    val currentTime = 4000000L
    val fileTime = 500L
    val maxAge = 3600000L // 1 hour
    val modelConfig = AutoMobileAgent.ModelConfig(AutoMobileAgent.ModelProvider.OPENAI, "test-key")
    val yamlContent = "---\nname: test\nsteps: []"

    every { mockFileSystemOperations.createDirectories(generatedPlansDir) } just runs
    every { mockFileSystemOperations.fileExists(planFile) } returns true
    every { mockTimeProvider.currentTimeMillis() } returns currentTime andThen fileTime
    every { mockFileSystemOperations.getLastModified(planFile) } returns fileTime
    every { mockConfigProvider.getPlanMaxAgeMs() } returns maxAge
    every { mockConfigProvider.getModelConfig() } returns modelConfig
    every { mockAiAgentFactory.createAIAgent(modelConfig) } returns mockAIAgent
    every { mockConfigProvider.isDebugMode() } returns false
    every { mockFileSystemOperations.writeTextToFile(planFile, any()) } just runs

    coEvery { mockAIAgent.run(any()) } returns "```yaml\n$yamlContent\n```"

    // Act
    autoMobileAgent.generatePlanFromPrompt(prompt, className, methodName, tempDir)

    // Assert
    verify { mockFileSystemOperations.writeTextToFile(planFile, yamlContent) }
    coVerify { mockAIAgent.run(any()) }
  }

  @Test
  fun `generatePlanFromPrompt throws exception when AI agent fails`() {
    // Arrange
    val prompt = "Test login functionality"
    val className = "LoginTest"
    val methodName = "testLogin"
    val generatedPlansDir = File(tempDir, "test-plans/generated")
    val planFile = File(generatedPlansDir, "LoginTest_testLogin.yaml")
    val modelConfig = AutoMobileAgent.ModelConfig(AutoMobileAgent.ModelProvider.OPENAI, "test-key")

    every { mockFileSystemOperations.createDirectories(generatedPlansDir) } just runs
    every { mockFileSystemOperations.fileExists(planFile) } returns false
    every { mockConfigProvider.getModelConfig() } returns modelConfig
    every { mockAiAgentFactory.createAIAgent(modelConfig) } returns mockAIAgent

    coEvery { mockAIAgent.run(any()) } throws RuntimeException("AI agent failed")

    // Act & Assert
    val exception =
        assertThrows<RuntimeException> {
          autoMobileAgent.generatePlanFromPrompt(prompt, className, methodName, tempDir)
        }
    assertTrue(exception.message!!.contains("Failed to generate YAML plan from prompt"))
  }

  @Test
  fun `attemptAiRecovery returns success when agent completes and observe succeeds`() {
    // Arrange
    val context = FailedStepContext(
        failedStepIndex = 2,
        failedTool = "tapOn",
        error = "Element not found",
        succeededSteps = listOf(
            SucceededStepSummary(0, "observe"),
            SucceededStepSummary(1, "tapOn"),
        ),
        planContent = "name: test\nsteps: []",
        deviceId = "emulator-5554",
    )
    val startTime = 1000L
    val endTime = 2000L
    val modelConfig = AutoMobileAgent.ModelConfig(AutoMobileAgent.ModelProvider.OPENAI, "test-key")

    every { mockTimeProvider.currentTimeMillis() } returns startTime andThen endTime
    every { mockConfigProvider.getMcpServerUrl() } returns "http://localhost:3000"
    every { mockMcpClient.isConnected() } returns false
    every { mockMcpClient.connect("http://localhost:3000") } just runs
    every { mockMcpClient.disconnect() } just runs
    every { mockConfigProvider.getModelConfig() } returns modelConfig
    every { mockAiAgentFactory.createAIAgentWithMCPTools(modelConfig, mockMcpClient, 5) } returns
        mockAIAgent
    every { mockMcpClient.callTool("observe", any()) } returns """{"elements": []}"""

    coEvery { mockAIAgent.run(any()) } returns "Recovery actions taken"

    // Act
    val result = autoMobileAgent.attemptAiRecovery(context)

    // Assert
    assertTrue(result.success)
    assertEquals(1000L, result.recoveryTimeMs)
    assertTrue(result.observeResultAfterRecovery != null)
    coVerify(exactly = 1) { mockAIAgent.run(any()) }
  }

  @Test
  fun `attemptAiRecovery returns failure when agent throws exception`() {
    // Arrange
    val context = FailedStepContext(
        failedStepIndex = 0,
        failedTool = "tapOn",
        error = "Element not found",
        succeededSteps = emptyList(),
        planContent = "name: test\nsteps: []",
        deviceId = null,
    )
    val startTime = 1000L
    val endTime = 2000L
    val modelConfig = AutoMobileAgent.ModelConfig(AutoMobileAgent.ModelProvider.OPENAI, "test-key")

    every { mockTimeProvider.currentTimeMillis() } returns startTime andThen endTime
    every { mockConfigProvider.getMcpServerUrl() } returns "http://localhost:3000"
    every { mockMcpClient.isConnected() } returns false
    every { mockMcpClient.connect("http://localhost:3000") } just runs
    every { mockMcpClient.disconnect() } just runs
    every { mockConfigProvider.getModelConfig() } returns modelConfig
    every { mockAiAgentFactory.createAIAgentWithMCPTools(modelConfig, mockMcpClient, 5) } returns
        mockAIAgent

    coEvery { mockAIAgent.run(any()) } throws RuntimeException("AI failed")

    // Act
    val result = autoMobileAgent.attemptAiRecovery(context)

    // Assert
    assertFalse(result.success)
    assertEquals(1000L, result.recoveryTimeMs)
  }

  @Test
  fun `attemptAiRecovery returns failure when config provider throws exception`() {
    // Arrange
    val context = FailedStepContext(
        failedStepIndex = 0,
        failedTool = "tapOn",
        error = "Element not found",
        succeededSteps = emptyList(),
        planContent = "name: test\nsteps: []",
        deviceId = null,
    )
    val startTime = 1000L
    val endTime = 2000L

    every { mockTimeProvider.currentTimeMillis() } returns startTime andThen endTime
    every { mockConfigProvider.getMcpServerUrl() } throws RuntimeException("Config error")

    // Act
    val result = autoMobileAgent.attemptAiRecovery(context)

    // Assert
    assertFalse(result.success)
    assertEquals(1000L, result.recoveryTimeMs)
  }

  @Test
  fun `attemptAiRecovery uses recoveryConfigProvider for max tool calls`() {
    // Arrange
    val customMaxToolCalls = 10
    val customAgent =
        AutoMobileAgent(
            configProvider = mockConfigProvider,
            fileSystemOperations = mockFileSystemOperations,
            aiAgentFactory = mockAiAgentFactory,
            timeProvider = mockTimeProvider,
            mcpClient = mockMcpClient,
            recoveryConfigProvider = StaticRecoveryConfigProvider(maxToolCalls = customMaxToolCalls),
        )
    val context = FailedStepContext(
        failedStepIndex = 0,
        failedTool = "tapOn",
        error = "Element not found",
        succeededSteps = emptyList(),
        planContent = "name: test\nsteps: []",
        deviceId = null,
    )
    val modelConfig = AutoMobileAgent.ModelConfig(AutoMobileAgent.ModelProvider.OPENAI, "test-key")

    every { mockTimeProvider.currentTimeMillis() } returns 1000L andThen 2000L
    every { mockConfigProvider.getMcpServerUrl() } returns "http://localhost:3000"
    every { mockMcpClient.isConnected() } returns false
    every { mockMcpClient.connect("http://localhost:3000") } just runs
    every { mockMcpClient.disconnect() } just runs
    every { mockConfigProvider.getModelConfig() } returns modelConfig
    every { mockAiAgentFactory.createAIAgentWithMCPTools(modelConfig, mockMcpClient, customMaxToolCalls) } returns
        mockAIAgent
    every { mockMcpClient.callTool("observe", any()) } returns """{"elements": []}"""

    coEvery { mockAIAgent.run(any()) } returns "Done"

    // Act
    customAgent.attemptAiRecovery(context)

    // Assert - verify factory was called with the custom max tool calls
    verify { mockAiAgentFactory.createAIAgentWithMCPTools(modelConfig, mockMcpClient, customMaxToolCalls) }
  }

  @Test
  fun `extractYamlFromResponse extracts YAML from code blocks`() {
    // Arrange
    val agent = AutoMobileAgent()
    val response =
        """
        Here's your YAML plan:
        ```yaml
        ---
        name: test-plan
        description: A test plan
        steps:
          - tool: observe
        ```
        That should work!
        """
            .trimIndent()

    // Act - using reflection to access private method for testing
    val method =
        AutoMobileAgent::class.java.getDeclaredMethod("extractYamlFromResponse", String::class.java)
    method.isAccessible = true
    val result = method.invoke(agent, response) as String

    // Assert
    val expectedYaml =
        """
        ---
        name: test-plan
        description: A test plan
        steps:
          - tool: observe
        """
            .trimIndent()
    assertEquals(expectedYaml, result)
  }

  @Test
  fun `extractYamlFromResponse extracts YAML starting with triple dashes`() {
    // Arrange
    val agent = AutoMobileAgent()
    val response =
        """
        Here's your plan:

        ---
        name: test-plan
        description: A test plan
        steps:
          - tool: observe
        """
            .trimIndent()

    // Act
    val method =
        AutoMobileAgent::class.java.getDeclaredMethod("extractYamlFromResponse", String::class.java)
    method.isAccessible = true
    val result = method.invoke(agent, response) as String

    // Assert
    val expectedYaml =
        """
        ---
        name: test-plan
        description: A test plan
        steps:
          - tool: observe
        """
            .trimIndent()
    assertEquals(expectedYaml, result)
  }

  @Test
  fun `extractYamlFromResponse returns entire response if it looks like YAML`() {
    // Arrange
    val agent = AutoMobileAgent()
    val response =
        """
        name: test-plan
        description: A test plan
        steps:
          - tool: observe
        """
            .trimIndent()

    // Act
    val method =
        AutoMobileAgent::class.java.getDeclaredMethod("extractYamlFromResponse", String::class.java)
    method.isAccessible = true
    val result = method.invoke(agent, response) as String

    // Assert
    assertEquals(response, result)
  }

  @Test
  fun `extractYamlFromResponse returns empty string for invalid content`() {
    // Arrange
    val agent = AutoMobileAgent()
    val response = "This is just regular text without YAML structure"

    // Act
    val method =
        AutoMobileAgent::class.java.getDeclaredMethod("extractYamlFromResponse", String::class.java)
    method.isAccessible = true
    val result = method.invoke(agent, response) as String

    // Assert
    assertEquals("", result)
  }

  @Test
  fun `extractYamlFromResponse handles null input`() {
    // Arrange
    val agent = AutoMobileAgent()

    // Act
    val method =
        AutoMobileAgent::class.java.getDeclaredMethod("extractYamlFromResponse", String::class.java)
    method.isAccessible = true
    val result = method.invoke(agent, null) as String

    // Assert
    assertEquals("", result)
  }
}
