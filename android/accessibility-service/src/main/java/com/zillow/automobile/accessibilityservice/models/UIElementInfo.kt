package com.zillow.automobile.accessibilityservice.models

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonElement

/**
 * Data class representing UI elements with all relevant properties extracted from
 * AccessibilityNodeInfo for automated testing.
 *
 * Property names match the XML attribute format used by uiautomator to maintain compatibility with
 * existing test frameworks.
 */
@Serializable
data class UIElementInfo(
    val text: String? = null,
    @SerialName("content-desc") val contentDesc: String? = null,
    @SerialName("resource-id") val resourceId: String? = null,
    val className: String? = null,
    val packageName: String? = null,
    val bounds: ElementBounds? = null,
    val clickable: String? = null, // "true"/"false" to match XML format
    val enabled: String? = null,
    val focusable: String? = null,
    val focused: String? = null,
    val scrollable: String? = null,
    val password: String? = null,
    val checkable: String? = null,
    val checked: String? = null,
    val selected: String? = null,
    @SerialName("long-clickable") val longClickable: String? = null,
    val accessible: Double? = null, // Z-index accessibility percentage (0.0-1.0)
    val fragment: String? = null, // Fragment class name when applicable
    // Use JsonElement to allow flexible structure matching test expectations
    val node: JsonElement? = null
) {
  /** Helper properties for boolean checks (for backwards compatibility) */
  val isClickable: Boolean
    get() = clickable == "true"

  val isEnabled: Boolean
    get() = enabled != "false" // Default true if not specified

  val isFocusable: Boolean
    get() = focusable == "true"

  val isFocused: Boolean
    get() = focused == "true"

  val isScrollable: Boolean
    get() = scrollable == "true"

  val isPassword: Boolean
    get() = password == "true"

  val isCheckable: Boolean
    get() = checkable == "true"

  val isChecked: Boolean
    get() = checked == "true"

  val isSelected: Boolean
    get() = selected == "true"

  val isLongClickable: Boolean
    get() = longClickable == "true"

  /**
   * Legacy children property for backwards compatibility Note: In the new format, children are
   * stored in the 'node' property
   */
  @Deprecated("Use node property instead", ReplaceWith("emptyList()"))
  val children: List<UIElementInfo>
    get() = emptyList()
}
