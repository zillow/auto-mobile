package dev.jasonpearson.automobile.accessibilityservice.models

import kotlinx.serialization.Serializable

/** System insets (status bar, navigation bar, gesture insets) for coordinate adjustment. */
@Serializable
data class SystemInsetsInfo(
    val top: Int = 0, // status bar
    val bottom: Int = 0, // nav bar
    val left: Int = 0, // gesture inset
    val right: Int = 0, // gesture inset
)
