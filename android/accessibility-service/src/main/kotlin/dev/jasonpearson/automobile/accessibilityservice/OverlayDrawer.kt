package dev.jasonpearson.automobile.accessibilityservice

import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.DashPathEffect
import android.graphics.Paint
import android.graphics.PathEffect
import android.graphics.Rect
import android.graphics.RectF
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import android.view.View
import android.view.WindowManager
import kotlin.math.ceil
import kotlin.math.floor
import kotlin.math.max
import kotlin.math.min

enum class ShapeType {
  BOX,
  CIRCLE,
}

data class HighlightShape(
    val type: ShapeType,
    val bounds: RectF,
    val style: HighlightStyle = HighlightStyle(),
)

/** Style values are in dp so they remain consistent across densities. */
data class HighlightStyle(
    val strokeColor: Int = Color.RED,
    val strokeWidthDp: Float = 8f,
    val fillColor: Int? = null,
    val dashPattern: FloatArray? = null,
)

class OverlayDrawer(
    context: Context,
    windowManager: WindowManager? = null,
    canDrawOverlays: (Context) -> Boolean = { Settings.canDrawOverlays(it) },
    private val mainHandler: Handler = Handler(Looper.getMainLooper()),
) {

  private val view: HighlightOverlayView
  private val manager: OverlayManager

  init {
    view = HighlightOverlayView(context)
    val resolvedWindowManager =
        windowManager ?: context.getSystemService(Context.WINDOW_SERVICE) as WindowManager
    manager =
        OverlayManager(
            context,
            windowManager = resolvedWindowManager,
            canDrawOverlays = canDrawOverlays,
            viewFactory = { view },
        )
  }

  fun addHighlight(id: String, shape: HighlightShape) {
    runOnMain {
      view.setHighlight(id, shape)
      manager.show()
    }
  }

  fun removeHighlight(id: String) {
    runOnMain {
      view.removeHighlight(id)
      if (!view.hasHighlights()) {
        manager.hide()
      }
    }
  }

  fun clearAll() {
    runOnMain {
      view.clearHighlights()
      manager.hide()
    }
  }

  fun updateHighlight(id: String, shape: HighlightShape) {
    runOnMain {
      view.setHighlight(id, shape)
      manager.show()
    }
  }

  internal fun getHighlightViewForTest(): HighlightOverlayView = view

  private fun runOnMain(action: () -> Unit) {
    if (Looper.myLooper() == Looper.getMainLooper()) {
      action()
    } else {
      mainHandler.post { action() }
    }
  }
}

internal class HighlightOverlayView(context: Context) : View(context) {

  private data class ResolvedHighlight(
      val shape: HighlightShape,
      val drawBounds: RectF,
      val strokeWidthPx: Float,
      val pathEffect: PathEffect?,
  )

  private val highlights = LinkedHashMap<String, ResolvedHighlight>()
  private val strokePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE }
  private val fillPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.FILL }

  init {
    isClickable = false
    isFocusable = false
    importantForAccessibility = IMPORTANT_FOR_ACCESSIBILITY_NO
    setWillNotDraw(false)
  }

  fun setHighlight(id: String, shape: HighlightShape) {
    val resolved = resolveHighlight(shape)
    val previous = highlights.put(id, resolved)
    invalidateDirtyRect(previous, resolved)
  }

  fun removeHighlight(id: String) {
    val removed = highlights.remove(id) ?: return
    invalidateDirtyRect(removed, null)
  }

  fun clearHighlights() {
    if (highlights.isEmpty()) return
    val dirtyRect = unionHighlightsRect(highlights.values)
    highlights.clear()
    dirtyRect?.let { postInvalidateOnAnimation(it.left, it.top, it.right, it.bottom) }
  }

  fun hasHighlights(): Boolean = highlights.isNotEmpty()

  internal fun getHighlightForTest(id: String): HighlightShape? = highlights[id]?.shape

  override fun onDraw(canvas: Canvas) {
    super.onDraw(canvas)
    for (highlight in highlights.values) {
      drawHighlight(canvas, highlight)
    }
  }

  private fun drawHighlight(canvas: Canvas, highlight: ResolvedHighlight) {
    val bounds = highlight.drawBounds
    val style = highlight.shape.style

    style.fillColor?.let { color ->
      fillPaint.color = color
      drawShape(canvas, highlight.shape.type, bounds, fillPaint)
    }

    strokePaint.color = style.strokeColor
    strokePaint.strokeWidth = highlight.strokeWidthPx
    strokePaint.pathEffect = highlight.pathEffect
    drawShape(canvas, highlight.shape.type, bounds, strokePaint)
  }

  private fun drawShape(canvas: Canvas, type: ShapeType, bounds: RectF, paint: Paint) {
    when (type) {
      ShapeType.BOX -> canvas.drawRect(bounds, paint)
      ShapeType.CIRCLE -> {
        val radius = bounds.width() / 2f
        canvas.drawCircle(bounds.centerX(), bounds.centerY(), radius, paint)
      }
    }
  }

  private fun resolveHighlight(shape: HighlightShape): ResolvedHighlight {
    val safeStyle = shape.style.copy(dashPattern = shape.style.dashPattern?.clone())
    val safeShape = shape.copy(bounds = RectF(shape.bounds), style = safeStyle)
    val drawBounds = resolveDrawBounds(safeShape)
    val strokeWidthPx = resolveStrokeWidthPx(safeStyle.strokeWidthDp)
    val dashPatternPx = resolveDashPatternPx(safeStyle.dashPattern)
    val pathEffect = dashPatternPx?.let { DashPathEffect(it, 0f) }
    return ResolvedHighlight(
        shape = safeShape,
        drawBounds = drawBounds,
        strokeWidthPx = strokeWidthPx,
        pathEffect = pathEffect,
    )
  }

  private fun resolveDrawBounds(shape: HighlightShape): RectF {
    val normalized = normalizeBounds(shape.bounds)
    return when (shape.type) {
      ShapeType.BOX -> normalized
      ShapeType.CIRCLE -> {
        val radius = resolveCircleRadius(normalized)
        val centerX = normalized.centerX()
        val centerY = normalized.centerY()
        RectF(centerX - radius, centerY - radius, centerX + radius, centerY + radius)
      }
    }
  }

  private fun invalidateDirtyRect(old: ResolvedHighlight?, new: ResolvedHighlight?) {
    val dirtyRect = combinedDirtyRect(old, new)
    dirtyRect?.let { postInvalidateOnAnimation(it.left, it.top, it.right, it.bottom) }
  }

  private fun combinedDirtyRect(old: ResolvedHighlight?, new: ResolvedHighlight?): Rect? {
    val oldRect = old?.let { calculateDirtyRect(it.drawBounds, it.strokeWidthPx) }
    val newRect = new?.let { calculateDirtyRect(it.drawBounds, it.strokeWidthPx) }
    return unionRect(oldRect, newRect)
  }

  private fun unionHighlightsRect(highlights: Collection<ResolvedHighlight>): Rect? {
    var union: Rect? = null
    for (highlight in highlights) {
      val rect = calculateDirtyRect(highlight.drawBounds, highlight.strokeWidthPx)
      union = unionRect(union, rect)
    }
    return union
  }

  private fun unionRect(first: Rect?, second: Rect?): Rect? {
    return when {
      first == null -> second
      second == null -> first
      else -> Rect(first).apply { union(second) }
    }
  }

  internal fun resolveStrokeWidthPx(strokeWidthDp: Float): Float {
    return max(0f, strokeWidthDp) * resources.displayMetrics.density
  }

  internal fun resolveDashPatternPx(patternDp: FloatArray?): FloatArray? {
    if (patternDp == null || patternDp.size < 2 || patternDp.size % 2 != 0) return null
    val density = resources.displayMetrics.density
    val converted = FloatArray(patternDp.size)
    for (index in patternDp.indices) {
      converted[index] = patternDp[index] * density
    }
    return if (converted.any { it <= 0f }) null else converted
  }

  internal fun resolveCircleRadius(bounds: RectF): Float {
    val normalized = normalizeBounds(bounds)
    return min(normalized.width(), normalized.height()) / 2f
  }

  internal fun calculateDirtyRect(bounds: RectF, strokeWidthPx: Float): Rect {
    val halfStroke = strokeWidthPx / 2f
    val normalized = normalizeBounds(bounds)
    val left = floor(normalized.left - halfStroke).toInt()
    val top = floor(normalized.top - halfStroke).toInt()
    val right = ceil(normalized.right + halfStroke).toInt()
    val bottom = ceil(normalized.bottom + halfStroke).toInt()
    return Rect(left, top, right, bottom)
  }

  private fun normalizeBounds(bounds: RectF): RectF {
    val left = min(bounds.left, bounds.right)
    val right = max(bounds.left, bounds.right)
    val top = min(bounds.top, bounds.bottom)
    val bottom = max(bounds.top, bounds.bottom)
    return RectF(left, top, right, bottom)
  }
}
