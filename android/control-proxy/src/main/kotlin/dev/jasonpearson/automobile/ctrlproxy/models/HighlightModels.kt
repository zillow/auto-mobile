package dev.jasonpearson.automobile.ctrlproxy.models

import android.graphics.RectF
import kotlinx.serialization.SerialName
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
data class HighlightPoint(
    val x: Float,
    val y: Float,
)

@Serializable
enum class SmoothingAlgorithm {
  @SerialName("none") NONE,
  @SerialName("catmull-rom") CATMULL_ROM,
  @SerialName("bezier") BEZIER,
  @SerialName("douglas-peucker") DOUGLAS_PEUCKER,
}

@Serializable
enum class HighlightLineCap {
  @SerialName("butt") BUTT,
  @SerialName("round") ROUND,
  @SerialName("square") SQUARE,
}

@Serializable
enum class HighlightLineJoin {
  @SerialName("miter") MITER,
  @SerialName("round") ROUND,
  @SerialName("bevel") BEVEL,
}

@Serializable
data class HighlightStyle(
    val strokeColor: String? = null,
    val strokeWidth: Float? = null,
    val dashPattern: List<Float>? = null,
    val smoothing: SmoothingAlgorithm? = null,
    val tension: Float? = null,
    val capStyle: HighlightLineCap? = null,
    val joinStyle: HighlightLineJoin? = null,
)

@Serializable
data class HighlightShape(
    val type: String,
    val bounds: HighlightBounds? = null,
    val points: List<HighlightPoint>? = null,
    val style: HighlightStyle? = null,
)
