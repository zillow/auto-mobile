package dev.jasonpearson.automobile.accessibilityservice

import dev.jasonpearson.automobile.accessibilityservice.models.ElementBounds
import dev.jasonpearson.automobile.accessibilityservice.models.HighlightEntry
import dev.jasonpearson.automobile.accessibilityservice.models.HighlightShape
import dev.jasonpearson.automobile.accessibilityservice.models.UIElementInfo
import dev.jasonpearson.automobile.accessibilityservice.models.ViewHierarchy
import io.ktor.client.HttpClient
import io.ktor.client.engine.cio.CIO
import io.ktor.client.plugins.websocket.WebSockets
import io.ktor.client.plugins.websocket.webSocket
import io.ktor.client.request.get
import io.ktor.http.HttpMethod
import io.ktor.http.HttpStatusCode
import io.ktor.websocket.Frame
import io.ktor.websocket.readText
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeout
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/**
 * Integration tests for WebSocketServer with actual network I/O. These tests verify real WebSocket
 * connections and message broadcasting.
 *
 * Note: These tests use runBlocking instead of runTest to allow actual network operations. They may
 * be slower than pure unit tests but provide confidence that the WebSocket server works correctly.
 */
@RunWith(RobolectricTestRunner::class)
class WebSocketServerIntegrationTest {

  private lateinit var server: WebSocketServer
  private lateinit var testScope: CoroutineScope
  private val json = Json { ignoreUnknownKeys = true }
  private val highlightLock = Any()
  private val highlightStore = LinkedHashMap<String, HighlightShape>()

  @Before
  fun setUp() {
    testScope = CoroutineScope(Dispatchers.Default + SupervisorJob())
    // Use port 0 to let OS assign an available port, avoiding conflicts when tests run in parallel
    synchronized(highlightLock) { highlightStore.clear() }
    server =
        WebSocketServer(
            port = 0,
            scope = testScope,
            onAddHighlight = { requestId, highlightId, shape ->
              val error =
                  when {
                    highlightId.isNullOrBlank() -> "Missing highlight id"
                    shape == null -> "Missing highlight shape"
                    else -> null
                  }
              if (error == null) {
                synchronized(highlightLock) { highlightStore[highlightId!!] = shape!! }
              }
              enqueueHighlightResponse(requestId, error == null, error, null)
            },
            onRemoveHighlight = { requestId, highlightId ->
              val error = if (highlightId.isNullOrBlank()) "Missing highlight id" else null
              if (error == null) {
                synchronized(highlightLock) { highlightStore.remove(highlightId) }
              }
              enqueueHighlightResponse(requestId, error == null, error, null)
            },
            onClearHighlights = { requestId ->
              synchronized(highlightLock) { highlightStore.clear() }
              enqueueHighlightResponse(requestId, true, null, null)
            },
            onListHighlights = { requestId ->
              enqueueHighlightResponse(requestId, true, null, null)
            },
        )
  }

  /** Get the actual port the server is listening on. Must be called after server.start(). */
  private fun getServerPort(): Int {
    return server.getActualPort() ?: error("Server not running or port not available")
  }

  @After
  fun tearDown() {
    if (server.isRunning()) {
      server.stop()
    }
    testScope.cancel()
    // Minimal cleanup time
    Thread.sleep(50)
  }

  /**
   * Wait for a condition to be true with exponential backoff. Much faster than fixed delays when
   * condition becomes true quickly.
   */
  private suspend fun waitFor(
      timeoutMs: Long = 1000,
      checkIntervalMs: Long = 10,
      condition: () -> Boolean,
  ) {
    withTimeout(timeoutMs) {
      while (!condition()) {
        delay(checkIntervalMs)
      }
    }
  }

  private fun enqueueHighlightResponse(
      requestId: String?,
      success: Boolean,
      error: String?,
      highlights: List<HighlightEntry>?,
  ) {
    val highlightSnapshot =
        highlights
            ?: synchronized(highlightLock) {
              highlightStore.map { (id, shape) -> HighlightEntry(id = id, shape = shape) }
            }
    val highlightsJson =
        json.encodeToString(ListSerializer(HighlightEntry.serializer()), highlightSnapshot)
    val errorJson = json.encodeToString<String?>(error)
    val message =
        buildString {
          append("""{"type":"highlight_response","timestamp":${System.currentTimeMillis()}""")
          if (requestId != null) {
            append(""","requestId":"$requestId"""")
          }
          append(""","success":$success""")
          append(""","error":$errorJson""")
          append(""","highlights":$highlightsJson""")
          append("}")
        }

    testScope.launch { server.broadcast(message) }
  }

  @Test
  fun `server starts and stops successfully`() = runBlocking {
    // When
    server.start()

    // Then
    assertTrue("Server should be running", server.isRunning())

    // When - stop server
    server.stop()

    // Then
    assertFalse("Server should be stopped", server.isRunning())
  }

  @Test
  fun `server does not start twice`() = runBlocking {
    // Given
    server.start()

    // When - try to start again
    server.start()

    // Then - should still be running normally
    assertTrue("Server should still be running", server.isRunning())
  }

  @Test
  fun `client can connect to server`() = runBlocking {
    // Given
    server.start()

    // When
    val client = HttpClient(CIO) { install(WebSockets) }

    client.use { client ->
      client.webSocket(
          method = HttpMethod.Get,
          host = "localhost",
          port = getServerPort(),
          path = "/ws",
      ) {
        // Then - connection established
        waitFor { server.getConnectionCount() == 1 }
        assertEquals(1, server.getConnectionCount())

        // Receive connection message
        val frame = withTimeout(1000) { incoming.receive() }
        if (frame is Frame.Text) {
          val message = frame.readText()
          assertTrue("Should receive connection message", message.contains("connected"))
        }
      }
    }

    // Wait for cleanup using condition-based waiting
    waitFor { server.getConnectionCount() == 0 }
    assertEquals("Connection should be cleaned up", 0, server.getConnectionCount())
  }

  @Test
  fun `server broadcasts messages to connected client`() = runBlocking {
    // Given
    server.start()

    val receivedMessages = mutableListOf<String>()
    val client = HttpClient(CIO) { install(WebSockets) }

    client.use { client ->
      val job = launch {
        client.webSocket(
            method = HttpMethod.Get,
            host = "localhost",
            port = getServerPort(),
            path = "/ws",
        ) {
          // Receive and discard connection message
          incoming.receive()

          // Listen for broadcast messages with timeout
          var messageCount = 0
          for (frame in incoming) {
            if (frame is Frame.Text) {
              receivedMessages.add(frame.readText())
              messageCount++
              break
            }
          }
        }
      }

      // Wait for connection
      waitFor { server.getConnectionCount() == 1 }

      // When - broadcast a message
      val testMessage = """{"type":"test","data":"Hello WebSocket"}"""
      server.broadcast(testMessage)

      // Wait for message to be received
      waitFor { receivedMessages.size >= 1 }

      // Then
      assertEquals("Should receive 1 broadcast message", 1, receivedMessages.size)
      assertEquals(testMessage, receivedMessages[0])

      job.cancel()
    }
  }

  @Test
  fun `server broadcasts hierarchy updates with correct format`() = runBlocking {
    // Given
    server.start()

    val receivedMessages = mutableListOf<String>()
    val client = HttpClient(CIO) { install(WebSockets) }

    client.use { client ->
      val job = launch {
        client.webSocket(
            method = HttpMethod.Get,
            host = "localhost",
            port = getServerPort(),
            path = "/ws",
        ) {
          incoming.receive() // Discard connection message
          var messageCount = 0
          for (frame in incoming) {
            if (frame is Frame.Text) {
              receivedMessages.add(frame.readText())
              messageCount++
              break
            }
          }
        }
      }

      // Wait for connection
      waitFor { server.getConnectionCount() == 1 }

      // When - create and broadcast a hierarchy update
      val hierarchy =
          ViewHierarchy(
              packageName = "com.example.app",
              hierarchy =
                  UIElementInfo(
                      text = "Hello",
                      clickable = "true",
                      bounds = ElementBounds(0, 0, 100, 50),
                  ),
          )

      val hierarchyJson = json.encodeToString(ViewHierarchy.serializer(), hierarchy)
      val message =
          """{"type":"hierarchy_update","timestamp":${System.currentTimeMillis()},"data":$hierarchyJson}"""
      server.broadcast(message)

      // Wait for message to be received
      waitFor { receivedMessages.isNotEmpty() }

      // Then - verify message format
      assertEquals("Should receive 1 message", 1, receivedMessages.size)

      val receivedMessage = receivedMessages[0]
      val messageJson = json.parseToJsonElement(receivedMessage).jsonObject

      assertEquals("hierarchy_update", messageJson["type"]?.jsonPrimitive?.content)
      assertNotNull("Should have timestamp", messageJson["timestamp"])
      assertNotNull("Should have data", messageJson["data"])

      // Verify the data contains the hierarchy
      val dataJson = messageJson["data"]?.jsonObject
      assertEquals("com.example.app", dataJson?.get("packageName")?.jsonPrimitive?.content)

      job.cancel()
    }
  }

  @Test
  fun `health check endpoint responds correctly`() = runBlocking {
    // Given
    server.start()

    // When
    val client = HttpClient(CIO)
    client.use { client ->
      val response = client.get("http://localhost:${getServerPort()}/health")

      // Then
      assertEquals("Health check should return OK", HttpStatusCode.OK, response.status)
    }
  }

  @Test
  fun `server handles client disconnection gracefully`() = runBlocking {
    // Given
    server.start()

    val client = HttpClient(CIO) { install(WebSockets) }

    client.use { client ->
      val job = launch {
        client.webSocket(
            method = HttpMethod.Get,
            host = "localhost",
            port = getServerPort(),
            path = "/ws",
        ) {
          incoming.receive() // Connection message
          delay(10)
          // Connection will be closed when coroutine ends
        }
      }

      waitFor { server.getConnectionCount() == 1 }
      assertEquals("Should have 1 connection", 1, server.getConnectionCount())

      // When - client disconnects
      job.cancel()
      waitFor { server.getConnectionCount() == 0 }

      // Then - connection should be cleaned up
      assertEquals("Connection should be cleaned up", 0, server.getConnectionCount())
    }
  }

  @Test
  fun `add_highlight returns highlight response`() = runBlocking {
    server.start()

    val client = HttpClient(CIO) { install(WebSockets) }
    client.use { client ->
      client.webSocket(
          method = HttpMethod.Get,
          host = "localhost",
          port = getServerPort(),
          path = "/ws",
      ) {
        incoming.receive() // Connection message

        val requestId = "req-add"
        val message =
            """{"type":"add_highlight","requestId":"$requestId","id":"highlight-1","shape":{"type":"box","bounds":{"x":10,"y":20,"width":100,"height":80},"style":{"strokeColor":"#FF0000","strokeWidth":4,"dashPattern":null}}}"""
        send(Frame.Text(message))

        val responseFrame = withTimeout(1000) { incoming.receive() } as Frame.Text
        val responseJson = json.parseToJsonElement(responseFrame.readText()).jsonObject

        assertEquals("highlight_response", responseJson["type"]?.jsonPrimitive?.content)
        assertEquals(requestId, responseJson["requestId"]?.jsonPrimitive?.content)
        assertEquals("true", responseJson["success"]?.jsonPrimitive?.content)
        assertEquals("null", responseJson["error"]?.toString())
        val highlights = responseJson["highlights"]?.jsonArray
        assertNotNull("Should include highlights array", highlights)
        assertEquals(1, highlights?.size)
      }
    }
  }

  @Test
  fun `add_path_highlight returns highlight response`() = runBlocking {
    server.start()

    val client = HttpClient(CIO) { install(WebSockets) }
    client.use { client ->
      client.webSocket(
          method = HttpMethod.Get,
          host = "localhost",
          port = getServerPort(),
          path = "/ws",
      ) {
        incoming.receive() // Connection message

        val requestId = "req-add-path"
        val message =
            """{"type":"add_highlight","requestId":"$requestId","id":"path-1","shape":{"type":"path","points":[{"x":10,"y":20},{"x":40,"y":35},{"x":80,"y":25}],"style":{"strokeColor":"#FF8800","strokeWidth":5,"smoothing":"catmull-rom","tension":0.6}}}"""
        send(Frame.Text(message))

        val responseFrame = withTimeout(1000) { incoming.receive() } as Frame.Text
        val responseJson = json.parseToJsonElement(responseFrame.readText()).jsonObject

        assertEquals("highlight_response", responseJson["type"]?.jsonPrimitive?.content)
        assertEquals(requestId, responseJson["requestId"]?.jsonPrimitive?.content)
        assertEquals("true", responseJson["success"]?.jsonPrimitive?.content)
        val highlights = responseJson["highlights"]?.jsonArray
        assertNotNull("Should include highlights array", highlights)
        assertEquals(1, highlights?.size)
        val highlight = highlights?.firstOrNull()?.jsonObject
        assertEquals("path", highlight?.get("shape")?.jsonObject?.get("type")?.jsonPrimitive?.content)
      }
    }
  }

  @Test
  fun `list_highlights returns stored highlights`() = runBlocking {
    server.start()

    val client = HttpClient(CIO) { install(WebSockets) }
    client.use { client ->
      client.webSocket(
          method = HttpMethod.Get,
          host = "localhost",
          port = getServerPort(),
          path = "/ws",
      ) {
        incoming.receive() // Connection message

        val addRequestId = "req-add"
        val addMessage =
            """{"type":"add_highlight","requestId":"$addRequestId","id":"highlight-1","shape":{"type":"box","bounds":{"x":15,"y":25,"width":120,"height":90},"style":{"strokeColor":"#00FF00","strokeWidth":6,"dashPattern":null}}}"""
        send(Frame.Text(addMessage))
        withTimeout(1000) { incoming.receive() } // add response

        val listRequestId = "req-list"
        send(Frame.Text("""{"type":"list_highlights","requestId":"$listRequestId"}"""))

        val responseFrame = withTimeout(1000) { incoming.receive() } as Frame.Text
        val responseJson = json.parseToJsonElement(responseFrame.readText()).jsonObject

        assertEquals("highlight_response", responseJson["type"]?.jsonPrimitive?.content)
        assertEquals(listRequestId, responseJson["requestId"]?.jsonPrimitive?.content)
        assertEquals("true", responseJson["success"]?.jsonPrimitive?.content)

        val highlights = responseJson["highlights"]?.jsonArray
        assertNotNull("Should include highlights array", highlights)
        assertEquals(1, highlights?.size)
        val highlight = highlights?.firstOrNull()?.jsonObject
        assertEquals("highlight-1", highlight?.get("id")?.jsonPrimitive?.content)
      }
    }
  }

  @Test
  fun `remove_highlight removes stored highlight`() = runBlocking {
    server.start()

    val client = HttpClient(CIO) { install(WebSockets) }
    client.use { client ->
      client.webSocket(
          method = HttpMethod.Get,
          host = "localhost",
          port = getServerPort(),
          path = "/ws",
      ) {
        incoming.receive() // Connection message

        val addMessage =
            """{"type":"add_highlight","requestId":"req-add","id":"highlight-1","shape":{"type":"circle","bounds":{"x":40,"y":50,"width":60,"height":60},"style":{"strokeColor":"#0000FF","strokeWidth":5,"dashPattern":null}}}"""
        send(Frame.Text(addMessage))
        withTimeout(1000) { incoming.receive() } // add response

        val removeRequestId = "req-remove"
        send(Frame.Text("""{"type":"remove_highlight","requestId":"$removeRequestId","id":"highlight-1"}"""))
        val removeResponse = withTimeout(1000) { incoming.receive() } as Frame.Text
        val removeJson = json.parseToJsonElement(removeResponse.readText()).jsonObject
        assertEquals("true", removeJson["success"]?.jsonPrimitive?.content)
        val removeHighlights = removeJson["highlights"]?.jsonArray
        assertNotNull("Should include highlights array", removeHighlights)
        assertEquals(0, removeHighlights?.size)

        val listRequestId = "req-list"
        send(Frame.Text("""{"type":"list_highlights","requestId":"$listRequestId"}"""))
        val listResponse = withTimeout(1000) { incoming.receive() } as Frame.Text
        val listJson = json.parseToJsonElement(listResponse.readText()).jsonObject
        val highlights = listJson["highlights"]?.jsonArray
        assertEquals(0, highlights?.size)
      }
    }
  }

  @Test
  fun `remove_highlight is idempotent`() = runBlocking {
    server.start()

    val client = HttpClient(CIO) { install(WebSockets) }
    client.use { client ->
      client.webSocket(
          method = HttpMethod.Get,
          host = "localhost",
          port = getServerPort(),
          path = "/ws",
      ) {
        incoming.receive() // Connection message

        val removeRequestId = "req-remove-missing"
        send(
            Frame.Text(
                """{"type":"remove_highlight","requestId":"$removeRequestId","id":"missing-highlight"}"""
            )
        )
        val removeResponse = withTimeout(1000) { incoming.receive() } as Frame.Text
        val removeJson = json.parseToJsonElement(removeResponse.readText()).jsonObject

        assertEquals("highlight_response", removeJson["type"]?.jsonPrimitive?.content)
        assertEquals(removeRequestId, removeJson["requestId"]?.jsonPrimitive?.content)
        assertEquals("true", removeJson["success"]?.jsonPrimitive?.content)
        val highlights = removeJson["highlights"]?.jsonArray
        assertNotNull("Should include highlights array", highlights)
        assertEquals(0, highlights?.size)
      }
    }
  }

  @Test
  fun `clear_highlights removes all highlights`() = runBlocking {
    server.start()

    val client = HttpClient(CIO) { install(WebSockets) }
    client.use { client ->
      client.webSocket(
          method = HttpMethod.Get,
          host = "localhost",
          port = getServerPort(),
          path = "/ws",
      ) {
        incoming.receive() // Connection message

        val addMessageOne =
            """{"type":"add_highlight","requestId":"req-add-1","id":"highlight-1","shape":{"type":"box","bounds":{"x":5,"y":10,"width":50,"height":40},"style":{"strokeColor":"#FF00FF","strokeWidth":3,"dashPattern":null}}}"""
        val addMessageTwo =
            """{"type":"add_highlight","requestId":"req-add-2","id":"highlight-2","shape":{"type":"box","bounds":{"x":60,"y":70,"width":80,"height":90},"style":{"strokeColor":"#00FFFF","strokeWidth":3,"dashPattern":null}}}"""
        send(Frame.Text(addMessageOne))
        withTimeout(1000) { incoming.receive() } // add response
        send(Frame.Text(addMessageTwo))
        withTimeout(1000) { incoming.receive() } // add response

        val clearRequestId = "req-clear"
        send(Frame.Text("""{"type":"clear_highlights","requestId":"$clearRequestId"}"""))
        val clearResponse = withTimeout(1000) { incoming.receive() } as Frame.Text
        val clearJson = json.parseToJsonElement(clearResponse.readText()).jsonObject
        assertEquals("true", clearJson["success"]?.jsonPrimitive?.content)
        val clearHighlights = clearJson["highlights"]?.jsonArray
        assertNotNull("Should include highlights array", clearHighlights)
        assertEquals(0, clearHighlights?.size)

        val listRequestId = "req-list"
        send(Frame.Text("""{"type":"list_highlights","requestId":"$listRequestId"}"""))
        val listResponse = withTimeout(1000) { incoming.receive() } as Frame.Text
        val listJson = json.parseToJsonElement(listResponse.readText()).jsonObject
        val highlights = listJson["highlights"]?.jsonArray
        assertEquals(0, highlights?.size)
      }
    }
  }

  @Test
  fun `invalid add_highlight returns error response`() = runBlocking {
    server.start()

    val client = HttpClient(CIO) { install(WebSockets) }
    client.use { client ->
      client.webSocket(
          method = HttpMethod.Get,
          host = "localhost",
          port = getServerPort(),
          path = "/ws",
      ) {
        incoming.receive() // Connection message

        val requestId = "req-invalid"
        val message =
            """{"type":"add_highlight","requestId":"$requestId","shape":{"type":"box","bounds":{"x":10,"y":20,"width":100,"height":80},"style":{"strokeColor":"#FF0000","strokeWidth":4,"dashPattern":null}}}"""
        send(Frame.Text(message))

        val responseFrame = withTimeout(1000) { incoming.receive() } as Frame.Text
        val responseJson = json.parseToJsonElement(responseFrame.readText()).jsonObject

        assertEquals("highlight_response", responseJson["type"]?.jsonPrimitive?.content)
        assertEquals(requestId, responseJson["requestId"]?.jsonPrimitive?.content)
        assertEquals("false", responseJson["success"]?.jsonPrimitive?.content)
        assertEquals("Missing highlight id", responseJson["error"]?.jsonPrimitive?.content)
        val highlights = responseJson["highlights"]?.jsonArray
        assertNotNull("Should include highlights array", highlights)
        assertEquals(0, highlights?.size)
      }
    }
  }
}
