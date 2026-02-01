package dev.jasonpearson.automobile.protocol

import kotlinx.serialization.json.Json

/**
 * Serializer for converting SdkEvent sealed classes to/from JSON strings.
 *
 * This provides type-safe serialization for SDK events that can be used for
 * Intent extras, Bundle values, or any other string-based transport.
 *
 * The protocol module is pure Kotlin/JVM without Android dependencies, so Intent/Bundle
 * wrapping must be done by the consumer (SDK or AccessibilityService).
 *
 * Usage:
 * ```kotlin
 * // Serialization
 * val event = SdkNavigationEvent(
 *   timestamp = System.currentTimeMillis(),
 *   applicationId = packageName,
 *   destination = "home",
 *   source = NavigationSourceType.COMPOSE_NAVIGATION
 * )
 * val json = SdkEventSerializer.toJson(event)
 *
 * // Deserialization
 * val event = SdkEventSerializer.fromJson(json)
 * when (event) {
 *   is SdkNavigationEvent -> handleNavigation(event)
 *   is SdkHandledExceptionEvent -> handleException(event)
 *   // ...
 * }
 * ```
 */
object SdkEventSerializer {
  /**
   * Intent extra key for the serialized event JSON.
   * Uses a namespaced key to avoid collisions with other Intent extras.
   */
  const val EXTRA_SDK_EVENT_JSON = "dev.jasonpearson.automobile.sdk.EVENT_JSON"

  /**
   * Intent extra key for the event type discriminator.
   * This allows receivers to quickly determine the event type without parsing JSON.
   */
  const val EXTRA_SDK_EVENT_TYPE = "dev.jasonpearson.automobile.sdk.EVENT_TYPE"

  /**
   * Event type discriminator values.
   */
  object EventTypes {
    const val NAVIGATION = "navigation"
    const val HANDLED_EXCEPTION = "handled_exception"
    const val NOTIFICATION_ACTION = "notification_action"
    const val RECOMPOSITION_SNAPSHOT = "recomposition_snapshot"
    const val CRASH = "crash"
  }

  /**
   * JSON instance configured for lenient parsing.
   */
  private val json = Json {
    ignoreUnknownKeys = true
    isLenient = true
    encodeDefaults = true
  }

  /**
   * Serialize an SdkEvent to JSON string.
   *
   * @param event The SdkEvent to serialize
   * @return JSON string representation
   */
  fun toJson(event: SdkEvent): String {
    return json.encodeToString(SdkEvent.serializer(), event)
  }

  /**
   * Deserialize an SdkEvent from JSON string.
   *
   * @param jsonString The JSON string to deserialize
   * @return The deserialized SdkEvent, or null if parsing fails
   */
  fun fromJson(jsonString: String): SdkEvent? {
    return try {
      json.decodeFromString(SdkEvent.serializer(), jsonString)
    } catch (e: Exception) {
      null
    }
  }

  /**
   * Deserialize an SdkEvent from JSON string, throwing on failure.
   *
   * @param jsonString The JSON string to deserialize
   * @return The deserialized SdkEvent
   * @throws kotlinx.serialization.SerializationException if parsing fails
   */
  fun fromJsonOrThrow(jsonString: String): SdkEvent {
    return json.decodeFromString(SdkEvent.serializer(), jsonString)
  }

  /**
   * Get the event type discriminator for an event.
   *
   * @param event The SdkEvent to get the type for
   * @return The event type string
   */
  fun getEventType(event: SdkEvent): String {
    return when (event) {
      is SdkNavigationEvent -> EventTypes.NAVIGATION
      is SdkHandledExceptionEvent -> EventTypes.HANDLED_EXCEPTION
      is SdkNotificationActionEvent -> EventTypes.NOTIFICATION_ACTION
      is SdkRecompositionSnapshotEvent -> EventTypes.RECOMPOSITION_SNAPSHOT
      is SdkCrashEvent -> EventTypes.CRASH
    }
  }

  // =========================================================================
  // Type-safe deserialization helpers
  // =========================================================================

  /**
   * Deserialize a SdkNavigationEvent from JSON string.
   *
   * @param jsonString The JSON string to deserialize
   * @return The navigation event, or null if parsing fails or not a navigation event
   */
  fun navigationEventFromJson(jsonString: String): SdkNavigationEvent? {
    return fromJson(jsonString) as? SdkNavigationEvent
  }

  /**
   * Deserialize a SdkHandledExceptionEvent from JSON string.
   *
   * @param jsonString The JSON string to deserialize
   * @return The exception event, or null if parsing fails or not an exception event
   */
  fun handledExceptionEventFromJson(jsonString: String): SdkHandledExceptionEvent? {
    return fromJson(jsonString) as? SdkHandledExceptionEvent
  }

  /**
   * Deserialize a SdkNotificationActionEvent from JSON string.
   *
   * @param jsonString The JSON string to deserialize
   * @return The notification event, or null if parsing fails or not a notification event
   */
  fun notificationActionEventFromJson(jsonString: String): SdkNotificationActionEvent? {
    return fromJson(jsonString) as? SdkNotificationActionEvent
  }

  /**
   * Deserialize a SdkRecompositionSnapshotEvent from JSON string.
   *
   * @param jsonString The JSON string to deserialize
   * @return The recomposition event, or null if parsing fails or not a recomposition event
   */
  fun recompositionSnapshotEventFromJson(jsonString: String): SdkRecompositionSnapshotEvent? {
    return fromJson(jsonString) as? SdkRecompositionSnapshotEvent
  }

  /**
   * Deserialize a SdkCrashEvent from JSON string.
   *
   * @param jsonString The JSON string to deserialize
   * @return The crash event, or null if parsing fails or not a crash event
   */
  fun crashEventFromJson(jsonString: String): SdkCrashEvent? {
    return fromJson(jsonString) as? SdkCrashEvent
  }
}
