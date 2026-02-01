package dev.jasonpearson.automobile.ide.socket

import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.StateFlow

/**
 * Client for receiving real-time storage change events via Unix socket.
 */
interface StorageSocketClient {
    /**
     * Subscribe to storage change events.
     * @param listener Callback invoked when storage changes occur
     */
    fun subscribe(listener: StorageChangeListener)

    /**
     * Unsubscribe from storage change events.
     * @param listener The listener to remove
     */
    fun unsubscribe(listener: StorageChangeListener)

    /**
     * Connect to the storage socket.
     */
    fun connect()

    /**
     * Disconnect from the storage socket.
     */
    fun disconnect()

    /**
     * Flow indicating whether the socket is currently connected.
     */
    val isConnected: StateFlow<Boolean>
}

/**
 * Listener for storage change events.
 */
fun interface StorageChangeListener {
    /**
     * Called when a storage value changes.
     * @param event The change event details
     */
    fun onStorageChanged(event: StorageChangedEvent)
}

/**
 * Event emitted when a storage value changes.
 */
data class StorageChangedEvent(
    /** Package name of the app where the change occurred */
    val packageName: String,
    /** Name of the preference file that changed */
    val fileName: String,
    /** Key that changed (null if the entire file was cleared) */
    val key: String?,
    /** Previous value (null if new key or file cleared) */
    val oldValue: Any?,
    /** New value (null if key was deleted or file cleared) */
    val newValue: Any?,
    /** Type of the value */
    val valueType: String,
    /** Timestamp when the change occurred (milliseconds since epoch) */
    val timestamp: Long,
    /** Sequence number for ordering events */
    val sequenceNumber: Long = 0,
)
