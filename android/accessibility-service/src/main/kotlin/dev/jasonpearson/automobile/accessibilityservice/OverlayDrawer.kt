package dev.jasonpearson.automobile.accessibilityservice

import android.graphics.Canvas
import android.graphics.Color
import android.graphics.DashPathEffect
import android.graphics.Paint
import android.graphics.RectF
import android.util.Log
import android.view.View
import dev.jasonpearson.automobile.accessibilityservice.models.HighlightBounds
import dev.jasonpearson.automobile.accessibilityservice.models.HighlightEntry
import dev.jasonpearson.automobile.accessibilityservice.models.HighlightShape
import dev.jasonpearson.automobile.accessibilityservice.models.ScreenDimensions

data class HighlightOperationResult(
    val success: Boolean,
    val error: String? = null,
    val highlights: List<HighlightEntry>? = null,
)

class OverlayDrawer(
    private var overlayManager: OverlayManager? = null,
    private val screenDimensionsProvider: (() -> ScreenDimensions?)? = null,
    private val colorParser: (String) -> Int = { Color.parseColor(it) },
) {

    companion object {
        private const val TAG = "OverlayDrawer"
        private const val DEFAULT_STROKE_COLOR = "#FF0000"
        private const val DEFAULT_STROKE_WIDTH = 4f
    }

    private val lock = Any()
    private val highlights = LinkedHashMap<String, HighlightRenderState>()
    private var overlayView: View? = null

    fun attachOverlayManager(manager: OverlayManager) {
        overlayManager = manager
    }

    fun attachView(view: View) {
        overlayView = view
    }

    fun addHighlight(id: String?, shape: HighlightShape?): HighlightOperationResult {
        if (id.isNullOrBlank()) {
            return HighlightOperationResult(false, "Missing highlight id", snapshotHighlights())
        }
        if (shape == null) {
            return HighlightOperationResult(false, "Missing highlight shape", snapshotHighlights())
        }

        val renderResult = buildRenderState(shape)
        val renderState = renderResult.state
        if (renderState == null) {
            return HighlightOperationResult(
                false,
                renderResult.error ?: "Invalid highlight shape",
                snapshotHighlights(),
            )
        }

        val overlayError = ensureOverlayVisible()
        if (overlayError != null) {
            return HighlightOperationResult(false, overlayError, snapshotHighlights())
        }

        synchronized(lock) { highlights[id] = renderState }
        overlayView?.invalidate()
        return HighlightOperationResult(true, null, snapshotHighlights())
    }

    fun removeHighlight(id: String?): HighlightOperationResult {
        if (id.isNullOrBlank()) {
            return HighlightOperationResult(false, "Missing highlight id", snapshotHighlights())
        }

        val snapshot =
            synchronized(lock) {
                highlights.remove(id)
                if (highlights.isEmpty()) {
                    overlayManager?.hide()
                }
                highlights.map { (storedId, renderState) ->
                    HighlightEntry(id = storedId, shape = renderState.shape)
                }
            }

        overlayView?.invalidate()
        return HighlightOperationResult(true, null, snapshot)
    }

    fun clearHighlights(): HighlightOperationResult {
        synchronized(lock) {
            highlights.clear()
            overlayManager?.hide()
        }
        overlayView?.invalidate()
        return HighlightOperationResult(true, null, emptyList())
    }

    fun listHighlights(): List<HighlightEntry> {
        return snapshotHighlights()
    }

    fun destroy() {
        synchronized(lock) {
            highlights.clear()
            overlayManager?.hide()
        }
        overlayView = null
        overlayManager = null
    }

    internal fun draw(canvas: Canvas) {
        val snapshot = synchronized(lock) { highlights.values.toList() }
        snapshot.forEach { renderState ->
            when (renderState.shapeType) {
                ShapeType.BOX -> drawBox(canvas, renderState)
                ShapeType.CIRCLE -> drawCircle(canvas, renderState)
            }
        }
    }

    private fun drawBox(canvas: Canvas, renderState: HighlightRenderState) {
        renderState.fillPaint?.let { canvas.drawRect(renderState.rect, it) }
        renderState.strokePaint?.let { canvas.drawRect(renderState.rect, it) }
    }

    private fun drawCircle(canvas: Canvas, renderState: HighlightRenderState) {
        renderState.fillPaint?.let { canvas.drawOval(renderState.rect, it) }
        renderState.strokePaint?.let { canvas.drawOval(renderState.rect, it) }
    }

    private fun ensureOverlayVisible(): String? {
        val manager = overlayManager ?: return "Overlay not initialized"
        if (!manager.show()) {
            return "Overlay not available"
        }
        if (overlayView == null) {
            Log.w(TAG, "Overlay view missing after show()")
            return "Overlay view unavailable"
        }
        return null
    }

    private fun buildRenderState(shape: HighlightShape): HighlightRenderResult {
        val shapeType =
            when (shape.type) {
                "box" -> ShapeType.BOX
                "circle" -> ShapeType.CIRCLE
                else ->
                    return HighlightRenderResult(
                        error = "Unsupported highlight shape: ${shape.type}"
                    )
            }

        if (!shape.bounds.hasValidSize()) {
            return HighlightRenderResult(
                error = "Highlight bounds must have positive width and height"
            )
        }

        val rectResult = resolveRect(shape.bounds)
        val rect = rectResult.rect
        if (rect == null) {
            return HighlightRenderResult(error = rectResult.error ?: "Invalid highlight bounds")
        }
        // Treat empty style (all fields null) as equivalent to null style
        val effectiveStyle =
            shape.style?.takeIf {
                it.strokeColor != null ||
                    it.strokeWidth != null ||
                    it.fillColor != null ||
                    it.dashPattern != null
            }
        val hasStroke =
            effectiveStyle == null ||
                effectiveStyle.strokeColor != null ||
                effectiveStyle.strokeWidth != null
        val fillColor = effectiveStyle?.fillColor
        val dashPattern = effectiveStyle?.dashPattern

        if (!hasStroke && fillColor == null) {
            return HighlightRenderResult(error = "Highlight style must include stroke or fill")
        }

        val strokePaint =
            if (hasStroke) {
                val strokeWidth = effectiveStyle?.strokeWidth ?: DEFAULT_STROKE_WIDTH
                if (strokeWidth <= 0f) {
                    return HighlightRenderResult(error = "strokeWidth must be greater than 0")
                }

                val strokeColor = effectiveStyle?.strokeColor ?: DEFAULT_STROKE_COLOR
                val parsedStrokeColor =
                    parseColor(strokeColor)
                        ?: return HighlightRenderResult(error = "Invalid strokeColor: $strokeColor")

                val paint =
                    Paint(Paint.ANTI_ALIAS_FLAG).apply {
                        color = parsedStrokeColor
                        this.style = Paint.Style.STROKE
                        this.strokeWidth = strokeWidth
                    }

                if (dashPattern != null) {
                    if (dashPattern.isEmpty() || dashPattern.any { it <= 0f }) {
                        return HighlightRenderResult(
                            error = "dashPattern must contain positive values"
                        )
                    }
                    paint.pathEffect = DashPathEffect(dashPattern.toFloatArray(), 0f)
                }

                paint
            } else {
                null
            }

        val fillPaint =
            if (fillColor != null) {
                val parsedFillColor =
                    parseColor(fillColor)
                        ?: return HighlightRenderResult(error = "Invalid fillColor: $fillColor")
                Paint(Paint.ANTI_ALIAS_FLAG).apply {
                    color = parsedFillColor
                    this.style = Paint.Style.FILL
                }
            } else {
                null
            }

        return HighlightRenderResult(
            state =
                HighlightRenderState(
                    shape = shape,
                    rect = rect,
                    shapeType = shapeType,
                    strokePaint = strokePaint,
                    fillPaint = fillPaint,
                )
        )
    }

    private fun parseColor(color: String): Int? {
        return try {
            colorParser(color)
        } catch (e: IllegalArgumentException) {
            Log.w(TAG, "Failed to parse color: $color", e)
            null
        }
    }

    private fun snapshotHighlights(): List<HighlightEntry> {
        return synchronized(lock) {
            highlights.map { (id, renderState) ->
                HighlightEntry(id = id, shape = renderState.shape)
            }
        }
    }

    private data class HighlightRenderState(
        val shape: HighlightShape,
        val rect: RectF,
        val shapeType: ShapeType,
        val strokePaint: Paint?,
        val fillPaint: Paint?,
    )

    private fun resolveRect(bounds: HighlightBounds): HighlightRectResult {
        val scale = resolveScale(bounds)
        if (scale.error != null) {
            return HighlightRectResult(error = scale.error)
        }
        val scaleX = scale.scaleX ?: 1f
        val scaleY = scale.scaleY ?: 1f
        return HighlightRectResult(rect = bounds.toRectF(scaleX, scaleY))
    }

    private fun resolveScale(bounds: HighlightBounds): HighlightScaleResult {
        val sourceWidth = bounds.sourceWidth
        val sourceHeight = bounds.sourceHeight

        if (sourceWidth == null && sourceHeight == null) {
            return HighlightScaleResult()
        }

        if (sourceWidth == null || sourceHeight == null) {
            Log.w(TAG, "Highlight bounds missing sourceWidth/sourceHeight; ignoring scaling.")
            return HighlightScaleResult()
        }

        if (sourceWidth <= 0 || sourceHeight <= 0) {
            return HighlightScaleResult(
                error = "sourceWidth and sourceHeight must be greater than 0"
            )
        }

        val targetDimensions = resolveTargetDimensions()
        if (targetDimensions == null || !targetDimensions.isValid()) {
            Log.w(TAG, "Unable to resolve target dimensions; ignoring scaling.")
            return HighlightScaleResult()
        }

        return HighlightScaleResult(
            scaleX = targetDimensions.width.toFloat() / sourceWidth.toFloat(),
            scaleY = targetDimensions.height.toFloat() / sourceHeight.toFloat(),
        )
    }

    private fun resolveTargetDimensions(): ScreenDimensions? {
        val view = overlayView
        if (view != null && view.width > 0 && view.height > 0) {
            return ScreenDimensions(view.width, view.height)
        }
        return screenDimensionsProvider?.invoke()
    }

    private data class HighlightRectResult(val rect: RectF? = null, val error: String? = null)

    private data class HighlightScaleResult(
        val scaleX: Float? = null,
        val scaleY: Float? = null,
        val error: String? = null,
    )

    private data class HighlightRenderResult(
        val state: HighlightRenderState? = null,
        val error: String? = null,
    )

    private enum class ShapeType {
        BOX,
        CIRCLE,
    }
}
