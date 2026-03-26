package dev.jasonpearson.automobile.desktop.core.layout

import dev.jasonpearson.automobile.desktop.core.daemon.StreamConnectionState
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.runTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class StreamConnectionGracePeriodTest {

    @Test
    fun `connected state propagates immediately`() = runTest {
        val statuses = mutableListOf<ConnectionStatus>()
        var disconnected = false
        val gp = StreamConnectionGracePeriod(
            scope = backgroundScope,
            onStatusChange = { statuses.add(it) },
            onDisconnectConfirmed = { disconnected = true },
        )

        gp.onStreamStateChange(StreamConnectionState.Connected)

        assertEquals(listOf(ConnectionStatus.Connected), statuses)
        assertFalse(disconnected)
    }

    @Test
    fun `connecting shown during initial connection`() = runTest {
        val statuses = mutableListOf<ConnectionStatus>()
        val gp = StreamConnectionGracePeriod(
            scope = backgroundScope,
            onStatusChange = { statuses.add(it) },
            onDisconnectConfirmed = {},
        )

        gp.onStreamStateChange(StreamConnectionState.Connecting)

        assertEquals(listOf(ConnectionStatus.Connecting), statuses)
    }

    @Test
    fun `connecting suppressed during reconnection after having been connected`() = runTest {
        val statuses = mutableListOf<ConnectionStatus>()
        val gp = StreamConnectionGracePeriod(
            scope = backgroundScope,
            onStatusChange = { statuses.add(it) },
            onDisconnectConfirmed = {},
        )

        // First connect, then reconnect
        gp.onStreamStateChange(StreamConnectionState.Connected)
        statuses.clear()

        gp.onStreamStateChange(StreamConnectionState.Connecting)

        assertTrue(statuses.isEmpty(), "Connecting should be suppressed after having been connected")
    }

    @Test
    fun `disconnect deferred by grace period`() = runTest {
        var disconnected = false
        val gp = StreamConnectionGracePeriod(
            scope = backgroundScope,
            gracePeriodMs = 30_000L,
            onStatusChange = {},
            onDisconnectConfirmed = { disconnected = true },
        )

        // Connect first, then disconnect
        gp.onStreamStateChange(StreamConnectionState.Connected)
        gp.onStreamStateChange(StreamConnectionState.Disconnected(reason = "test"))

        // Not yet disconnected
        assertFalse(disconnected)

        // Advance past grace period
        advanceTimeBy(30_001)

        assertTrue(disconnected)
    }

    @Test
    fun `reconnection within grace period cancels pending disconnect`() = runTest {
        var disconnected = false
        val statuses = mutableListOf<ConnectionStatus>()
        val gp = StreamConnectionGracePeriod(
            scope = backgroundScope,
            gracePeriodMs = 30_000L,
            onStatusChange = { statuses.add(it) },
            onDisconnectConfirmed = { disconnected = true },
        )

        gp.onStreamStateChange(StreamConnectionState.Connected)
        statuses.clear()

        // Disconnect starts grace period
        gp.onStreamStateChange(StreamConnectionState.Disconnected(reason = "test"))

        // Reconnect within grace period
        advanceTimeBy(5_000)
        gp.onStreamStateChange(StreamConnectionState.Connected)

        // Grace period should be cancelled
        advanceTimeBy(30_000)

        assertFalse(disconnected, "Disconnect should have been cancelled by reconnection")
        assertEquals(listOf(ConnectionStatus.Connected), statuses)
    }

    @Test
    fun `disconnect confirmed after grace period expires`() = runTest {
        var disconnected = false
        val gp = StreamConnectionGracePeriod(
            scope = backgroundScope,
            gracePeriodMs = 30_000L,
            onStatusChange = {},
            onDisconnectConfirmed = { disconnected = true },
        )

        gp.onStreamStateChange(StreamConnectionState.Connected)
        gp.onStreamStateChange(StreamConnectionState.Disconnected(reason = "gone"))

        advanceTimeBy(30_001)

        assertTrue(disconnected, "Disconnect should be confirmed after grace period")
    }

    @Test
    fun `never-connected disconnect propagates immediately`() = runTest {
        var disconnected = false
        val gp = StreamConnectionGracePeriod(
            scope = backgroundScope,
            onStatusChange = {},
            onDisconnectConfirmed = { disconnected = true },
        )

        gp.onStreamStateChange(StreamConnectionState.Disconnected(reason = "never connected"))

        assertTrue(disconnected, "Disconnect should propagate immediately when never connected")
    }

    @Test
    fun `multiple disconnect reconnect cycles work correctly`() = runTest {
        var disconnectCount = 0
        val statuses = mutableListOf<ConnectionStatus>()
        val gp = StreamConnectionGracePeriod(
            scope = backgroundScope,
            gracePeriodMs = 30_000L,
            onStatusChange = { statuses.add(it) },
            onDisconnectConfirmed = { disconnectCount++ },
        )

        // Cycle 1: connect -> disconnect -> reconnect (within grace)
        gp.onStreamStateChange(StreamConnectionState.Connected)
        gp.onStreamStateChange(StreamConnectionState.Disconnected(reason = "blip 1"))
        advanceTimeBy(5_000)
        gp.onStreamStateChange(StreamConnectionState.Connected)

        // Cycle 2: disconnect -> reconnect (within grace)
        gp.onStreamStateChange(StreamConnectionState.Disconnected(reason = "blip 2"))
        advanceTimeBy(10_000)
        gp.onStreamStateChange(StreamConnectionState.Connected)

        // Let all timers expire
        advanceTimeBy(60_000)

        assertEquals(0, disconnectCount, "No disconnects should have been confirmed")
        assertEquals(
            listOf(
                ConnectionStatus.Connected,
                ConnectionStatus.Connected,
                ConnectionStatus.Connected,
            ),
            statuses,
        )
    }

    @Test
    fun `cancel stops pending grace period`() = runTest {
        var disconnected = false
        val gp = StreamConnectionGracePeriod(
            scope = backgroundScope,
            gracePeriodMs = 30_000L,
            onStatusChange = {},
            onDisconnectConfirmed = { disconnected = true },
        )

        gp.onStreamStateChange(StreamConnectionState.Connected)
        gp.onStreamStateChange(StreamConnectionState.Disconnected(reason = "test"))

        gp.cancel()

        advanceTimeBy(60_000)

        assertFalse(disconnected, "Disconnect should not fire after cancel")
    }

    @Test
    fun `duplicate disconnect events do not start multiple grace periods`() = runTest {
        var disconnectCount = 0
        val gp = StreamConnectionGracePeriod(
            scope = backgroundScope,
            gracePeriodMs = 30_000L,
            onStatusChange = {},
            onDisconnectConfirmed = { disconnectCount++ },
        )

        gp.onStreamStateChange(StreamConnectionState.Connected)
        gp.onStreamStateChange(StreamConnectionState.Disconnected(reason = "first"))
        gp.onStreamStateChange(StreamConnectionState.Disconnected(reason = "second"))
        gp.onStreamStateChange(StreamConnectionState.Disconnected(reason = "third"))

        advanceTimeBy(30_001)

        assertEquals(1, disconnectCount, "Only one disconnect should fire despite multiple events")
    }
}
