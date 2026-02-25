package dev.jasonpearson.automobile.ctrlproxy

import android.content.Context
import android.graphics.Canvas
import android.util.Log
import android.view.View
import android.widget.FrameLayout

internal class HighlightOverlayView(
    context: Context,
    private val drawer: OverlayDrawer? = null,
) : FrameLayout(context) {
  companion object {
    private const val TAG = "HighlightOverlayView"
  }

  init {
    isClickable = false
    isFocusable = false
    importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_NO
    setWillNotDraw(false)
    drawer?.attachView(this)
  }

  override fun onLayout(changed: Boolean, left: Int, top: Int, right: Int, bottom: Int) {
    super.onLayout(changed, left, top, right, bottom)
    if (changed) {
      Log.d(
          TAG,
          "Overlay layout changed: left=$left, top=$top, right=$right, bottom=$bottom, width=$width, height=$height",
      )
    }
  }

  override fun onDraw(canvas: Canvas) {
    super.onDraw(canvas)
    drawer?.draw(canvas)
  }

  fun setAnimationActive(active: Boolean) {
    val targetLayerType = if (active) View.LAYER_TYPE_HARDWARE else View.LAYER_TYPE_NONE
    if (layerType != targetLayerType) {
      setLayerType(targetLayerType, null)
    }
  }
}
