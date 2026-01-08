package dev.jasonpearson.automobile.accessibilityservice.models

import kotlinx.serialization.Serializable

/**
 * Complete view hierarchy representation matching the structure expected by AutoMobile test
 * framework
 */
@Serializable
data class ViewHierarchy(
    val updatedAt: Long = System.currentTimeMillis(),
    val packageName: String? = null,
    val hierarchy: UIElementInfo? = null,
    val windowInfo: WindowInfo? = null,
    val windows: List<WindowHierarchy>? = null, // All visible windows (including popups, toolbars)
    val intentChooserDetected: Boolean? = null,
    val notificationPermissionDetected: Boolean? = null,
    val error: String? = null, // For error cases like locked screen
)

/**
 * Represents a single window's hierarchy with its metadata. Used to capture all visible windows
 * including floating toolbars and popups.
 */
@Serializable
data class WindowHierarchy(
    val windowId: Int,
    val windowType: String,
    val windowLayer: Int,
    val packageName: String? = null,
    val isActive: Boolean = false,
    val isFocused: Boolean = false,
    val hierarchy: UIElementInfo? = null,
)
