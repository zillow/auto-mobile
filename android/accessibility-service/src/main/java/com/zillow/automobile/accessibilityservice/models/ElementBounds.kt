package com.zillow.automobile.accessibilityservice.models

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
