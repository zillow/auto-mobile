package dev.jasonpearson.automobile.protocol

import kotlinx.serialization.json.Json
import org.junit.jupiter.api.Test
import kotlin.test.assertEquals
import kotlin.test.assertIs
import kotlin.test.assertNotNull
import kotlin.test.assertTrue

class TelemetryEventTest {
  private val json = Json {
    classDiscriminator = "type"
    ignoreUnknownKeys = true
    encodeDefaults = true
  }

  @Test
  fun `serialize and deserialize network request event`() {
    val event: SdkEvent = SdkNetworkRequestEvent(
      timestamp = 1000L,
      applicationId = "com.example.app",
      url = "https://api.example.com/users",
      method = "GET",
      statusCode = 200,
      durationMs = 150,
      requestBodySize = 0,
      responseBodySize = 1024,
      protocol = "h2",
      host = "api.example.com",
      path = "/users",
    )

    val encoded = json.encodeToString(SdkEvent.serializer(), event)
    assertTrue(encoded.contains(""""type":"network_request""""))

    val decoded = json.decodeFromString<SdkEvent>(encoded)
    assertIs<SdkNetworkRequestEvent>(decoded)
    assertEquals("https://api.example.com/users", decoded.url)
    assertEquals("GET", decoded.method)
    assertEquals(200, decoded.statusCode)
    assertEquals(150L, decoded.durationMs)
    assertEquals("h2", decoded.protocol)
  }

  @Test
  fun `serialize and deserialize websocket frame event`() {
    val event: SdkEvent = SdkWebSocketFrameEvent(
      timestamp = 2000L,
      applicationId = "com.example.app",
      connectionId = "abc123",
      url = "wss://ws.example.com",
      direction = WebSocketFrameDirection.RECEIVED,
      frameType = WebSocketFrameType.TEXT,
      payloadSize = 256,
    )

    val encoded = json.encodeToString(SdkEvent.serializer(), event)
    assertTrue(encoded.contains(""""type":"websocket_frame""""))

    val decoded = json.decodeFromString<SdkEvent>(encoded)
    assertIs<SdkWebSocketFrameEvent>(decoded)
    assertEquals("abc123", decoded.connectionId)
    assertEquals(WebSocketFrameDirection.RECEIVED, decoded.direction)
    assertEquals(WebSocketFrameType.TEXT, decoded.frameType)
  }

  @Test
  fun `serialize and deserialize log event`() {
    val event: SdkEvent = SdkLogEvent(
      timestamp = 3000L,
      applicationId = "com.example.app",
      level = 4, // INFO
      tag = "OkHttp",
      message = "HTTP 200 GET /users (150ms)",
      filterName = "http",
    )

    val encoded = json.encodeToString(SdkEvent.serializer(), event)
    assertTrue(encoded.contains(""""type":"log""""))

    val decoded = json.decodeFromString<SdkEvent>(encoded)
    assertIs<SdkLogEvent>(decoded)
    assertEquals("OkHttp", decoded.tag)
    assertEquals("http", decoded.filterName)
    assertEquals(4, decoded.level)
  }

  @Test
  fun `serialize and deserialize broadcast event`() {
    val event: SdkEvent = SdkBroadcastEvent(
      timestamp = 4000L,
      applicationId = "com.example.app",
      action = "android.intent.action.LOCALE_CHANGED",
      categories = listOf("android.intent.category.DEFAULT"),
      extraKeys = mapOf("locale" to "String"),
    )

    val encoded = json.encodeToString(SdkEvent.serializer(), event)
    assertTrue(encoded.contains(""""type":"broadcast""""))

    val decoded = json.decodeFromString<SdkEvent>(encoded)
    assertIs<SdkBroadcastEvent>(decoded)
    assertEquals("android.intent.action.LOCALE_CHANGED", decoded.action)
  }

  @Test
  fun `serialize and deserialize lifecycle event`() {
    val event: SdkEvent = SdkLifecycleEvent(
      timestamp = 5000L,
      applicationId = "com.example.app",
      kind = "foreground",
      details = null,
    )

    val encoded = json.encodeToString(SdkEvent.serializer(), event)
    assertTrue(encoded.contains(""""type":"lifecycle""""))

    val decoded = json.decodeFromString<SdkEvent>(encoded)
    assertIs<SdkLifecycleEvent>(decoded)
    assertEquals("foreground", decoded.kind)
  }

  @Test
  fun `serialize and deserialize custom event`() {
    val event: SdkEvent = SdkCustomEvent(
      timestamp = 6000L,
      applicationId = "com.example.app",
      name = "purchase_completed",
      properties = mapOf("amount" to "9.99", "currency" to "USD"),
    )

    val encoded = json.encodeToString(SdkEvent.serializer(), event)
    assertTrue(encoded.contains(""""type":"custom""""))

    val decoded = json.decodeFromString<SdkEvent>(encoded)
    assertIs<SdkCustomEvent>(decoded)
    assertEquals("purchase_completed", decoded.name)
    assertEquals("9.99", decoded.properties["amount"])
  }

  @Test
  fun `serialize and deserialize event batch`() {
    val batch: SdkEvent = SdkEventBatch(
      timestamp = 7000L,
      applicationId = "com.example.app",
      events = listOf(
        SdkNetworkRequestEvent(
          timestamp = 7001L,
          url = "https://api.example.com",
          method = "POST",
          statusCode = 201,
        ),
        SdkLogEvent(
          timestamp = 7002L,
          level = 5,
          tag = "MyTag",
          message = "Warning",
          filterName = "all",
        ),
        SdkCustomEvent(
          timestamp = 7003L,
          name = "click",
          properties = mapOf("button" to "submit"),
        ),
      ),
    )

    val encoded = json.encodeToString(SdkEvent.serializer(), batch)
    assertTrue(encoded.contains(""""type":"event_batch""""))

    val decoded = json.decodeFromString<SdkEvent>(encoded)
    assertIs<SdkEventBatch>(decoded)
    assertEquals(3, decoded.events.size)
    assertIs<SdkNetworkRequestEvent>(decoded.events[0])
    assertIs<SdkLogEvent>(decoded.events[1])
    assertIs<SdkCustomEvent>(decoded.events[2])
  }

  @Test
  fun `SdkEventSerializer roundtrip for all new types`() {
    val events = listOf<SdkEvent>(
      SdkNetworkRequestEvent(timestamp = 1L, url = "https://x.com", method = "GET"),
      SdkWebSocketFrameEvent(timestamp = 2L, connectionId = "c1", url = "wss://x.com", direction = WebSocketFrameDirection.SENT, frameType = WebSocketFrameType.BINARY),
      SdkLogEvent(timestamp = 3L, level = 6, tag = "E", message = "err", filterName = "f"),
      SdkBroadcastEvent(timestamp = 4L, action = "A"),
      SdkLifecycleEvent(timestamp = 5L, kind = "background"),
      SdkCustomEvent(timestamp = 6L, name = "ev"),
    )

    for (event in events) {
      val j = SdkEventSerializer.toJson(event)
      val back = SdkEventSerializer.fromJson(j)
      assertNotNull(back, "Failed roundtrip for ${event::class.simpleName}")
      assertEquals(event, back)
    }
  }

  @Test
  fun `getEventType returns correct type for new events`() {
    assertEquals("network_request", SdkEventSerializer.getEventType(SdkNetworkRequestEvent(timestamp = 1L, url = "u", method = "GET")))
    assertEquals("websocket_frame", SdkEventSerializer.getEventType(SdkWebSocketFrameEvent(timestamp = 1L, connectionId = "c", url = "u", direction = WebSocketFrameDirection.SENT, frameType = WebSocketFrameType.TEXT)))
    assertEquals("log", SdkEventSerializer.getEventType(SdkLogEvent(timestamp = 1L, level = 3, tag = "T", message = "M", filterName = "F")))
    assertEquals("broadcast", SdkEventSerializer.getEventType(SdkBroadcastEvent(timestamp = 1L, action = "A")))
    assertEquals("lifecycle", SdkEventSerializer.getEventType(SdkLifecycleEvent(timestamp = 1L, kind = "foreground")))
    assertEquals("custom", SdkEventSerializer.getEventType(SdkCustomEvent(timestamp = 1L, name = "N")))
    assertEquals("event_batch", SdkEventSerializer.getEventType(SdkEventBatch(timestamp = 1L, events = emptyList())))
  }
}
