package dev.jasonpearson.automobile.accessibilityservice.models

import android.graphics.Rect
import kotlinx.serialization.Serializable

/**
 * Serializable representation of element bounds Compatible with both Rect objects and string bounds
 * format
 */
@Serializable
data class ElementBounds(val left: Int, val top: Int, val right: Int, val bottom: Int) {
  constructor(rect: Rect) : this(rect.left, rect.top, rect.right, rect.bottom)

  val width: Int
    get() = right - left

  val height: Int
    get() = bottom - top

  val centerX: Int
    get() = left + width / 2

  val centerY: Int
    get() = top + height / 2

  /**
   * Check if bounds have zero or negative area.
   *
   * @return True if the element has no visible area
   */
  fun hasZeroArea(): Boolean = width <= 0 || height <= 0

  /**
   * Check if bounds are completely offscreen given screen dimensions.
   *
   * @param screenWidth Screen width in pixels
   * @param screenHeight Screen height in pixels
   * @param margin Extra margin to keep near-visible elements (default 0)
   * @return True if element is completely outside visible area
   */
  fun isCompletelyOffscreen(screenWidth: Int, screenHeight: Int, margin: Int = 0): Boolean {
    // Handle inverted bounds (top > bottom or left > right) as offscreen
    if (top > bottom || left > right) return true

    return right < -margin || // Completely left of screen
        left > screenWidth + margin || // Completely right of screen
        bottom < -margin || // Completely above screen
        top > screenHeight + margin // Completely below screen
  }

  /** Convert to string format matching XML bounds attribute */
  override fun toString(): String = "[$left,$top][$right,$bottom]"

  companion object {
    /** Parse bounds string like "[0,0][100,100]" into ElementBounds */
    fun fromString(boundsString: String?): ElementBounds? {
      if (boundsString.isNullOrBlank()) return null

      return try {
        val regex = "\\[(\\d+),(\\d+)\\]\\[(\\d+),(\\d+)\\]".toRegex()
        val matchResult = regex.find(boundsString) ?: return null

        val (left, top, right, bottom) = matchResult.destructured
        ElementBounds(left.toInt(), top.toInt(), right.toInt(), bottom.toInt())
      } catch (e: Exception) {
        null
      }
    }
  }
}
