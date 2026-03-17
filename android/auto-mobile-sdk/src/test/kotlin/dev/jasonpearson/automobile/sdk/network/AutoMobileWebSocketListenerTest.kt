package dev.jasonpearson.automobile.sdk.network

import dev.jasonpearson.automobile.protocol.SdkEvent
import dev.jasonpearson.automobile.protocol.SdkWebSocketFrameEvent
import dev.jasonpearson.automobile.protocol.WebSocketFrameDirection
import dev.jasonpearson.automobile.protocol.WebSocketFrameType
import dev.jasonpearson.automobile.sdk.events.SdkEventBuffer
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import okio.ByteString.Companion.encodeUtf8
import org.junit.Test
import java.util.concurrent.Executors
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class AutoMobileWebSocketListenerTest {

    private fun collectingBuffer(): Pair<SdkEventBuffer, MutableList<SdkEvent>> {
        val events = mutableListOf<SdkEvent>()
        val buffer = SdkEventBuffer(
            maxBufferSize = 1,
            flushIntervalMs = 60_000,
            onFlush = { events.addAll(it) },
            executor = Executors.newSingleThreadScheduledExecutor(),
        )
        return buffer to events
    }

    /** Minimal no-op WebSocket for testing callbacks */
    private val fakeWebSocket = object : WebSocket {
        override fun cancel() {}
        override fun close(code: Int, reason: String?) = false
        override fun queueSize() = 0L
        override fun request() = okhttp3.Request.Builder().url("https://fake").build()
        override fun send(text: String) = false
        override fun send(bytes: okio.ByteString) = false
    }

    @Test
    fun `records text message as RECEIVED TEXT with correct size`() {
        val (buffer, events) = collectingBuffer()
        val delegate = RecordingDelegate()
        val listener = AutoMobileWebSocketListener(
            delegate = delegate,
            url = "wss://example.com/ws",
            buffer = buffer,
            connectionId = "abc12345",
        )

        listener.onMessage(fakeWebSocket, "hello world")

        assertEquals(1, events.size)
        val event = events[0] as SdkWebSocketFrameEvent
        assertEquals(WebSocketFrameDirection.RECEIVED, event.direction)
        assertEquals(WebSocketFrameType.TEXT, event.frameType)
        assertEquals(11L, event.payloadSize) // "hello world".length
        assertEquals("wss://example.com/ws", event.url)
        assertEquals("abc12345", event.connectionId)
    }

    @Test
    fun `records binary message as RECEIVED BINARY`() {
        val (buffer, events) = collectingBuffer()
        val delegate = RecordingDelegate()
        val listener = AutoMobileWebSocketListener(delegate, "wss://x", buffer, connectionId = "c1")

        val bytes = "binary data".encodeUtf8()
        listener.onMessage(fakeWebSocket, bytes)

        val event = events[0] as SdkWebSocketFrameEvent
        assertEquals(WebSocketFrameDirection.RECEIVED, event.direction)
        assertEquals(WebSocketFrameType.BINARY, event.frameType)
        assertEquals(bytes.size.toLong(), event.payloadSize)
    }

    @Test
    fun `records closing as RECEIVED CLOSE`() {
        val (buffer, events) = collectingBuffer()
        val delegate = RecordingDelegate()
        val listener = AutoMobileWebSocketListener(delegate, "wss://x", buffer, connectionId = "c1")

        listener.onClosing(fakeWebSocket, 1000, "goodbye")

        val event = events[0] as SdkWebSocketFrameEvent
        assertEquals(WebSocketFrameDirection.RECEIVED, event.direction)
        assertEquals(WebSocketFrameType.CLOSE, event.frameType)
        assertEquals(7L, event.payloadSize) // "goodbye".length
    }

    @Test
    fun `delegates text message to original listener`() {
        val (buffer, _) = collectingBuffer()
        val delegate = RecordingDelegate()
        val listener = AutoMobileWebSocketListener(delegate, "wss://x", buffer)

        listener.onMessage(fakeWebSocket, "test")

        assertEquals(1, delegate.textMessages.size)
        assertEquals("test", delegate.textMessages[0])
    }

    @Test
    fun `delegates binary message to original listener`() {
        val (buffer, _) = collectingBuffer()
        val delegate = RecordingDelegate()
        val listener = AutoMobileWebSocketListener(delegate, "wss://x", buffer)

        val bytes = "bin".encodeUtf8()
        listener.onMessage(fakeWebSocket, bytes)

        assertEquals(1, delegate.binaryMessages.size)
        assertEquals(bytes, delegate.binaryMessages[0])
    }

    @Test
    fun `delegates onClosing to original listener`() {
        val (buffer, _) = collectingBuffer()
        val delegate = RecordingDelegate()
        val listener = AutoMobileWebSocketListener(delegate, "wss://x", buffer)

        listener.onClosing(fakeWebSocket, 1001, "going away")

        assertEquals(1, delegate.closingCalls.size)
        assertEquals(1001, delegate.closingCalls[0].first)
        assertEquals("going away", delegate.closingCalls[0].second)
    }

    @Test
    fun `delegates onFailure to original listener`() {
        val (buffer, _) = collectingBuffer()
        val delegate = RecordingDelegate()
        val listener = AutoMobileWebSocketListener(delegate, "wss://x", buffer)

        val error = RuntimeException("broken")
        listener.onFailure(fakeWebSocket, error, null)

        assertEquals(1, delegate.failures.size)
        assertEquals("broken", delegate.failures[0].message)
    }

    @Test
    fun `sets applicationId on recorded events`() {
        val (buffer, events) = collectingBuffer()
        val delegate = RecordingDelegate()
        val listener = AutoMobileWebSocketListener(
            delegate, "wss://x", buffer,
            applicationId = "com.example.app",
            connectionId = "c1",
        )

        listener.onMessage(fakeWebSocket, "msg")

        val event = events[0] as SdkWebSocketFrameEvent
        assertEquals("com.example.app", event.applicationId)
    }

    /** Recording delegate that tracks all callback invocations */
    private class RecordingDelegate : WebSocketListener() {
        val textMessages = mutableListOf<String>()
        val binaryMessages = mutableListOf<okio.ByteString>()
        val closingCalls = mutableListOf<Pair<Int, String>>()
        val closedCalls = mutableListOf<Pair<Int, String>>()
        val failures = mutableListOf<Throwable>()

        override fun onMessage(webSocket: WebSocket, text: String) {
            textMessages.add(text)
        }
        override fun onMessage(webSocket: WebSocket, bytes: okio.ByteString) {
            binaryMessages.add(bytes)
        }
        override fun onClosing(webSocket: WebSocket, code: Int, reason: String) {
            closingCalls.add(code to reason)
        }
        override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
            closedCalls.add(code to reason)
        }
        override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
            failures.add(t)
        }
    }
}
