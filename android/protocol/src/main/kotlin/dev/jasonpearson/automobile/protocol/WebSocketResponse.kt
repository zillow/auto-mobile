package dev.jasonpearson.automobile.protocol

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/**
 * Sealed class hierarchy for all outbound WebSocket messages from Android to MCP server.
 *
 * Messages are grouped into:
 * - Events: Push notifications (hierarchy updates, navigation, interactions)
 * - Results: Responses to specific requests
 */
@Serializable
sealed class WebSocketResponse {
  abstract val timestamp: Long
}

// =============================================================================
// Connection
// =============================================================================

@Serializable
@SerialName("connected")
data class ConnectedResponse(
  val id: Int,
  override val timestamp: Long = System.currentTimeMillis(),
) : WebSocketResponse()

// =============================================================================
// Push Events (unsolicited messages)
// =============================================================================

@Serializable
@SerialName("hierarchy_update")
data class HierarchyUpdateEvent(
  override val timestamp: Long,
  val data: String, // JSON string of hierarchy data
  val perfTiming: String? = null,
) : WebSocketResponse()

@Serializable
@SerialName("interaction_event")
data class InteractionEvent(
  override val timestamp: Long,
  val event: String, // JSON string of interaction event
) : WebSocketResponse()

@Serializable
@SerialName("package_event")
data class PackageEvent(
  override val timestamp: Long,
  val event: PackageEventData,
) : WebSocketResponse()

@Serializable
data class PackageEventData(
  val eventType: String,
  val packageName: String,
  val className: String? = null,
)

@Serializable
@SerialName("navigation_event")
data class NavigationEventResponse(
  override val timestamp: Long,
  val event: NavigationEventData,
) : WebSocketResponse()

@Serializable
data class NavigationEventData(
  val destination: String,
  val source: String? = null,
  val arguments: Map<String, String>? = null,
  val metadata: Map<String, String>? = null,
  val applicationId: String? = null,
  /** Monotonically increasing sequence number for ordering */
  val sequenceNumber: Long? = null,
)

@Serializable
@SerialName("handled_exception_event")
data class HandledExceptionEvent(
  override val timestamp: Long,
  val event: HandledExceptionData,
) : WebSocketResponse()

/**
 * Device information captured at the time of an exception.
 */
@Serializable
data class DeviceInfo(
  val model: String,
  val manufacturer: String,
  val osVersion: String,
  val sdkInt: Int,
)

@Serializable
data class HandledExceptionData(
  val exceptionClass: String,
  val message: String?,
  val stackTrace: String,
  val customMessage: String? = null,
  val currentScreen: String? = null,
  val packageName: String? = null,
  val appVersion: String? = null,
  val deviceInfo: DeviceInfo? = null,
  val applicationId: String? = null,
)

@Serializable
@SerialName("storage_changed")
data class StorageChangedEvent(
  override val timestamp: Long,
  val packageName: String,
  val fileName: String,
  val data: String, // JSON string of preferences
) : WebSocketResponse()

@Serializable
@SerialName("crash_event")
data class CrashEvent(
  override val timestamp: Long,
  val event: CrashData,
) : WebSocketResponse()

@Serializable
data class CrashData(
  val exceptionClass: String,
  val message: String?,
  val stackTrace: String,
  val threadName: String,
  val currentScreen: String? = null,
  val packageName: String? = null,
  val appVersion: String? = null,
  val deviceInfo: DeviceInfo? = null,
  val applicationId: String? = null,
)

@Serializable
@SerialName("anr_event")
data class AnrEvent(
  override val timestamp: Long,
  val event: AnrData,
) : WebSocketResponse()

@Serializable
data class AnrData(
  /** Process ID that experienced the ANR */
  val pid: Int,
  /** Process name */
  val processName: String,
  /** Process importance when ANR occurred (FOREGROUND, VISIBLE, etc.) */
  val importance: String,
  /** Full thread dump from ApplicationExitInfo.traceInputStream */
  val trace: String?,
  /** Human-readable reason description */
  val reason: String,
  /** Package name of the app */
  val packageName: String? = null,
  /** App version */
  val appVersion: String? = null,
  /** Device information */
  val deviceInfo: DeviceInfo? = null,
)

// =============================================================================
// Screenshot Results
// =============================================================================

@Serializable
@SerialName("screenshot")
data class ScreenshotResult(
  override val timestamp: Long,
  val requestId: String? = null,
  val data: String, // Base64 encoded image
  val format: String = "jpeg",
  val width: Int? = null,
  val height: Int? = null,
) : WebSocketResponse()

@Serializable
@SerialName("screenshot_error")
data class ScreenshotErrorResult(
  override val timestamp: Long,
  val requestId: String? = null,
  val error: String,
) : WebSocketResponse()

// =============================================================================
// Gesture Results
// =============================================================================

@Serializable
@SerialName("swipe_result")
data class SwipeResult(
  override val timestamp: Long,
  val requestId: String? = null,
  val success: Boolean,
  val totalTimeMs: Long,
  val gestureTimeMs: Long? = null,
  val error: String? = null,
  val perfTiming: String? = null,
) : WebSocketResponse()

@Serializable
@SerialName("tap_coordinates_result")
data class TapCoordinatesResult(
  override val timestamp: Long,
  val requestId: String? = null,
  val success: Boolean,
  val totalTimeMs: Long,
  val gestureTimeMs: Long? = null,
  val error: String? = null,
  val perfTiming: String? = null,
) : WebSocketResponse()

@Serializable
@SerialName("drag_result")
data class DragResult(
  override val timestamp: Long,
  val requestId: String? = null,
  val success: Boolean,
  val totalTimeMs: Long,
  val gestureTimeMs: Long? = null,
  val error: String? = null,
  val perfTiming: String? = null,
) : WebSocketResponse()

@Serializable
@SerialName("pinch_result")
data class PinchResult(
  override val timestamp: Long,
  val requestId: String? = null,
  val success: Boolean,
  val totalTimeMs: Long,
  val gestureTimeMs: Long? = null,
  val error: String? = null,
  val perfTiming: String? = null,
) : WebSocketResponse()

// =============================================================================
// Text Input Results
// =============================================================================

@Serializable
@SerialName("set_text_result")
data class SetTextResult(
  override val timestamp: Long,
  val requestId: String? = null,
  val success: Boolean,
  val totalTimeMs: Long,
  val error: String? = null,
  val perfTiming: String? = null,
) : WebSocketResponse()

@Serializable
@SerialName("ime_action_result")
data class ImeActionResult(
  override val timestamp: Long,
  val requestId: String? = null,
  val success: Boolean,
  val action: String? = null,
  val totalTimeMs: Long,
  val error: String? = null,
  val perfTiming: String? = null,
) : WebSocketResponse()

@Serializable
@SerialName("select_all_result")
data class SelectAllResult(
  override val timestamp: Long,
  val requestId: String? = null,
  val success: Boolean,
  val totalTimeMs: Long,
  val error: String? = null,
  val perfTiming: String? = null,
) : WebSocketResponse()

// =============================================================================
// Action Result
// =============================================================================

@Serializable
@SerialName("action_result")
data class ActionResult(
  override val timestamp: Long,
  val requestId: String? = null,
  val success: Boolean,
  val action: String? = null,
  val totalTimeMs: Long,
  val error: String? = null,
  val perfTiming: String? = null,
) : WebSocketResponse()

// =============================================================================
// Clipboard Result
// =============================================================================

@Serializable
@SerialName("clipboard_result")
data class ClipboardResult(
  override val timestamp: Long,
  val requestId: String? = null,
  val success: Boolean,
  val action: String,
  val text: String? = null, // For 'get' action
  val totalTimeMs: Long,
  val error: String? = null,
  val perfTiming: String? = null,
) : WebSocketResponse()

// =============================================================================
// Certificate Result
// =============================================================================

@Serializable
@SerialName("ca_cert_result")
data class CaCertResult(
  override val timestamp: Long,
  val requestId: String? = null,
  val success: Boolean,
  val action: String, // install, remove
  val alias: String? = null,
  val totalTimeMs: Long,
  val error: String? = null,
  val perfTiming: String? = null,
) : WebSocketResponse()

// =============================================================================
// Device Info Results
// =============================================================================

@Serializable
@SerialName("device_owner_status_result")
data class DeviceOwnerStatusResult(
  override val timestamp: Long,
  val requestId: String? = null,
  val success: Boolean,
  val isDeviceOwner: Boolean,
  val isAdminActive: Boolean,
  val packageName: String? = null,
  val totalTimeMs: Long,
  val error: String? = null,
  val perfTiming: String? = null,
) : WebSocketResponse()

@Serializable
@SerialName("permission_result")
data class PermissionResult(
  override val timestamp: Long,
  val requestId: String? = null,
  val success: Boolean,
  val permission: String,
  val granted: Boolean,
  val requestLaunched: Boolean = false,
  val canRequest: Boolean = false,
  val requiresSettings: Boolean = false,
  val instructions: String? = null,
  val adbCommand: String? = null,
  val totalTimeMs: Long,
  val error: String? = null,
  val perfTiming: String? = null,
) : WebSocketResponse()

// =============================================================================
// Global Action Result
// =============================================================================

@Serializable
@SerialName("global_action_result")
data class GlobalActionResult(
  override val timestamp: Long,
  val requestId: String? = null,
  val success: Boolean,
  val action: String,
  val totalTimeMs: Long,
  val error: String? = null,
) : WebSocketResponse()

// =============================================================================
// Device Info Result
// =============================================================================

@Serializable
@SerialName("device_info_result")
data class DeviceInfoResult(
  override val timestamp: Long,
  val requestId: String? = null,
  val success: Boolean,
  val screenWidth: Int? = null,
  val screenHeight: Int? = null,
  val density: Int? = null,
  val rotation: Int? = null,
  val sdkInt: Int? = null,
  val deviceModel: String? = null,
  val isEmulator: Boolean? = null,
  val wakefulness: String? = null,
  val foregroundActivity: String? = null,
  val totalTimeMs: Long,
  val error: String? = null,
) : WebSocketResponse()

// =============================================================================
// Accessibility Focus Results
// =============================================================================

@Serializable
@SerialName("current_focus_result")
data class CurrentFocusResult(
  override val timestamp: Long,
  val requestId: String? = null,
  val focusedElement: String? = null, // JSON string of focused element
  val totalTimeMs: Long,
  val error: String? = null,
  val perfTiming: String? = null,
) : WebSocketResponse()

@Serializable
@SerialName("traversal_order_result")
data class TraversalOrderResult(
  override val timestamp: Long,
  val requestId: String? = null,
  val result: TraversalOrderData? = null,
  val totalTimeMs: Long,
  val error: String? = null,
  val perfTiming: String? = null,
) : WebSocketResponse()

@Serializable
data class TraversalOrderData(
  val elements: List<String>, // JSON strings of elements
  val focusedIndex: Int?,
  val totalCount: Int,
)

@Serializable
@SerialName("highlight_response")
data class HighlightResponse(
  override val timestamp: Long,
  val requestId: String? = null,
  val success: Boolean,
  val error: String? = null,
) : WebSocketResponse()

// =============================================================================
// Storage Results
// =============================================================================

@Serializable
@SerialName("preference_files")
data class PreferenceFilesResult(
  override val timestamp: Long,
  val requestId: String? = null,
  val success: Boolean,
  val packageName: String,
  val files: List<String>? = null,
  val error: String? = null,
) : WebSocketResponse()

@Serializable
@SerialName("preferences")
data class PreferencesResult(
  override val timestamp: Long,
  val requestId: String? = null,
  val success: Boolean,
  val packageName: String,
  val fileName: String,
  val data: String? = null, // JSON string of preferences
  val error: String? = null,
) : WebSocketResponse()

@Serializable
@SerialName("subscribe_storage_result")
data class SubscribeStorageResult(
  override val timestamp: Long,
  val requestId: String? = null,
  val success: Boolean,
  val packageName: String,
  val fileName: String,
  val error: String? = null,
) : WebSocketResponse()

@Serializable
@SerialName("unsubscribe_storage_result")
data class UnsubscribeStorageResult(
  override val timestamp: Long,
  val requestId: String? = null,
  val success: Boolean,
  val packageName: String,
  val fileName: String,
  val error: String? = null,
) : WebSocketResponse()

@Serializable
@SerialName("get_preference_result")
data class GetPreferenceResult(
  override val timestamp: Long,
  val requestId: String? = null,
  val success: Boolean,
  val packageName: String,
  val fileName: String,
  val key: String,
  val value: String? = null,
  val type: String? = null,
  val found: Boolean = false,
  val error: String? = null,
) : WebSocketResponse()

@Serializable
@SerialName("set_preference_result")
data class SetPreferenceResult(
  override val timestamp: Long,
  val requestId: String? = null,
  val success: Boolean,
  val packageName: String,
  val fileName: String,
  val key: String,
  val error: String? = null,
) : WebSocketResponse()

@Serializable
@SerialName("remove_preference_result")
data class RemovePreferenceResult(
  override val timestamp: Long,
  val requestId: String? = null,
  val success: Boolean,
  val packageName: String,
  val fileName: String,
  val key: String,
  val error: String? = null,
) : WebSocketResponse()

@Serializable
@SerialName("clear_preferences_result")
data class ClearPreferencesResult(
  override val timestamp: Long,
  val requestId: String? = null,
  val success: Boolean,
  val packageName: String,
  val fileName: String,
  val error: String? = null,
) : WebSocketResponse()
