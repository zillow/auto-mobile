package dev.jasonpearson.automobile.accessibilityservice.storage

import kotlinx.serialization.Serializable

/** Represents an active subscription to SharedPreferences file changes. */
@Serializable
data class StorageSubscription(
    val packageName: String,
    val fileName: String,
    val subscriptionId: String = "$packageName:$fileName",
)

/** Information about a SharedPreferences file. */
@Serializable
data class PreferenceFileInfo(
    val name: String,
    val path: String,
    val entryCount: Int,
)

/** A key-value entry from SharedPreferences. */
@Serializable
data class PreferenceEntry(
    val key: String,
    /** JSON-encoded value (null if the value itself is null). */
    val value: String?,
    /** Type name matching SDK KeyValueType enum. */
    val type: String,
)

/** A change event for a preference value. */
@Serializable
data class PreferenceChangeEvent(
    val packageName: String,
    val fileName: String,
    /** The key that changed, or null if the file was cleared. */
    val key: String?,
    /** JSON-encoded new value (null if key was removed). */
    val value: String?,
    /** Type name matching SDK KeyValueType enum. */
    val type: String,
    /** Timestamp when the change occurred (milliseconds since epoch). */
    val timestamp: Long,
    /** Monotonically increasing sequence number for ordering changes. */
    val sequenceNumber: Long,
)
