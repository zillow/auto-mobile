package dev.jasonpearson.automobile.ide.daemon

import dev.jasonpearson.automobile.ide.telemetry.TelemetryDisplayEvent
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.asSharedFlow

/**
 * Fake implementation of [TelemetryPushClient] for UI testing and Fake mode.
 * Allows emitting events and controlling connection state programmatically.
 */
class FakeTelemetryPushClient : TelemetryPushClient {

    private val _telemetryEvents = MutableSharedFlow<TelemetryDisplayEvent>(
        replay = 0,
        extraBufferCapacity = 200,
        onBufferOverflow = kotlinx.coroutines.channels.BufferOverflow.DROP_OLDEST,
    )
    override val telemetryEvents: SharedFlow<TelemetryDisplayEvent> = _telemetryEvents.asSharedFlow()

    private val _connectionState = MutableSharedFlow<TelemetryConnectionState>(replay = 1)
    override val connectionState: SharedFlow<TelemetryConnectionState> = _connectionState.asSharedFlow()

    private var connected = false
    private var connectCallCount = 0
    private var disconnectCallCount = 0
    private var lastDeviceId: String? = null

    override fun connect(deviceId: String?) {
        connectCallCount++
        lastDeviceId = deviceId
        connected = true
        _connectionState.tryEmit(TelemetryConnectionState.Connected)
    }

    override fun disconnect() {
        disconnectCallCount++
        connected = false
        _connectionState.tryEmit(TelemetryConnectionState.Disconnected(null))
    }

    override fun isConnected(): Boolean = connected

    override fun dispose() {
        disconnect()
    }

    // -- Test helpers --

    /** Emit a telemetry event to all collectors. */
    fun emitEvent(event: TelemetryDisplayEvent): Boolean = _telemetryEvents.tryEmit(event)

    /** Set the connection state for testing. */
    fun setConnectionState(state: TelemetryConnectionState) {
        connected = state is TelemetryConnectionState.Connected
        _connectionState.tryEmit(state)
    }

    /** Get the number of times [connect] was called. */
    fun getConnectCallCount(): Int = connectCallCount

    /** Get the number of times [disconnect] was called. */
    fun getDisconnectCallCount(): Int = disconnectCallCount

    /** Get the deviceId from the last [connect] call. */
    fun getLastDeviceId(): String? = lastDeviceId
}
