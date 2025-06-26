package com.zillow.automobile.accessibilityservice.models

import kotlinx.serialization.Serializable

/**
 * Complete view hierarchy representation matching the structure expected by AutoMobile test
 * framework
 */
@Serializable
data class ViewHierarchy(
    val timestamp: Long = System.currentTimeMillis(),
    val packageName: String? = null,
    val hierarchy: UIElementInfo? = null,
    val windowInfo: WindowInfo? = null,
    val error: String? = null // For error cases like locked screen
)
