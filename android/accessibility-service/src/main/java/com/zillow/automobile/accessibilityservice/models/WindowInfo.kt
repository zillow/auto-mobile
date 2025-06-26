package com.zillow.automobile.accessibilityservice.models

import kotlinx.serialization.Serializable

/** Window information */
@Serializable
data class WindowInfo(
    val id: Int? = null,
    val type: Int? = null,
    val isActive: Boolean = false,
    val isFocused: Boolean = false,
    val bounds: ElementBounds? = null
)
