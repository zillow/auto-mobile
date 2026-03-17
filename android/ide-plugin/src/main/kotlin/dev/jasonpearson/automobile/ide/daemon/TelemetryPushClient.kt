package dev.jasonpearson.automobile.ide.daemon

import dev.jasonpearson.automobile.ide.telemetry.TelemetryDisplayEvent
import kotlinx.coroutines.flow.SharedFlow

/**
 * Client for receiving real-time telemetry events via Unix socket.
 */
interface TelemetryPushClient {
    /** Flow of parsed telemetry events. */
    val telemetryEvents: SharedFlow<TelemetryDisplayEvent>

    /** Flow of connection state changes. */
    val connectionState: SharedFlow<TelemetryConnectionState>

    /** Connect to the telemetry push socket and subscribe to events. */
    fun connect()

    /** Disconnect from the telemetry push socket. */
    fun disconnect()

    /** Whether the client is currently connected. */
    fun isConnected(): Boolean

    /** Disconnect and release all resources. Do not reuse after calling. */
    fun dispose()
}
