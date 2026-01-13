package dev.jasonpearson.automobile.accessibilityservice

import android.content.Context
import android.graphics.PixelFormat
import android.os.Build
import android.provider.Settings
import android.util.Log
import android.view.Gravity
import android.view.View
import android.view.WindowManager

class OverlayManager(
    private val context: Context,
    private val windowManager: WindowManager =
        context.getSystemService(Context.WINDOW_SERVICE) as WindowManager,
    private val canDrawOverlays: (Context) -> Boolean = {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
        Settings.canDrawOverlays(it)
      } else {
        true
      }
    },
    private val viewFactory: (Context) -> View = { HighlightOverlayView(it) },
) {

  companion object {
    private const val TAG = "OverlayManager"
  }

  private var overlayView: View? = null
  private var overlayAdded = false
  private var overlayVisible = false
  private var overlayLayoutParams: WindowManager.LayoutParams? = null

  fun show(): Boolean {
    val view = overlayView ?: viewFactory(context).also { overlayView = it }

    if (!overlayAdded) {
      val layoutParams = overlayLayoutParams ?: createLayoutParams().also { overlayLayoutParams = it }
      try {
        windowManager.addView(view, layoutParams)
        overlayAdded = true
      } catch (e: Exception) {
        Log.e(TAG, "Failed to add overlay view", e)
        return false
      }
    }

    view.visibility = View.VISIBLE
    overlayVisible = true
    return true
  }

  fun hide() {
    overlayView?.let { view ->
      view.visibility = View.GONE
      overlayVisible = false
    }
  }

  fun destroy() {
    val view = overlayView ?: return
    if (overlayAdded) {
      try {
        windowManager.removeViewImmediate(view)
      } catch (e: Exception) {
        Log.e(TAG, "Failed to remove overlay view", e)
      }
    }

    overlayView = null
    overlayAdded = false
    overlayVisible = false
    overlayLayoutParams = null
  }

  internal fun getOverlayViewForTest(): View? = overlayView

  internal fun isOverlayAddedForTest(): Boolean = overlayAdded

  internal fun isOverlayVisibleForTest(): Boolean = overlayVisible

  private fun createLayoutParams(): WindowManager.LayoutParams {
    val overlayType = resolveOverlayType()
    return WindowManager.LayoutParams(
        WindowManager.LayoutParams.MATCH_PARENT,
        WindowManager.LayoutParams.MATCH_PARENT,
        overlayType,
        WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
            WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE or
            WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN or
            WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS,
        PixelFormat.TRANSLUCENT,
    )
        .apply {
          gravity = Gravity.TOP or Gravity.START
          x = 0
          y = 0
          title = "AutoMobile Overlay"
        }
  }

  private fun resolveOverlayType(): Int {
    return if (canDrawOverlays(context)) {
      WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
    } else {
      Log.w(TAG, "SYSTEM_ALERT_WINDOW not granted; using accessibility overlay.")
      WindowManager.LayoutParams.TYPE_ACCESSIBILITY_OVERLAY
    }
  }
}
