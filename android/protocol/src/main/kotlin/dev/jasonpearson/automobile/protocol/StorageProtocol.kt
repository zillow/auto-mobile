package dev.jasonpearson.automobile.protocol

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json

/**
 * Protocol types for SharedPreferences inspection via ContentProvider.
 *
 * These types provide type-safe communication between the AccessibilityService
 * and the SDK's SharedPreferencesInspectorProvider.
 *
 * The protocol uses JSON serialization for Bundle transport, with these key conventions:
 * - Bundle key "success" (Boolean): Whether the operation succeeded
 * - Bundle key "result" (String): JSON-encoded StorageResponse on success
 * - Bundle key "errorType" (String): Error type name on failure
 * - Bundle key "error" (String): Error message on failure
 */

// =============================================================================
// Requests (Service → SDK ContentProvider)
// =============================================================================

/**
 * Sealed class hierarchy for storage inspection requests.
 *
 * Each request type maps to a ContentProvider `call()` method.
 */
@Serializable
sealed class StorageRequest {
  /**
   * Check if SDK storage inspection is available and enabled.
   * Method: "checkAvailability"
   */
  @Serializable
  @SerialName("check_availability")
  data object CheckAvailability : StorageRequest()

  /**
   * List all SharedPreferences files in the app.
   * Method: "listFiles"
   */
  @Serializable
  @SerialName("list_files")
  data object ListFiles : StorageRequest()

  /**
   * Get all key-value entries from a SharedPreferences file.
   * Method: "getPreferences"
   * Extras: fileName (String)
   */
  @Serializable
  @SerialName("get_preferences")
  data class GetPreferences(
    val fileName: String,
  ) : StorageRequest()

  /**
   * Subscribe to changes on a SharedPreferences file.
   * Method: "subscribeToFile"
   * Extras: fileName (String)
   */
  @Serializable
  @SerialName("subscribe")
  data class Subscribe(
    val fileName: String,
  ) : StorageRequest()

  /**
   * Unsubscribe from changes on a SharedPreferences file.
   * Method: "unsubscribeFromFile"
   * Extras: fileName (String)
   */
  @Serializable
  @SerialName("unsubscribe")
  data class Unsubscribe(
    val fileName: String,
  ) : StorageRequest()

  /**
   * Get queued changes for a file since a sequence number.
   * Method: "getChanges"
   * Extras: fileName (String), sinceSequence (Long, optional)
   */
  @Serializable
  @SerialName("get_changes")
  data class GetChanges(
    val fileName: String,
    val sinceSequence: Long = 0,
  ) : StorageRequest()

  /**
   * Get list of files currently being monitored.
   * Method: "getListenedFiles"
   */
  @Serializable
  @SerialName("get_listened_files")
  data object GetListenedFiles : StorageRequest()
}

// =============================================================================
// Responses (SDK ContentProvider → Service)
// =============================================================================

/**
 * Sealed class hierarchy for storage inspection responses.
 */
@Serializable
sealed class StorageResponse {
  /**
   * Response for checkAvailability request.
   */
  @Serializable
  @SerialName("availability")
  data class Availability(
    val available: Boolean,
    val version: Int,
  ) : StorageResponse()

  /**
   * Response for listFiles request.
   */
  @Serializable
  @SerialName("files")
  data class FileList(
    val files: List<StorageFileInfo>,
  ) : StorageResponse()

  /**
   * Response for getPreferences request.
   */
  @Serializable
  @SerialName("preferences")
  data class Preferences(
    val file: StorageFileInfo? = null,
    val entries: List<StorageEntry>,
  ) : StorageResponse()

  /**
   * Response for subscribe/unsubscribe requests.
   */
  @Serializable
  @SerialName("subscription")
  data class SubscriptionResult(
    val fileName: String,
    val subscribed: Boolean,
  ) : StorageResponse()

  /**
   * Response for getChanges request.
   */
  @Serializable
  @SerialName("changes")
  data class Changes(
    val fileName: String,
    val changes: List<StorageChangeEvent>,
  ) : StorageResponse()

  /**
   * Response for getListenedFiles request.
   */
  @Serializable
  @SerialName("listened_files")
  data class ListenedFiles(
    val files: List<String>,
  ) : StorageResponse()

  /**
   * Error response.
   */
  @Serializable
  @SerialName("error")
  data class Error(
    val errorType: String,
    val message: String,
  ) : StorageResponse()
}

// =============================================================================
// Data Types
// =============================================================================

/**
 * Information about a SharedPreferences file.
 */
@Serializable
data class StorageFileInfo(
  val name: String,
  val path: String,
  val entryCount: Int,
)

/**
 * A key-value entry from SharedPreferences.
 */
@Serializable
data class StorageEntry(
  val key: String,
  /** JSON-encoded value (null if the value itself is null). */
  val value: String?,
  /** Type name: STRING, INT, LONG, FLOAT, BOOLEAN, STRING_SET */
  val type: String,
)

/**
 * A change event for a preference value.
 */
@Serializable
data class StorageChangeEvent(
  val fileName: String,
  /** The key that changed, or null if the file was cleared. */
  val key: String?,
  /** JSON-encoded new value (null if key was removed). */
  val value: String?,
  /** Type name: STRING, INT, LONG, FLOAT, BOOLEAN, STRING_SET */
  val type: String,
  /** Timestamp when the change occurred (milliseconds since epoch). */
  val timestamp: Long,
  /** Monotonically increasing sequence number for ordering changes. */
  val sequenceNumber: Long,
)

// =============================================================================
// Serializer
// =============================================================================

/**
 * Serializer for StorageProtocol types.
 */
object StorageProtocolSerializer {
  private val json = Json {
    ignoreUnknownKeys = true
    isLenient = true
    encodeDefaults = true
  }

  /**
   * Serialize a StorageRequest to JSON string.
   */
  fun requestToJson(request: StorageRequest): String {
    return json.encodeToString(StorageRequest.serializer(), request)
  }

  /**
   * Deserialize a StorageRequest from JSON string.
   */
  fun requestFromJson(jsonString: String): StorageRequest? {
    return try {
      json.decodeFromString(StorageRequest.serializer(), jsonString)
    } catch (e: Exception) {
      null
    }
  }

  /**
   * Serialize a StorageResponse to JSON string.
   */
  fun responseToJson(response: StorageResponse): String {
    return json.encodeToString(StorageResponse.serializer(), response)
  }

  /**
   * Deserialize a StorageResponse from JSON string.
   */
  fun responseFromJson(jsonString: String): StorageResponse? {
    return try {
      json.decodeFromString(StorageResponse.serializer(), jsonString)
    } catch (e: Exception) {
      null
    }
  }

  /**
   * Get the ContentProvider method name for a request.
   */
  fun getMethodName(request: StorageRequest): String {
    return when (request) {
      is StorageRequest.CheckAvailability -> "checkAvailability"
      is StorageRequest.ListFiles -> "listFiles"
      is StorageRequest.GetPreferences -> "getPreferences"
      is StorageRequest.Subscribe -> "subscribeToFile"
      is StorageRequest.Unsubscribe -> "unsubscribeFromFile"
      is StorageRequest.GetChanges -> "getChanges"
      is StorageRequest.GetListenedFiles -> "getListenedFiles"
    }
  }
}
