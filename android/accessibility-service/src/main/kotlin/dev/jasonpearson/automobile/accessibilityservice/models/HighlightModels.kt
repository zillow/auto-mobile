package dev.jasonpearson.automobile.accessibilityservice.models

import android.graphics.RectF
import kotlinx.serialization.Serializable

@Serializable
data class HighlightBounds(
    val x: Int,
    val y: Int,
    val width: Int,
    val height: Int,
    val sourceWidth: Int? = null,
    val sourceHeight: Int? = null,
) {
  fun hasValidSize(): Boolean = width > 0 && height > 0

  fun toRectF(scaleX: Float = 1f, scaleY: Float = 1f): RectF {
    val left = x.toFloat() * scaleX
    val top = y.toFloat() * scaleY
    val right = (x + width).toFloat() * scaleX
    val bottom = (y + height).toFloat() * scaleY
    return RectF(left, top, right, bottom)
  }
}

@Serializable
data class HighlightStyle(
    val strokeColor: String? = null,
    val strokeWidth: Float? = null,
    val fillColor: String? = null,
    val dashPattern: List<Float>? = null,
)

@Serializable
data class HighlightShape(
    val type: String,
    val bounds: HighlightBounds,
    val style: HighlightStyle? = null,
)

@Serializable
data class HighlightEntry(
    val id: String,
    val shape: HighlightShape,
)
