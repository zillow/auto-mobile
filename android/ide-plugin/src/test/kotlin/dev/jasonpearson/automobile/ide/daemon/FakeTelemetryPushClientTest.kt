package dev.jasonpearson.automobile.ide.daemon

import dev.jasonpearson.automobile.ide.telemetry.TelemetryDisplayEvent
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class FakeTelemetryPushClientTest {

    @Test
    fun `connect sets connected state and emits Connected`() = runBlocking {
        val client = FakeTelemetryPushClient()
        assertFalse(client.isConnected())

        client.connect()
        assertTrue(client.isConnected())
        assertEquals(TelemetryConnectionState.Connected, client.connectionState.first())
    }

    @Test
    fun `disconnect sets disconnected state`() = runBlocking {
        val client = FakeTelemetryPushClient()
        client.connect()
        assertTrue(client.isConnected())

        client.disconnect()
        assertFalse(client.isConnected())
        assertEquals(
            TelemetryConnectionState.Disconnected(null),
            client.connectionState.first(),
        )
    }

    @Test
    fun `dispose disconnects`() {
        val client = FakeTelemetryPushClient()
        client.connect()
        client.dispose()
        assertFalse(client.isConnected())
    }

    @Test
    fun `tracks connect and disconnect call counts`() {
        val client = FakeTelemetryPushClient()
        assertEquals(0, client.getConnectCallCount())
        assertEquals(0, client.getDisconnectCallCount())

        client.connect()
        client.connect()
        assertEquals(2, client.getConnectCallCount())

        client.disconnect()
        assertEquals(1, client.getDisconnectCallCount())
    }

    @Test
    fun `emitEvent delivers to flow`() = runBlocking {
        val client = FakeTelemetryPushClient()
        val event = TelemetryDisplayEvent.Log(
            timestamp = 1000L,
            level = 4,
            tag = "TestTag",
            message = "test message",
        )

        val collected = mutableListOf<TelemetryDisplayEvent>()
        val scope = CoroutineScope(Dispatchers.Unconfined)
        val job = scope.launch {
            client.telemetryEvents.collect {
                collected.add(it)
            }
        }

        client.emitEvent(event)

        assertEquals(1, collected.size)
        val received = collected[0] as TelemetryDisplayEvent.Log
        assertEquals("TestTag", received.tag)
        assertEquals("test message", received.message)

        job.cancel()
        scope.cancel()
    }

    @Test
    fun `emitEvent delivers multiple events`() = runBlocking {
        val client = FakeTelemetryPushClient()
        val collected = mutableListOf<TelemetryDisplayEvent>()
        val scope = CoroutineScope(Dispatchers.Unconfined)
        val job = scope.launch {
            client.telemetryEvents.collect {
                collected.add(it)
            }
        }

        client.emitEvent(TelemetryDisplayEvent.Network(
            timestamp = 1000L, method = "GET", statusCode = 200,
            url = "/users", durationMs = 42, host = null, path = "/users", error = null,
        ))
        client.emitEvent(TelemetryDisplayEvent.Os(
            timestamp = 2000L, category = "lifecycle", kind = "foreground", details = null,
        ))

        assertEquals(2, collected.size)
        assertTrue(collected[0] is TelemetryDisplayEvent.Network)
        assertTrue(collected[1] is TelemetryDisplayEvent.Os)

        job.cancel()
        scope.cancel()
    }

    @Test
    fun `setConnectionState updates connection state flow`() = runBlocking {
        val client = FakeTelemetryPushClient()
        val reconnecting = TelemetryConnectionState.Reconnecting(attempt = 3, nextRetryMs = 5000)

        client.setConnectionState(reconnecting)
        assertFalse(client.isConnected())
        assertEquals(reconnecting, client.connectionState.first())

        client.setConnectionState(TelemetryConnectionState.Connected)
        assertTrue(client.isConnected())
    }
}
