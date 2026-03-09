package dev.jasonpearson.automobile.ctrlproxy.models

import kotlinx.serialization.SerialName
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
    val windows: List<WindowInfo>? = null,
    val intentChooserDetected: Boolean? = null,
    val notificationPermissionDetected: Boolean? = null,
    @SerialName("accessibility-focused-element")
    val accessibilityFocusedElement: UIElementInfo? = null, // Element with TalkBack cursor
    val ctrlProxyIncomplete: Boolean? = null,
    val error: String? = null, // For error cases like locked screen
    val screenWidth: Int? = null,
    val screenHeight: Int? = null,
    val rotation: Int? = null, // 0=portrait, 1=landscape90, 2=reverse, 3=landscape270
    val systemInsets: SystemInsetsInfo? = null,
    val wakefulness: String? = null, // "Awake", "Asleep", or "Dozing"
    val foregroundActivity: String? = null, // e.g. "com.example.app/.MainActivity"
    val density: Int? = null, // Display density in DPI
    val sdkInt: Int? = null, // Android API level (e.g. 34)
    val deviceModel: String? = null, // e.g. "Pixel 8"
    val isEmulator: Boolean? = null, // Whether running on an emulator
)
