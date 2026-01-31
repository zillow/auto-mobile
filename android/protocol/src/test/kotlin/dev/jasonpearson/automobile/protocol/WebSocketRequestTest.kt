package dev.jasonpearson.automobile.protocol

import kotlinx.serialization.json.Json
import org.junit.jupiter.api.Test
import kotlin.test.assertEquals
import kotlin.test.assertIs

class WebSocketRequestTest {
  private val json = Json {
    classDiscriminator = "type"
    ignoreUnknownKeys = true
  }

  @Test
  fun `deserialize request_hierarchy`() {
    val message = """{"type":"request_hierarchy","requestId":"test-1"}"""
    val request = json.decodeFromString<WebSocketRequest>(message)

    assertIs<RequestHierarchy>(request)
    assertEquals("test-1", request.requestId)
    assertEquals(false, request.disableAllFiltering)
  }

  @Test
  fun `deserialize request_hierarchy with filtering disabled`() {
    val message = """{"type":"request_hierarchy","requestId":"test-2","disableAllFiltering":true}"""
    val request = json.decodeFromString<WebSocketRequest>(message)

    assertIs<RequestHierarchy>(request)
    assertEquals("test-2", request.requestId)
    assertEquals(true, request.disableAllFiltering)
  }

  @Test
  fun `deserialize request_tap_coordinates`() {
    val message = """{"type":"request_tap_coordinates","requestId":"tap-1","x":100,"y":200}"""
    val request = json.decodeFromString<WebSocketRequest>(message)

    assertIs<RequestTapCoordinates>(request)
    assertEquals("tap-1", request.requestId)
    assertEquals(100, request.x)
    assertEquals(200, request.y)
    assertEquals(10L, request.duration) // default
  }

  @Test
  fun `deserialize request_swipe`() {
    val message = """{"type":"request_swipe","requestId":"swipe-1","x1":0,"y1":100,"x2":0,"y2":500,"duration":400}"""
    val request = json.decodeFromString<WebSocketRequest>(message)

    assertIs<RequestSwipe>(request)
    assertEquals("swipe-1", request.requestId)
    assertEquals(0, request.x1)
    assertEquals(100, request.y1)
    assertEquals(0, request.x2)
    assertEquals(500, request.y2)
    assertEquals(400L, request.duration)
  }

  @Test
  fun `deserialize request_drag with legacy fields`() {
    val message = """{"type":"request_drag","requestId":"drag-1","x1":50,"y1":50,"x2":150,"y2":150,"holdTime":800,"duration":500}"""
    val request = json.decodeFromString<WebSocketRequest>(message)

    assertIs<RequestDrag>(request)
    assertEquals("drag-1", request.requestId)
    assertEquals(50, request.x1)
    assertEquals(50, request.y1)
    assertEquals(150, request.x2)
    assertEquals(150, request.y2)
    // Legacy fields are used as fallback
    assertEquals(800L, request.resolvedPressDurationMs)
    assertEquals(500L, request.resolvedDragDurationMs)
  }

  @Test
  fun `deserialize request_pinch`() {
    val message = """{"type":"request_pinch","requestId":"pinch-1","centerX":540,"centerY":960,"distanceStart":100,"distanceEnd":300,"rotationDegrees":45.0,"duration":500}"""
    val request = json.decodeFromString<WebSocketRequest>(message)

    assertIs<RequestPinch>(request)
    assertEquals("pinch-1", request.requestId)
    assertEquals(540, request.centerX)
    assertEquals(960, request.centerY)
    assertEquals(100, request.distanceStart)
    assertEquals(300, request.distanceEnd)
    assertEquals(45.0f, request.rotationDegrees)
    assertEquals(500L, request.duration)
  }

  @Test
  fun `deserialize request_set_text`() {
    val message = """{"type":"request_set_text","requestId":"text-1","text":"Hello World","resourceId":"input_field"}"""
    val request = json.decodeFromString<WebSocketRequest>(message)

    assertIs<RequestSetText>(request)
    assertEquals("text-1", request.requestId)
    assertEquals("Hello World", request.text)
    assertEquals("input_field", request.resourceId)
  }

  @Test
  fun `deserialize request_ime_action`() {
    val message = """{"type":"request_ime_action","requestId":"ime-1","action":"search"}"""
    val request = json.decodeFromString<WebSocketRequest>(message)

    assertIs<RequestImeAction>(request)
    assertEquals("ime-1", request.requestId)
    assertEquals("search", request.action)
  }

  @Test
  fun `deserialize request_clipboard`() {
    val message = """{"type":"request_clipboard","requestId":"clip-1","action":"copy","text":"Copied text"}"""
    val request = json.decodeFromString<WebSocketRequest>(message)

    assertIs<RequestClipboard>(request)
    assertEquals("clip-1", request.requestId)
    assertEquals("copy", request.action)
    assertEquals("Copied text", request.text)
  }

  @Test
  fun `deserialize add_highlight`() {
    val message = """{"type":"add_highlight","requestId":"hl-1","id":"highlight-1","shape":{"type":"box","bounds":{"x":0,"y":0,"width":100,"height":50}}}"""
    val request = json.decodeFromString<WebSocketRequest>(message)

    assertIs<AddHighlight>(request)
    assertEquals("hl-1", request.requestId)
    assertEquals("highlight-1", request.id)
    assertEquals("box", request.shape?.type)
    assertEquals(100, request.shape?.bounds?.width)
    assertEquals(50, request.shape?.bounds?.height)
  }

  @Test
  fun `deserialize get_preferences`() {
    val message = """{"type":"get_preferences","requestId":"pref-1","packageName":"com.example.app","fileName":"settings.xml"}"""
    val request = json.decodeFromString<WebSocketRequest>(message)

    assertIs<GetPreferences>(request)
    assertEquals("pref-1", request.requestId)
    assertEquals("com.example.app", request.packageName)
    assertEquals("settings.xml", request.fileName)
  }
}
