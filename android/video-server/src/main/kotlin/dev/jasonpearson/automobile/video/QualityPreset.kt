package dev.jasonpearson.automobile.video

/**
 * Hardcoded quality presets for video streaming.
 *
 * @property maxHeight Maximum height in pixels (width scales proportionally)
 * @property bitrate Target bitrate in bits per second
 * @property fps Target frame rate
 */
enum class QualityPreset(
    val maxHeight: Int,
    val bitrate: Int,
    val fps: Int,
) {
  /** 540p @ 2 Mbps @ 30fps - Good for slow USB connections */
  LOW(maxHeight = 540, bitrate = 2_000_000, fps = 30),

  /** 720p @ 4 Mbps @ 60fps - Balanced quality and performance */
  MEDIUM(maxHeight = 720, bitrate = 4_000_000, fps = 60),

  /** 1080p @ 8 Mbps @ 60fps - Full HD streaming */
  HIGH(maxHeight = 1080, bitrate = 8_000_000, fps = 60);

  companion object {
    fun fromString(value: String): QualityPreset =
        when (value.lowercase()) {
          "low" -> LOW
          "medium" -> MEDIUM
          "high" -> HIGH
          else -> throw IllegalArgumentException("Unknown quality preset: $value")
        }
  }
}
