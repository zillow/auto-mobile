package dev.jasonpearson.automobile.junit

import dev.jasonpearson.automobile.validation.ErrorToolResult
import dev.jasonpearson.automobile.validation.TapOnResponse
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

class AutoMobilePlanExecutorTest {
  private val json = Json { ignoreUnknownKeys = true }
  private lateinit var fakeDaemonClient: FakeDaemonToolClient
  private lateinit var fakeDeviceChecker: FakeDeviceChecker

  @Before
  fun setup() {
    fakeDaemonClient = FakeDaemonToolClient()
    fakeDeviceChecker = FakeDeviceChecker(devicesAvailable = true)
    DaemonSocketClientManager.testClient = fakeDaemonClient
    AutoMobileSharedUtils.testDeviceChecker = fakeDeviceChecker
    DaemonHeartbeat.testController = FakeDaemonHeartbeat()
  }

  @After
  fun tearDown() {
    DaemonSocketClientManager.testClient = null
    AutoMobileSharedUtils.testDeviceChecker = null
    DaemonHeartbeat.testController = null
  }

  @Test
  fun `parse tool results from successful plan execution`() {
    val step =
        JsonObject(
            mapOf(
                "toolName" to JsonPrimitive("tapOn"),
                "success" to JsonPrimitive(true),
                "action" to JsonPrimitive("tap"),
                "selectedElement" to
                    JsonObject(
                        mapOf(
                            "text" to JsonPrimitive("Test Channel"),
                            "resourceId" to JsonPrimitive("com.example:id/item"),
                            "bounds" to
                                JsonObject(
                                    mapOf(
                                        "left" to JsonPrimitive(0),
                                        "top" to JsonPrimitive(0),
                                        "right" to JsonPrimitive(100),
                                        "bottom" to JsonPrimitive(100),
                                        "centerX" to JsonPrimitive(50),
                                        "centerY" to JsonPrimitive(50),
                                    )
                                ),
                            "indexInMatches" to JsonPrimitive(2),
                            "totalMatches" to JsonPrimitive(5),
                            "selectionStrategy" to JsonPrimitive("random"),
                        )
                    ),
            )
        )

    fakeDaemonClient.setResponse(
        "executePlan",
        buildDaemonResponse(
            JsonObject(
                mapOf(
                    "success" to JsonPrimitive(true),
                    "toolResults" to JsonArray(listOf(step)),
                )
            )
        ),
    )

    val result = executePlan()

    assertTrue(result.success)
    assertEquals(1, result.toolResults.size)
    assertEquals("Test Channel", result.getSelection(0))
  }

  @Test
  fun `getSelection returns null when selectedElement is missing`() {
    val step =
        JsonObject(
            mapOf(
                "toolName" to JsonPrimitive("tapOn"),
                "success" to JsonPrimitive(true),
                "action" to JsonPrimitive("tap"),
            )
        )

    fakeDaemonClient.setResponse(
        "executePlan",
        buildDaemonResponse(
            JsonObject(
                mapOf(
                    "success" to JsonPrimitive(true),
                    "toolResults" to JsonArray(listOf(step)),
                )
            )
        ),
    )

    val result = executePlan()

    assertNull(result.getSelection(0))
  }

  @Test
  fun `getTypedResponse returns correct response type`() {
    val step =
        JsonObject(
            mapOf(
                "toolName" to JsonPrimitive("tapOn"),
                "success" to JsonPrimitive(true),
                "selectedElement" to
                    JsonObject(
                        mapOf(
                            "text" to JsonPrimitive("Channel A"),
                            "indexInMatches" to JsonPrimitive(3),
                            "totalMatches" to JsonPrimitive(10),
                        )
                    ),
            )
        )

    fakeDaemonClient.setResponse(
        "executePlan",
        buildDaemonResponse(
            JsonObject(
                mapOf(
                    "success" to JsonPrimitive(true),
                    "toolResults" to JsonArray(listOf(step)),
                )
            )
        ),
    )

    val result = executePlan()
    val tapOnResponse = result.getTypedResponse<TapOnResponse>(0)

    assertNotNull(tapOnResponse)
    assertEquals("Channel A", tapOnResponse?.selectedElement?.text)
    assertEquals(3, tapOnResponse?.selectedElement?.indexInMatches)
  }

  @Test
  fun `parsing errors are handled gracefully`() {
    val step = JsonObject(emptyMap())

    fakeDaemonClient.setResponse(
        "executePlan",
        buildDaemonResponse(
            JsonObject(
                mapOf(
                    "success" to JsonPrimitive(true),
                    "toolResults" to JsonArray(listOf(step)),
                )
            )
        ),
    )

    val result = executePlan()

    assertEquals(1, result.toolResults.size)
    val errorResult = result.toolResults[0] as? ErrorToolResult
    assertNotNull(errorResult)
    assertTrue(errorResult?.errorMessage?.contains("Missing tool name") == true)
  }

  private fun executePlan(): AutoMobilePlanExecutionResult {
    return AutoMobilePlanExecutor.execute(
        "test-plans/launch-clock-app.yaml",
        emptyMap(),
        AutoMobilePlanExecutionOptions(),
    )
  }

  private fun buildDaemonResponse(payload: JsonObject): DaemonResponse {
    val textPayload = json.encodeToString(JsonElement.serializer(), payload)
    val result =
        JsonObject(
            mapOf(
                "content" to
                    JsonArray(
                        listOf(
                            JsonObject(
                                mapOf(
                                    "type" to JsonPrimitive("text"),
                                    "text" to JsonPrimitive(textPayload),
                                )
                            )
                        )
                    )
            )
        )
    return DaemonResponse(
        id = "test",
        type = "mcp_response",
        success = true,
        result = result,
        error = null,
    )
  }
}

private class FakeDaemonToolClient : DaemonToolClient {
  private val responses = mutableMapOf<String, DaemonResponse>()
  override val sessionUuid: String = "test-session"

  fun setResponse(toolName: String, response: DaemonResponse) {
    responses[toolName] = response
  }

  override fun callTool(
      toolName: String,
      arguments: JsonObject,
      timeoutMs: Long,
  ): DaemonResponse {
    return responses[toolName]
        ?: throw IllegalStateException("No response configured for tool: $toolName")
  }

  override fun readResource(uri: String, timeoutMs: Long): DaemonResponse {
    throw IllegalStateException("readResource not configured for $uri")
  }
}

private class FakeDeviceChecker(private val devicesAvailable: Boolean) : DeviceChecker {
  override fun checkDeviceAvailability() = Unit

  override fun areDevicesAvailable(): Boolean = devicesAvailable

  override fun getDeviceCount(): Int = if (devicesAvailable) 1 else 0
}

private class FakeDaemonHeartbeat : DaemonHeartbeatController {
  override fun startBackground(intervalMs: Long) = java.io.Closeable {}

  override fun registerSession(sessionId: String) = Unit

  override fun unregisterSession(sessionId: String) = Unit
}
