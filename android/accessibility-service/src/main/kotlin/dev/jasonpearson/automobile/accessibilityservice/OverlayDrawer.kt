package dev.jasonpearson.automobile.accessibilityservice

import android.graphics.Canvas
import android.graphics.Color
import android.graphics.DashPathEffect
import android.graphics.Paint
import android.graphics.Path
import android.graphics.PathMeasure
import android.graphics.PointF
import android.graphics.RectF
import android.util.Log
import dev.jasonpearson.automobile.accessibilityservice.models.HighlightBounds
import dev.jasonpearson.automobile.accessibilityservice.models.HighlightLineCap
import dev.jasonpearson.automobile.accessibilityservice.models.HighlightLineJoin
import dev.jasonpearson.automobile.accessibilityservice.models.HighlightPoint
import dev.jasonpearson.automobile.accessibilityservice.models.HighlightShape
import dev.jasonpearson.automobile.accessibilityservice.models.HighlightStyle
import dev.jasonpearson.automobile.accessibilityservice.models.ScreenDimensions
import dev.jasonpearson.automobile.accessibilityservice.models.SmoothingAlgorithm
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt
import kotlin.math.sqrt

data class HighlightOperationResult(
    val success: Boolean,
    val error: String? = null,
)

class OverlayDrawer(
    private var overlayManager: OverlayManager? = null,
    private val screenDimensionsProvider: (() -> ScreenDimensions?)? = null,
    private val systemInsetsProvider: (() -> Int)? = null,
    private val colorParser: (String) -> Int = { Color.parseColor(it) },
) {

    companion object {
        private const val TAG = "OverlayDrawer"
        private const val DEFAULT_STROKE_COLOR = "#FF0000"
        private const val DEFAULT_STROKE_WIDTH = 4f
        private const val DEFAULT_PATH_STROKE_WIDTH = 8f
        private const val DEFAULT_PATH_TENSION = 0.5f
        private const val PATH_MIN_SAMPLE_DISTANCE = 3f
        private const val PATH_MAX_SEGMENTS = 240f
        private const val PATH_TAPER_FRACTION = 0.12f
        private const val PATH_MIN_WIDTH_FACTOR = 0.35f
        private const val PATH_CURVE_TAPER_INTENSITY = 0.35f
    }

    private val lock = Any()
    private val highlights = LinkedHashMap<String, HighlightRenderState>()
    private var overlayView: HighlightOverlayView? = null
    private val pathSmoother = PathSmoother()
    private val animator =
        HighlightAnimator(
            onAlphaUpdate = { id, alpha -> updateHighlightAlpha(id, alpha) },
            onDrawProgressUpdate = { id, progress -> updateHighlightDrawProgress(id, progress) },
            onAnimationComplete = { id ->
              removeHighlightInternal(id, cancelAnimation = false)
            },
            onAnimationActiveChanged = { active -> overlayView?.setAnimationActive(active) },
        )

    fun attachOverlayManager(manager: OverlayManager) {
        overlayManager = manager
    }

    internal fun attachView(view: HighlightOverlayView) {
        overlayView = view
        view.setAnimationActive(animator.isAnimating())
    }

    fun addHighlight(id: String?, shape: HighlightShape?): HighlightOperationResult {
        if (id.isNullOrBlank()) {
            return HighlightOperationResult(false, "Missing highlight id")
        }
        if (shape == null) {
            return HighlightOperationResult(false, "Missing highlight shape")
        }

        val renderResult = buildRenderState(shape)
        val renderState = renderResult.state
        if (renderState == null) {
            return HighlightOperationResult(
                false,
                renderResult.error ?: "Invalid highlight shape",
            )
        }

        val overlayError = ensureOverlayVisible()
        if (overlayError != null) {
            return HighlightOperationResult(false, overlayError)
        }

        animator.cancel(id)
        synchronized(lock) { highlights[id] = renderState }
        animator.startFadeOut(id)
        overlayView?.invalidate()
        return HighlightOperationResult(true, null)
    }

    fun destroy() {
        animator.cancelAll()
        synchronized(lock) {
            highlights.clear()
            overlayManager?.hide()
        }
        overlayView = null
        overlayManager = null
    }

    private fun removeHighlightInternal(id: String, cancelAnimation: Boolean) {
        if (cancelAnimation) {
            animator.cancel(id)
        }

        synchronized(lock) {
            highlights.remove(id)
            if (highlights.isEmpty()) {
                overlayManager?.hide()
            }
        }

        overlayView?.invalidate()
    }

    internal fun draw(canvas: Canvas) {
        val snapshot = synchronized(lock) { highlights.values.toList() }
        snapshot.forEach { renderState ->
            when (renderState.shapeType) {
                ShapeType.BOX -> drawBox(canvas, renderState)
                ShapeType.CIRCLE -> drawCircle(canvas, renderState)
                ShapeType.PATH -> drawPath(canvas, renderState)
            }
        }
    }

    private fun drawBox(canvas: Canvas, renderState: HighlightRenderState) {
        val rect = renderState.rect ?: return
        renderState.strokePaint?.let {
            applyStrokeAlpha(renderState, it)
            canvas.drawRect(rect, it)
        }
    }

    private fun drawCircle(canvas: Canvas, renderState: HighlightRenderState) {
        val rect = renderState.rect ?: return
        renderState.strokePaint?.let { paint ->
            applyStrokeAlpha(renderState, paint)

            // Hand-drawn effect: leave a small gap (10 degrees) and draw with progress
            val maxSweepAngle = 350f // 360 - 10 degrees gap
            val sweepAngle = maxSweepAngle * renderState.drawProgress

            // Start angle slightly offset for variation (-90 degrees = top of circle)
            val startAngle = -90f + 5f // Start slightly offset from top

            if (sweepAngle > 0f) {
                canvas.drawArc(rect, startAngle, sweepAngle, false, paint)
            }
        }
    }

    private fun drawPath(canvas: Canvas, renderState: HighlightRenderState) {
        val strokePaint = renderState.strokePaint ?: return
        applyStrokeAlpha(renderState, strokePaint)
        val segments = renderState.pathSegments
        if (segments.isNullOrEmpty()) {
            renderState.path?.let { canvas.drawPath(it, strokePaint) }
            return
        }

        val originalWidth = strokePaint.strokeWidth
        segments.forEach { segment ->
            strokePaint.strokeWidth = segment.strokeWidth
            canvas.drawLine(segment.startX, segment.startY, segment.endX, segment.endY, strokePaint)
        }
        strokePaint.strokeWidth = originalWidth
    }

    private fun updateHighlightAlpha(id: String, alpha: Float) {
        val clamped = alpha.coerceIn(0f, 1f)
        synchronized(lock) { highlights[id]?.alpha = clamped }
        overlayView?.invalidate()
    }

    private fun updateHighlightDrawProgress(id: String, progress: Float) {
        val clamped = progress.coerceIn(0f, 1f)
        synchronized(lock) { highlights[id]?.drawProgress = clamped }
        overlayView?.invalidate()
    }

    private fun applyStrokeAlpha(renderState: HighlightRenderState, paint: Paint) {
        val targetAlpha =
            (renderState.baseAlpha * renderState.alpha).roundToInt().coerceIn(0, 255)
        if (paint.alpha != targetAlpha) {
            paint.alpha = targetAlpha
        }
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
                "path" -> ShapeType.PATH
                else ->
                    return HighlightRenderResult(
                        error = "Unsupported highlight shape: ${shape.type}"
                    )
            }

        val paintResult = resolvePaints(shape.style, shapeType)
        if (paintResult.error != null) {
            return HighlightRenderResult(error = paintResult.error)
        }

        return when (shapeType) {
            ShapeType.BOX,
            ShapeType.CIRCLE -> buildRectRenderState(shape, shapeType, paintResult)
            ShapeType.PATH -> buildPathRenderState(shape, paintResult)
        }
    }

    private fun buildRectRenderState(
        shape: HighlightShape,
        shapeType: ShapeType,
        paintResult: HighlightPaintResult,
    ): HighlightRenderResult {
        val bounds = shape.bounds ?: return HighlightRenderResult(error = "Missing highlight bounds")
        if (!bounds.hasValidSize()) {
            return HighlightRenderResult(
                error = "Highlight bounds must have positive width and height"
            )
        }

        val rectResult = resolveRect(bounds)
        val rect = rectResult.rect
        if (rect == null) {
            return HighlightRenderResult(error = rectResult.error ?: "Invalid highlight bounds")
        }

        val baseAlpha = paintResult.strokePaint?.alpha ?: 255
        return HighlightRenderResult(
            state =
                HighlightRenderState(
                    shape = shape,
                    rect = rect,
                    path = null,
                    pathSegments = null,
                    shapeType = shapeType,
                    strokePaint = paintResult.strokePaint,
                    baseAlpha = baseAlpha,
                    alpha = 0f,
                    drawProgress = 0f,
                )
        )
    }

    private fun buildPathRenderState(
        shape: HighlightShape,
        paintResult: HighlightPaintResult,
    ): HighlightRenderResult {
        val points = shape.points ?: return HighlightRenderResult(error = "Path highlight requires points")
        if (points.size < 2) {
            return HighlightRenderResult(error = "Path highlight requires at least 2 points")
        }

        val scaleResult = shape.bounds?.let { resolveScale(it) } ?: HighlightScaleResult()
        if (scaleResult.error != null) {
            return HighlightRenderResult(error = scaleResult.error)
        }
        val scaleX = scaleResult.scaleX ?: 1f
        val scaleY = scaleResult.scaleY ?: 1f
        val yOffset = systemInsetsProvider?.invoke() ?: 0
        val pathPoints = points.toPointFList(scaleX, scaleY, yOffset)
        if (pathPoints.any { !it.x.isFinite() || !it.y.isFinite() }) {
            return HighlightRenderResult(error = "Path points must be finite numbers")
        }

        val tension = shape.style?.tension ?: DEFAULT_PATH_TENSION
        if (tension < 0f || tension > 1f) {
            return HighlightRenderResult(error = "tension must be between 0.0 and 1.0")
        }

        val algorithm = shape.style?.smoothing ?: SmoothingAlgorithm.CATMULL_ROM
        val path = pathSmoother.smoothPath(pathPoints, algorithm, tension)
        val baseStrokeWidth = paintResult.strokePaint?.strokeWidth ?: DEFAULT_PATH_STROKE_WIDTH
        val pathSegments = buildPathSegments(path, baseStrokeWidth)

        val baseAlpha = paintResult.strokePaint?.alpha ?: 255
        return HighlightRenderResult(
            state =
                HighlightRenderState(
                    shape = shape,
                    rect = null,
                    path = path,
                    pathSegments = pathSegments,
                    shapeType = ShapeType.PATH,
                    strokePaint = paintResult.strokePaint,
                    baseAlpha = baseAlpha,
                    alpha = 0f,
                    drawProgress = 0f,
                )
        )
    }

    private fun resolvePaints(
        style: HighlightStyle?,
        shapeType: ShapeType,
    ): HighlightPaintResult {
        val effectiveStyle = style?.takeUnless { isStyleEmpty(it) }
        val strokeWidth = effectiveStyle?.strokeWidth ?: defaultStrokeWidth(shapeType)
        if (strokeWidth <= 0f) {
            return HighlightPaintResult(error = "strokeWidth must be greater than 0")
        }

        val strokeColor = effectiveStyle?.strokeColor ?: DEFAULT_STROKE_COLOR
        val parsedStrokeColor =
            parseColor(strokeColor)
                ?: return HighlightPaintResult(error = "Invalid strokeColor: $strokeColor")

        val paint =
            Paint(Paint.ANTI_ALIAS_FLAG).apply {
                color = parsedStrokeColor
                this.style = Paint.Style.STROKE
                this.strokeWidth = strokeWidth
                strokeCap = resolveStrokeCap(effectiveStyle, shapeType)
                strokeJoin = resolveStrokeJoin(effectiveStyle, shapeType)
            }

        val dashPattern = effectiveStyle?.dashPattern
        if (dashPattern != null) {
            if (dashPattern.isEmpty() || dashPattern.any { it <= 0f }) {
                return HighlightPaintResult(
                    error = "dashPattern must contain positive values"
                )
            }
            paint.pathEffect = DashPathEffect(dashPattern.toFloatArray(), 0f)
        }

        return HighlightPaintResult(strokePaint = paint)
    }

    private fun isStyleEmpty(style: HighlightStyle): Boolean {
        return style.strokeColor == null &&
            style.strokeWidth == null &&
            style.dashPattern == null &&
            style.smoothing == null &&
            style.tension == null &&
            style.capStyle == null &&
            style.joinStyle == null
    }

    private fun defaultStrokeWidth(shapeType: ShapeType): Float {
        return if (shapeType == ShapeType.PATH) {
            DEFAULT_PATH_STROKE_WIDTH
        } else {
            DEFAULT_STROKE_WIDTH
        }
    }

    private fun resolveStrokeCap(style: HighlightStyle?, shapeType: ShapeType): Paint.Cap {
        val fallback = if (shapeType == ShapeType.PATH) Paint.Cap.ROUND else Paint.Cap.BUTT
        return when (style?.capStyle) {
            HighlightLineCap.BUTT -> Paint.Cap.BUTT
            HighlightLineCap.ROUND -> Paint.Cap.ROUND
            HighlightLineCap.SQUARE -> Paint.Cap.SQUARE
            null -> fallback
        }
    }

    private fun resolveStrokeJoin(style: HighlightStyle?, shapeType: ShapeType): Paint.Join {
        val fallback = if (shapeType == ShapeType.PATH) Paint.Join.ROUND else Paint.Join.MITER
        return when (style?.joinStyle) {
            HighlightLineJoin.BEVEL -> Paint.Join.BEVEL
            HighlightLineJoin.MITER -> Paint.Join.MITER
            HighlightLineJoin.ROUND -> Paint.Join.ROUND
            null -> fallback
        }
    }

    private fun buildPathSegments(path: Path, baseStrokeWidth: Float): List<PathSegment> {
        val measure = PathMeasure(path, false)
        val length = measure.length
        if (length <= 0f) {
            return emptyList()
        }

        val step = max(PATH_MIN_SAMPLE_DISTANCE, length / PATH_MAX_SEGMENTS)
        val segments = ArrayList<PathSegment>()

        val prevPos = FloatArray(2)
        val prevTan = FloatArray(2)
        measure.getPosTan(0f, prevPos, prevTan)
        var lastX = prevPos[0]
        var lastY = prevPos[1]
        var lastTanX = prevTan[0]
        var lastTanY = prevTan[1]
        var lastDistance = 0f
        var distance = step

        while (distance < length) {
            val pos = FloatArray(2)
            val tan = FloatArray(2)
            measure.getPosTan(distance, pos, tan)
            val midProgress = ((lastDistance + distance) / 2f / length).coerceIn(0f, 1f)
            val widthFactor = resolveWidthFactor(midProgress, lastTanX, lastTanY, tan[0], tan[1])
            segments.add(
                PathSegment(
                    startX = lastX,
                    startY = lastY,
                    endX = pos[0],
                    endY = pos[1],
                    strokeWidth = baseStrokeWidth * widthFactor,
                )
            )

            lastX = pos[0]
            lastY = pos[1]
            lastTanX = tan[0]
            lastTanY = tan[1]
            lastDistance = distance
            distance += step
        }

        val endPos = FloatArray(2)
        val endTan = FloatArray(2)
        measure.getPosTan(length, endPos, endTan)
        val endProgress = ((lastDistance + length) / 2f / length).coerceIn(0f, 1f)
        val endWidthFactor = resolveWidthFactor(endProgress, lastTanX, lastTanY, endTan[0], endTan[1])
        segments.add(
            PathSegment(
                startX = lastX,
                startY = lastY,
                endX = endPos[0],
                endY = endPos[1],
                strokeWidth = baseStrokeWidth * endWidthFactor,
            )
        )

        return segments
    }

    private fun resolveWidthFactor(
        progress: Float,
        previousTanX: Float,
        previousTanY: Float,
        tanX: Float,
        tanY: Float,
    ): Float {
        val taperFactor = resolveTaperFactor(progress)
        val curveFactor = resolveCurveFactor(previousTanX, previousTanY, tanX, tanY)
        return max(PATH_MIN_WIDTH_FACTOR, taperFactor * curveFactor)
    }

    private fun resolveTaperFactor(progress: Float): Float {
        if (PATH_TAPER_FRACTION <= 0f) {
            return 1f
        }
        val start = min(1f, progress / PATH_TAPER_FRACTION)
        val end = min(1f, (1f - progress) / PATH_TAPER_FRACTION)
        val taper = min(start, end)
        return taper * taper * (3f - 2f * taper)
    }

    private fun resolveCurveFactor(
        previousTanX: Float,
        previousTanY: Float,
        tanX: Float,
        tanY: Float,
    ): Float {
        val previousMagnitude = sqrt(previousTanX * previousTanX + previousTanY * previousTanY)
        val currentMagnitude = sqrt(tanX * tanX + tanY * tanY)
        if (previousMagnitude == 0f || currentMagnitude == 0f) {
            return 1f
        }

        val normalizedPrevX = previousTanX / previousMagnitude
        val normalizedPrevY = previousTanY / previousMagnitude
        val normalizedX = tanX / currentMagnitude
        val normalizedY = tanY / currentMagnitude
        val dot = (normalizedPrevX * normalizedX + normalizedPrevY * normalizedY)
            .coerceIn(-1f, 1f)
        val curvature = (1f - dot) / 2f
        val adjustment = min(1f, curvature) * PATH_CURVE_TAPER_INTENSITY
        return 1f - adjustment
    }

    private fun parseColor(color: String): Int? {
        return try {
            colorParser(color)
        } catch (e: IllegalArgumentException) {
            Log.w(TAG, "Failed to parse color: $color", e)
            null
        }
    }

    private data class HighlightRenderState(
        val shape: HighlightShape,
        val rect: RectF?,
        val path: Path?,
        val pathSegments: List<PathSegment>?,
        val shapeType: ShapeType,
        val strokePaint: Paint?,
        val baseAlpha: Int,
        var alpha: Float,
        var drawProgress: Float = 0f,
    )

    private data class HighlightPaintResult(
        val strokePaint: Paint? = null,
        val error: String? = null,
    )

    private data class PathSegment(
        val startX: Float,
        val startY: Float,
        val endX: Float,
        val endY: Float,
        val strokeWidth: Float,
    )

    private fun resolveRect(bounds: HighlightBounds): HighlightRectResult {
        val scale = resolveScale(bounds)
        if (scale.error != null) {
            return HighlightRectResult(error = scale.error)
        }
        val scaleX = scale.scaleX ?: 1f
        val scaleY = scale.scaleY ?: 1f
        val yOffset = systemInsetsProvider?.invoke() ?: 0
        return HighlightRectResult(rect = bounds.toRectF(scaleX, scaleY, yOffset))
    }

    private fun List<HighlightPoint>.toPointFList(scaleX: Float, scaleY: Float, yOffset: Int = 0): List<PointF> {
        return map { point -> PointF(point.x * scaleX, (point.y - yOffset) * scaleY) }
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
        PATH,
    }
}
