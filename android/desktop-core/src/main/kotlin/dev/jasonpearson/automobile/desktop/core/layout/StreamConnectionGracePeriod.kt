package dev.jasonpearson.automobile.desktop.core.layout

import dev.jasonpearson.automobile.desktop.core.daemon.StreamConnectionState
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/**
 * Mediates between raw [StreamConnectionState] events and UI status updates,
 * absorbing brief disconnections during reconnection to prevent the UI from
 * flashing "Device Disconnected" on transient interruptions.
 *
 * Key behaviors:
 * - **Connected**: propagated immediately; cancels any pending grace period.
 * - **Connecting (after having been connected)**: suppressed — UI keeps showing Connected.
 * - **Connecting (initial, never connected)**: propagated normally.
 * - **Disconnected (after having been connected)**: starts a grace period; only confirms
 *   disconnect if the period expires without reconnection.
 * - **Disconnected (never connected)**: propagated immediately.
 */
class StreamConnectionGracePeriod(
    private val scope: CoroutineScope,
    private val gracePeriodMs: Long = 30_000L,
    private val onStatusChange: (ConnectionStatus) -> Unit,
    private val onDisconnectConfirmed: () -> Unit,
) {
    private var hasBeenConnected = false
    private var gracePeriodJob: Job? = null

    fun onStreamStateChange(state: StreamConnectionState) {
        when (state) {
            is StreamConnectionState.Connected -> {
                gracePeriodJob?.cancel()
                gracePeriodJob = null
                hasBeenConnected = true
                onStatusChange(ConnectionStatus.Connected)
            }
            is StreamConnectionState.Connecting -> {
                if (!hasBeenConnected) {
                    onStatusChange(ConnectionStatus.Connecting)
                }
                // If previously connected, suppress — keep showing Connected
            }
            is StreamConnectionState.Disconnected -> {
                if (!hasBeenConnected) {
                    onDisconnectConfirmed()
                    return
                }
                // Already have a grace period running — don't start another
                if (gracePeriodJob?.isActive == true) return
                gracePeriodJob = scope.launch {
                    delay(gracePeriodMs)
                    onDisconnectConfirmed()
                }
            }
        }
    }

    fun cancel() {
        gracePeriodJob?.cancel()
        gracePeriodJob = null
    }
}
