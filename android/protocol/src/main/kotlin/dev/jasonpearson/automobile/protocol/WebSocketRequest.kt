package dev.jasonpearson.automobile.protocol

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/**
 * Sealed class hierarchy for all inbound WebSocket messages from MCP server to Android.
 *
 * Each request type is a separate data class with only the fields it needs,
 * replacing the flat WebSocketRequest with 25+ optional fields.
 */
@Serializable
sealed class WebSocketRequest {
  abstract val requestId: String?
}

// =============================================================================
// Hierarchy Requests
// =============================================================================

@Serializable
@SerialName("request_hierarchy")
data class RequestHierarchy(
  override val requestId: String? = null,
  val disableAllFiltering: Boolean = false,
) : WebSocketRequest()

@Serializable
@SerialName("request_hierarchy_if_stale")
data class RequestHierarchyIfStale(
  override val requestId: String? = null,
  val sinceTimestamp: Long,
  val disableAllFiltering: Boolean = false,
) : WebSocketRequest()

// =============================================================================
// Screenshot Request
// =============================================================================

@Serializable
@SerialName("request_screenshot")
data class RequestScreenshot(
  override val requestId: String? = null,
) : WebSocketRequest()

// =============================================================================
// Gesture Requests
// =============================================================================

@Serializable
@SerialName("request_tap_coordinates")
data class RequestTapCoordinates(
  override val requestId: String? = null,
  val x: Int,
  val y: Int,
  val duration: Long = 10L,
) : WebSocketRequest()

@Serializable
@SerialName("request_swipe")
data class RequestSwipe(
  override val requestId: String? = null,
  val x1: Int,
  val y1: Int,
  val x2: Int,
  val y2: Int,
  val duration: Long = 300L,
) : WebSocketRequest()

@Serializable
@SerialName("request_two_finger_swipe")
data class RequestTwoFingerSwipe(
  override val requestId: String? = null,
  val x1: Int,
  val y1: Int,
  val x2: Int,
  val y2: Int,
  val duration: Long = 300L,
  val offset: Int = 100,
) : WebSocketRequest()

@Serializable
@SerialName("request_drag")
data class RequestDrag(
  override val requestId: String? = null,
  val x1: Int,
  val y1: Int,
  val x2: Int,
  val y2: Int,
  val pressDurationMs: Long = 600L,
  val dragDurationMs: Long = 300L,
  val holdDurationMs: Long = 100L,
  // Legacy field names for backward compatibility
  val holdTime: Long? = null,
  val duration: Long? = null,
) : WebSocketRequest() {
  /** Resolved press duration, using legacy holdTime as fallback */
  val resolvedPressDurationMs: Long
    get() = if (pressDurationMs == 600L && holdTime != null) holdTime else pressDurationMs

  /** Resolved drag duration, using legacy duration as fallback */
  val resolvedDragDurationMs: Long
    get() = if (dragDurationMs == 300L && duration != null) duration else dragDurationMs
}

@Serializable
@SerialName("request_pinch")
data class RequestPinch(
  override val requestId: String? = null,
  val centerX: Int,
  val centerY: Int,
  val distanceStart: Int,
  val distanceEnd: Int,
  val rotationDegrees: Float = 0f,
  val duration: Long = 300L,
) : WebSocketRequest()

// =============================================================================
// Text Input Requests
// =============================================================================

@Serializable
@SerialName("request_set_text")
data class RequestSetText(
  override val requestId: String? = null,
  val text: String,
  val resourceId: String? = null,
  val dismissKeyboard: Boolean = false,
) : WebSocketRequest()

@Serializable
@SerialName("request_ime_action")
data class RequestImeAction(
  override val requestId: String? = null,
  val action: String, // done, next, search, send, go, previous
) : WebSocketRequest()

@Serializable
@SerialName("request_select_all")
data class RequestSelectAll(
  override val requestId: String? = null,
) : WebSocketRequest()

// =============================================================================
// Node Action Request
// =============================================================================

@Serializable
@SerialName("request_action")
data class RequestAction(
  override val requestId: String? = null,
  val action: String, // e.g., long_click
  val resourceId: String? = null,
) : WebSocketRequest()

// =============================================================================
// Clipboard Request
// =============================================================================

@Serializable
@SerialName("request_clipboard")
data class RequestClipboard(
  override val requestId: String? = null,
  val action: String, // copy, paste, clear, get
  val text: String? = null, // Required for 'copy' action
) : WebSocketRequest()

// =============================================================================
// Certificate Requests
// =============================================================================

@Serializable
@SerialName("install_ca_cert")
data class InstallCaCert(
  override val requestId: String? = null,
  val certificate: String,
) : WebSocketRequest()

@Serializable
@SerialName("install_ca_cert_from_path")
data class InstallCaCertFromPath(
  override val requestId: String? = null,
  val devicePath: String,
) : WebSocketRequest()

@Serializable
@SerialName("remove_ca_cert")
data class RemoveCaCert(
  override val requestId: String? = null,
  val alias: String? = null,
  val certificate: String? = null,
) : WebSocketRequest()

// =============================================================================
// Device Info Requests
// =============================================================================

@Serializable
@SerialName("get_device_owner_status")
data class GetDeviceOwnerStatus(
  override val requestId: String? = null,
) : WebSocketRequest()

@Serializable
@SerialName("get_permission")
data class GetPermission(
  override val requestId: String? = null,
  val permission: String?,
  val requestPermission: Boolean? = null,
) : WebSocketRequest()

// =============================================================================
// Accessibility Focus Requests
// =============================================================================

@Serializable
@SerialName("get_current_focus")
data class GetCurrentFocus(
  override val requestId: String? = null,
) : WebSocketRequest()

@Serializable
@SerialName("get_traversal_order")
data class GetTraversalOrder(
  override val requestId: String? = null,
) : WebSocketRequest()

// =============================================================================
// Highlight Request
// =============================================================================

@Serializable
@SerialName("add_highlight")
data class AddHighlight(
  override val requestId: String? = null,
  val id: String? = null,
  val shape: HighlightShape? = null,
) : WebSocketRequest()

// =============================================================================
// Storage Requests
// =============================================================================

@Serializable
@SerialName("list_preference_files")
data class ListPreferenceFiles(
  override val requestId: String? = null,
  val packageName: String,
) : WebSocketRequest()

@Serializable
@SerialName("get_preferences")
data class GetPreferences(
  override val requestId: String? = null,
  val packageName: String,
  val fileName: String,
) : WebSocketRequest()

@Serializable
@SerialName("subscribe_storage")
data class SubscribeStorage(
  override val requestId: String? = null,
  val packageName: String,
  val fileName: String,
) : WebSocketRequest()

@Serializable
@SerialName("unsubscribe_storage")
data class UnsubscribeStorage(
  override val requestId: String? = null,
  val packageName: String,
  val fileName: String,
) : WebSocketRequest()

@Serializable
@SerialName("get_preference")
data class GetPreference(
  override val requestId: String? = null,
  val packageName: String,
  val fileName: String,
  val key: String,
) : WebSocketRequest()

@Serializable
@SerialName("set_preference")
data class SetPreference(
  override val requestId: String? = null,
  val packageName: String,
  val fileName: String,
  val key: String,
  val value: String?,
  val valueType: String,
) : WebSocketRequest()

@Serializable
@SerialName("remove_preference")
data class RemovePreference(
  override val requestId: String? = null,
  val packageName: String,
  val fileName: String,
  val key: String,
) : WebSocketRequest()

@Serializable
@SerialName("clear_preferences")
data class ClearPreferences(
  override val requestId: String? = null,
  val packageName: String,
  val fileName: String,
) : WebSocketRequest()

// =============================================================================
// Global Action Request
// =============================================================================

@Serializable
@SerialName("request_global_action")
data class RequestGlobalAction(
  override val requestId: String? = null,
  val action: String, // back, home, recent, notifications, power_dialog, lock_screen
) : WebSocketRequest()

// =============================================================================
// Device Info Request
// =============================================================================

@Serializable
@SerialName("request_device_info")
data class RequestDeviceInfo(
  override val requestId: String? = null,
) : WebSocketRequest()

// =============================================================================
// Configuration Requests
// =============================================================================

@Serializable
@SerialName("set_recomposition_tracking")
data class SetRecompositionTracking(
  override val requestId: String? = null,
  val enabled: Boolean,
) : WebSocketRequest()
