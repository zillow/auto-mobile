package dev.jasonpearson.automobile.desktop.core.socket

import java.util.concurrent.CopyOnWriteArrayList
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * Fake implementation of StorageSocketClient for UI testing.
 * Allows simulating connection state and emitting fake change events.
 */
class FakeStorageSocketClient : StorageSocketClient {

    private val listeners = CopyOnWriteArrayList<StorageChangeListener>()
    private val _isConnected = MutableStateFlow(false)
    override val isConnected: StateFlow<Boolean> = _isConnected.asStateFlow()

    override fun subscribe(listener: StorageChangeListener) {
        listeners.add(listener)
    }

    override fun unsubscribe(listener: StorageChangeListener) {
        listeners.remove(listener)
    }

    override fun connect() {
        _isConnected.value = true
    }

    override fun disconnect() {
        _isConnected.value = false
    }

    /**
     * Simulate a storage change event for testing.
     * @param event The change event to emit to listeners
     */
    fun emitChangeEvent(event: StorageChangedEvent) {
        listeners.forEach { listener ->
            try {
                listener.onStorageChanged(event)
            } catch (e: Exception) {
                // Ignore listener errors in test
            }
        }
    }

    /**
     * Set the connection state for testing.
     * @param connected Whether the socket should appear connected
     */
    fun setConnected(connected: Boolean) {
        _isConnected.value = connected
    }

    /**
     * Get the current number of subscribed listeners for testing.
     */
    fun getListenerCount(): Int = listeners.size
}
