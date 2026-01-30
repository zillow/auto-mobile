package dev.jasonpearson.automobile.video.wrappers

import android.hardware.display.VirtualDisplay
import android.view.Surface
import java.lang.reflect.Method

/**
 * Reflection wrapper for accessing hidden Android display APIs.
 *
 * This class provides access to `DisplayManagerGlobal.createVirtualDisplay()` with the
 * `displayIdToMirror` parameter, which is required for screen mirroring without MediaProjection.
 *
 * Only works when running as shell user (UID 2000) via `adb shell app_process`.
 */
object DisplayControl {

  private val displayManagerGlobalClass: Class<*> by lazy {
    Class.forName("android.hardware.display.DisplayManagerGlobal")
  }

  private val displayManagerGlobal: Any by lazy {
    val getInstanceMethod = displayManagerGlobalClass.getMethod("getInstance")
    getInstanceMethod.invoke(null)
        ?: throw IllegalStateException("DisplayManagerGlobal.getInstance() returned null")
  }

  private val createVirtualDisplayMethod: Method by lazy {
    // Parameters: String name, int width, int height, int densityDpi,
    //             Surface surface, int flags, VirtualDisplay.Callback callback,
    //             Handler handler, String uniqueId, int displayIdToMirror
    displayManagerGlobalClass.getMethod(
        "createVirtualDisplay",
        String::class.java, // name
        Int::class.javaPrimitiveType, // width
        Int::class.javaPrimitiveType, // height
        Int::class.javaPrimitiveType, // densityDpi
        Surface::class.java, // surface
        Int::class.javaPrimitiveType, // flags
        Class.forName("android.hardware.display.VirtualDisplay\$Callback"), // callback
        android.os.Handler::class.java, // handler
        String::class.java, // uniqueId
        Int::class.javaPrimitiveType, // displayIdToMirror
    )
  }

  /** Get display information for the default display. */
  fun getDisplayInfo(displayId: Int = 0): DisplayInfo {
    val displayInfoClass = Class.forName("android.view.DisplayInfo")
    val displayInfo = displayInfoClass.getDeclaredConstructor().newInstance()

    val getDisplayInfoMethod =
        displayManagerGlobalClass.getMethod(
            "getDisplayInfo",
            Int::class.javaPrimitiveType,
            displayInfoClass,
        )

    getDisplayInfoMethod.invoke(displayManagerGlobal, displayId, displayInfo)

    val logicalWidth = displayInfoClass.getField("logicalWidth").getInt(displayInfo)
    val logicalHeight = displayInfoClass.getField("logicalHeight").getInt(displayInfo)
    val logicalDensityDpi = displayInfoClass.getField("logicalDensityDpi").getInt(displayInfo)
    val rotation = displayInfoClass.getField("rotation").getInt(displayInfo)

    return DisplayInfo(
        width = logicalWidth,
        height = logicalHeight,
        densityDpi = logicalDensityDpi,
        rotation = rotation,
    )
  }

  /**
   * Create a VirtualDisplay that mirrors the specified display.
   *
   * @param name The name of the virtual display
   * @param width The width of the virtual display
   * @param height The height of the virtual display
   * @param densityDpi The density of the virtual display
   * @param surface The surface to render to
   * @param displayIdToMirror The display ID to mirror (typically 0 for the main display)
   * @return The created VirtualDisplay
   */
  fun createVirtualDisplay(
      name: String,
      width: Int,
      height: Int,
      densityDpi: Int,
      surface: Surface,
      displayIdToMirror: Int = 0,
  ): VirtualDisplay {
    // Flags for mirroring: VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR (1 << 4) = 16
    val flags = 1 shl 4

    return createVirtualDisplayMethod.invoke(
        displayManagerGlobal,
        name,
        width,
        height,
        densityDpi,
        surface,
        flags,
        null, // callback
        null, // handler
        null, // uniqueId
        displayIdToMirror,
    ) as VirtualDisplay
  }

  data class DisplayInfo(
      val width: Int,
      val height: Int,
      val densityDpi: Int,
      val rotation: Int,
  )
}
