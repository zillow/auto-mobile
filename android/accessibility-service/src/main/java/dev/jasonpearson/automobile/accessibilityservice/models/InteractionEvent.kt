package dev.jasonpearson.automobile.accessibilityservice.models

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class InteractionElement(
    val text: String? = null,
    @SerialName("content-desc") val contentDescription: String? = null,
    @SerialName("resource-id") val resourceId: String? = null,
    @SerialName("class") val className: String? = null,
    val bounds: ElementBounds? = null,
)

@Serializable
data class InteractionEvent(
    val type: String,
    val timestamp: Long,
    val packageName: String? = null,
    val screenClassName: String? = null,
    val element: InteractionElement? = null,
    val text: String? = null,
    val scrollDeltaX: Int? = null,
    val scrollDeltaY: Int? = null,
)
