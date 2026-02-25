package dev.jasonpearson.automobile.ctrlproxy.models

/** Screen dimensions for filtering offscreen elements during hierarchy extraction. */
data class ScreenDimensions(val width: Int, val height: Int) {
  /** Check if dimensions are valid for filtering. */
  fun isValid(): Boolean = width > 0 && height > 0
}
