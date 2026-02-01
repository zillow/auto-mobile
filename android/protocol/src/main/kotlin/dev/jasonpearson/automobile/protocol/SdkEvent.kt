package dev.jasonpearson.automobile.protocol

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/**
 * Sealed class hierarchy for SDK events broadcast from the AutoMobile SDK.
 *
 * These events are sent from the app-under-test to the accessibility service,
 * which then forwards them over WebSocket to the MCP server.
 *
 * Event types:
 * - Navigation events: App screen/destination changes
 * - Handled exceptions: Non-fatal errors caught by the app
 * - Notification events: Push notification interactions
 * - Recomposition events: Compose recomposition tracking data
 */
@Serializable
sealed class SdkEvent {
  abstract val timestamp: Long
  abstract val applicationId: String?
}

// =============================================================================
// Navigation Events
// =============================================================================

/**
 * Navigation source/framework identifier.
 */
@Serializable
enum class NavigationSourceType {
  @SerialName("NAVIGATION_COMPONENT") NAVIGATION_COMPONENT,
  @SerialName("COMPOSE_NAVIGATION") COMPOSE_NAVIGATION,
  @SerialName("CIRCUIT") CIRCUIT,
  @SerialName("CUSTOM") CUSTOM,
  @SerialName("DEEP_LINK") DEEP_LINK,
  @SerialName("ACTIVITY") ACTIVITY,
}

/**
 * Represents a navigation event - the user moved to a new screen/destination.
 */
@Serializable
@SerialName("navigation")
data class SdkNavigationEvent(
  override val timestamp: Long,
  override val applicationId: String? = null,
  /** The destination identifier (route, screen name, deep link, etc.) */
  val destination: String,
  /** The navigation framework that generated this event */
  val source: NavigationSourceType,
  /** Optional navigation arguments as string key-value pairs */
  val arguments: Map<String, String>? = null,
  /** Additional metadata about the navigation event */
  val metadata: Map<String, String>? = null,
) : SdkEvent()

// =============================================================================
// Exception Events
// =============================================================================

/**
 * Device information captured at the time of an exception.
 */
@Serializable
data class SdkDeviceInfo(
  val model: String,
  val manufacturer: String,
  val osVersion: String,
  val sdkInt: Int,
)

/**
 * Represents a handled (non-fatal) exception that was caught and reported by the app.
 */
@Serializable
@SerialName("handled_exception")
data class SdkHandledExceptionEvent(
  override val timestamp: Long,
  override val applicationId: String? = null,
  /** Fully qualified class name of the exception (e.g., "java.lang.NullPointerException") */
  val exceptionClass: String,
  /** Exception message, if any */
  val exceptionMessage: String?,
  /** Full stack trace as a string */
  val stackTrace: String,
  /** Optional custom message provided by the developer */
  val customMessage: String? = null,
  /** Current screen/destination at the time of the exception */
  val currentScreen: String? = null,
  /** Application version name, if available */
  val appVersion: String? = null,
  /** Device information */
  val deviceInfo: SdkDeviceInfo? = null,
) : SdkEvent()

// =============================================================================
// Notification Events
// =============================================================================

/**
 * Represents a notification action triggered by the user.
 */
@Serializable
@SerialName("notification_action")
data class SdkNotificationActionEvent(
  override val timestamp: Long,
  override val applicationId: String? = null,
  /** The notification ID */
  val notificationId: String,
  /** The action ID that was tapped */
  val actionId: String,
  /** The action label that was displayed */
  val actionLabel: String,
) : SdkEvent()

// =============================================================================
// Recomposition Events
// =============================================================================

/**
 * Represents a Compose recomposition tracking snapshot.
 */
@Serializable
@SerialName("recomposition_snapshot")
data class SdkRecompositionSnapshotEvent(
  override val timestamp: Long,
  override val applicationId: String? = null,
  /** JSON string containing the recomposition tracking data */
  val snapshotJson: String,
) : SdkEvent()

// =============================================================================
// Crash Events
// =============================================================================

/**
 * Represents an unhandled crash detected by the SDK's UncaughtExceptionHandler.
 * This is a fatal crash that will terminate the app.
 */
@Serializable
@SerialName("crash")
data class SdkCrashEvent(
  override val timestamp: Long,
  override val applicationId: String? = null,
  /** Fully qualified class name of the exception (e.g., "java.lang.NullPointerException") */
  val exceptionClass: String,
  /** Exception message, if any */
  val exceptionMessage: String?,
  /** Full stack trace as a string */
  val stackTrace: String,
  /** Thread name where the crash occurred */
  val threadName: String,
  /** Current screen/destination at the time of the crash */
  val currentScreen: String? = null,
  /** Application version name, if available */
  val appVersion: String? = null,
  /** Device information */
  val deviceInfo: SdkDeviceInfo? = null,
) : SdkEvent()

// =============================================================================
// ANR Events
// =============================================================================

/**
 * Represents an ANR (Application Not Responding) detected via ApplicationExitInfo API.
 * This is captured on app restart after an ANR occurred in a previous session.
 * Requires Android 11+ (API 30).
 */
@Serializable
@SerialName("anr")
data class SdkAnrEvent(
  override val timestamp: Long,
  override val applicationId: String? = null,
  /** Process ID that experienced the ANR */
  val pid: Int,
  /** Process name */
  val processName: String,
  /** Process importance when ANR occurred (FOREGROUND, VISIBLE, CACHED, etc.) */
  val importance: String,
  /** Full thread dump from ApplicationExitInfo.traceInputStream */
  val trace: String?,
  /** Human-readable reason description */
  val reason: String,
  /** Application version name, if available */
  val appVersion: String? = null,
  /** Device information */
  val deviceInfo: SdkDeviceInfo? = null,
) : SdkEvent()
