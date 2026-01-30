package dev.jasonpearson.automobile.video

import android.hardware.display.VirtualDisplay
import android.view.Surface
import dev.jasonpearson.automobile.video.wrappers.DisplayControl

/**
 * Manages VirtualDisplay creation for screen mirroring.
 *
 * Uses hidden DisplayManagerGlobal APIs via [DisplayControl] to create a VirtualDisplay that
 * mirrors the main display. This only works when running as shell user (UID 2000).
 */
class ScreenCapture(
    private val width: Int,
    private val height: Int,
    private val densityDpi: Int,
) {
  private var virtualDisplay: VirtualDisplay? = null

  /**
   * Create a VirtualDisplay that mirrors the main display.
   *
   * @param surface The surface to render to (typically from MediaCodec)
   * @return The created VirtualDisplay
   */
  fun start(surface: Surface): VirtualDisplay {
    val display =
        DisplayControl.createVirtualDisplay(
            name = "automobile-mirror",
            width = width,
            height = height,
            densityDpi = densityDpi,
            surface = surface,
            displayIdToMirror = 0, // Mirror the main display
        )
    virtualDisplay = display
    return display
  }

  /** Release the VirtualDisplay. */
  fun stop() {
    virtualDisplay?.release()
    virtualDisplay = null
  }
}
