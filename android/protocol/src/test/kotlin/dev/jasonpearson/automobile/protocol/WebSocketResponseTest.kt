package dev.jasonpearson.automobile.protocol

import kotlinx.serialization.json.Json
import org.junit.jupiter.api.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class WebSocketResponseTest {
  private val json = Json {
    classDiscriminator = "type"
    encodeDefaults = true
  }

  @Test
  fun `serialize swipe_result`() {
    val response: WebSocketResponse = SwipeResult(
      timestamp = 1234567890L,
      requestId = "swipe-1",
      success = true,
      totalTimeMs = 350L,
      gestureTimeMs = 300L
    )

    val encoded = json.encodeToString(WebSocketResponse.serializer(), response)

    assertTrue(encoded.contains(""""type":"swipe_result""""))
    assertTrue(encoded.contains(""""requestId":"swipe-1""""))
    assertTrue(encoded.contains(""""success":true"""))
    assertTrue(encoded.contains(""""totalTimeMs":350"""))
    assertTrue(encoded.contains(""""gestureTimeMs":300"""))
  }

  @Test
  fun `serialize screenshot_result`() {
    val response: WebSocketResponse = ScreenshotResult(
      timestamp = 1234567890L,
      requestId = "ss-1",
      data = "base64data",
      format = "png",
      width = 1080,
      height = 1920
    )

    val encoded = json.encodeToString(WebSocketResponse.serializer(), response)

    assertTrue(encoded.contains(""""type":"screenshot""""))
    assertTrue(encoded.contains(""""requestId":"ss-1""""))
    assertTrue(encoded.contains(""""data":"base64data""""))
    assertTrue(encoded.contains(""""format":"png""""))
    assertTrue(encoded.contains(""""width":1080"""))
    assertTrue(encoded.contains(""""height":1920"""))
  }

  @Test
  fun `serialize hierarchy_update event`() {
    val response: WebSocketResponse = HierarchyUpdateEvent(
      timestamp = 1234567890L,
      data = """{"nodes":[]}""",
      perfTiming = """{"total":50}"""
    )

    val encoded = json.encodeToString(WebSocketResponse.serializer(), response)

    assertTrue(encoded.contains(""""type":"hierarchy_update""""))
    assertTrue(encoded.contains(""""data":"{\"nodes\":[]}""""))
    assertTrue(encoded.contains(""""perfTiming":"{\"total\":50}""""))
  }

  @Test
  fun `serialize connected response`() {
    val response: WebSocketResponse = ConnectedResponse(
      id = 1,
      timestamp = 1234567890L
    )

    val encoded = json.encodeToString(WebSocketResponse.serializer(), response)

    assertTrue(encoded.contains(""""type":"connected""""))
    assertTrue(encoded.contains(""""id":1"""))
  }

  @Test
  fun `serialize permission_result`() {
    val response: WebSocketResponse = PermissionResult(
      timestamp = 1234567890L,
      requestId = "perm-1",
      success = true,
      permission = "android.permission.CAMERA",
      granted = true,
      canRequest = false,
      totalTimeMs = 10L
    )

    val encoded = json.encodeToString(WebSocketResponse.serializer(), response)

    assertTrue(encoded.contains(""""type":"permission_result""""))
    assertTrue(encoded.contains(""""permission":"android.permission.CAMERA""""))
    assertTrue(encoded.contains(""""granted":true"""))
  }

  @Test
  fun `serialize error result`() {
    val response: WebSocketResponse = SwipeResult(
      timestamp = 1234567890L,
      requestId = "swipe-error",
      success = false,
      totalTimeMs = 100L,
      error = "Gesture failed: timeout"
    )

    val encoded = json.encodeToString(WebSocketResponse.serializer(), response)

    assertTrue(encoded.contains(""""success":false"""))
    assertTrue(encoded.contains(""""error":"Gesture failed: timeout""""))
  }
}
