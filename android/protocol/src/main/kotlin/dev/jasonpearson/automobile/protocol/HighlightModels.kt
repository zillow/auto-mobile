package dev.jasonpearson.automobile.protocol

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/**
 * Bounds for a highlight shape.
 * Pure Kotlin version without Android dependencies.
 */
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
}

/**
 * A point in a highlight path.
 */
@Serializable
data class HighlightPoint(
  val x: Float,
  val y: Float,
)

/**
 * Smoothing algorithm for path highlights.
 */
@Serializable
enum class SmoothingAlgorithm {
  @SerialName("none") NONE,
  @SerialName("catmull-rom") CATMULL_ROM,
  @SerialName("bezier") BEZIER,
  @SerialName("douglas-peucker") DOUGLAS_PEUCKER,
}

/**
 * Line cap style for highlight strokes.
 */
@Serializable
enum class HighlightLineCap {
  @SerialName("butt") BUTT,
  @SerialName("round") ROUND,
  @SerialName("square") SQUARE,
}

/**
 * Line join style for highlight strokes.
 */
@Serializable
enum class HighlightLineJoin {
  @SerialName("miter") MITER,
  @SerialName("round") ROUND,
  @SerialName("bevel") BEVEL,
}

/**
 * Style configuration for a highlight.
 */
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

/**
 * A highlight shape to draw on the device screen.
 * Supports box, circle, and path shapes.
 */
@Serializable
data class HighlightShape(
  val type: String, // "box", "circle", or "path"
  val bounds: HighlightBounds? = null,
  val points: List<HighlightPoint>? = null,
  val style: HighlightStyle? = null,
)
