@file:OptIn(ExperimentalFoundationApi::class, androidx.compose.ui.ExperimentalComposeUiApi::class)

package dev.jasonpearson.automobile.ide.navigation

import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.ui.input.pointer.PointerEventType
import androidx.compose.ui.input.pointer.onPointerEvent
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.foundation.Image
import androidx.compose.ui.layout.ContentScale
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlin.math.abs
import kotlin.math.min
import androidx.compose.ui.input.pointer.PointerIcon
import androidx.compose.ui.input.pointer.pointerHoverIcon
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.tween
import androidx.compose.animation.core.EaseInOut
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.width
import androidx.compose.ui.graphics.Brush
import org.jetbrains.jewel.foundation.theme.JewelTheme
import org.jetbrains.jewel.ui.component.Text
import org.jetbrains.jewel.ui.component.Tooltip
import androidx.compose.ui.zIndex
import kotlin.math.roundToInt
import kotlinx.coroutines.launch

// Layout constants
private val NODE_WIDTH = 80.dp
private val NODE_HEIGHT = 140.dp

// Computed node positions based on a simple layered layout
private data class NodePosition(
    val screenId: String,
    val x: Float,
    val y: Float,
)


@Composable
fun NavigationCanvasView(
    screens: List<ScreenNode>,
    transitions: List<ScreenTransition>,
    onScreenSelected: (String) -> Unit,
    externalHighlightedScreens: List<String> = emptyList(),  // External highlights (e.g., from test flow)
    currentReplayScreen: String? = null,  // Currently active screen during replay
    onFocusModeChanged: (Boolean) -> Unit = {},  // Called when zoom causes content to extend beyond canvas
    headerHeightPx: Float = 0f,  // Height of header area to check overlap against
    screenshotLoader: NavigationScreenshotLoader? = null,  // Loader for screenshot thumbnails
    fogModeEnabled: Boolean = true,  // Whether fog mode overlay is enabled
    autoFocusEnabled: Boolean = true,  // Whether to auto-center on current device screen
    currentObservedScreen: String? = null,  // Current screen from device observation stream
    onFogModeToggled: (Boolean) -> Unit = {},  // Called when user toggles fog mode
    onAutoFocusToggled: (Boolean) -> Unit = {},  // Called when user toggles auto-focus
    chromeAlpha: Float = 1f,  // Alpha for chrome elements (toggle/zoom controls)
) {
    val density = LocalDensity.current
    val colors = JewelTheme.globalColors

    // Zoom and pan state
    var scale by remember { mutableFloatStateOf(1f) }
    var offsetX by remember { mutableFloatStateOf(0f) }
    var offsetY by remember { mutableFloatStateOf(0f) }

    // Hover state for highlighting
    var hoveredScreenName by remember { mutableStateOf<String?>(null) }
    var hoveredTransitionId by remember { mutableStateOf<String?>(null) }

    // Mouse position for edge hover detection
    var mouseX by remember { mutableFloatStateOf(0f) }
    var mouseY by remember { mutableFloatStateOf(0f) }

    // Track if canvas is hovered - focus mode only activates when canvas is hovered
    var isCanvasHovered by remember { mutableStateOf(false) }

    // Fog mode state - tracks which screen the fog is centered on
    var focusedScreenName by remember { mutableStateOf<String?>(null) }

    // Animated offsets and scale for smooth panning when focus changes
    val animatedOffsetX = remember { Animatable(0f) }
    val animatedOffsetY = remember { Animatable(0f) }
    val animatedScale = remember { Animatable(1f) }
    val animationScope = rememberCoroutineScope()

    // Compute highlighted elements based on hover state OR external highlights
    // Track hovered, source (came from), and target (could go to) screens separately
    data class HighlightState(
        val hoveredScreen: String? = null,
        val sourceScreens: Set<String> = emptySet(),  // Orange - nodes we came from
        val targetScreens: Set<String> = emptySet(),  // Green - nodes we could go to
        val testFlowScreens: Set<String> = emptySet(),  // Blue - screens from test flow
    )

    val highlightState = remember(hoveredScreenName, hoveredTransitionId, transitions, externalHighlightedScreens) {
        when {
            hoveredScreenName != null -> {
                // Hovering a screen: show where we came from (sources) and where we can go (targets)
                val sources = mutableSetOf<String>()
                val targets = mutableSetOf<String>()
                transitions.filter { it.trigger != "back" }.forEach { t ->
                    if (t.fromScreen == hoveredScreenName) targets.add(t.toScreen)
                    if (t.toScreen == hoveredScreenName) sources.add(t.fromScreen)
                }
                HighlightState(
                    hoveredScreen = hoveredScreenName,
                    sourceScreens = sources,
                    targetScreens = targets,
                )
            }
            hoveredTransitionId != null -> {
                // Hovering an edge: source is orange, target is green
                val transition = transitions.find { it.id == hoveredTransitionId }
                if (transition != null) {
                    HighlightState(
                        sourceScreens = setOf(transition.fromScreen),
                        targetScreens = setOf(transition.toScreen),
                    )
                } else HighlightState()
            }
            externalHighlightedScreens.isNotEmpty() -> {
                // External highlights (e.g., from "View in Graph" on test detail)
                HighlightState(
                    testFlowScreens = externalHighlightedScreens.toSet(),
                )
            }
            else -> HighlightState()
        }
    }

    // For backwards compatibility, compute combined highlighted screens
    val highlightedScreens = remember(highlightState) {
        buildSet {
            highlightState.hoveredScreen?.let { add(it) }
            addAll(highlightState.sourceScreens)
            addAll(highlightState.targetScreens)
            addAll(highlightState.testFlowScreens)
        }
    }

    // Compute highlighted transitions for test flow (sequential path through screens)
    val testFlowTransitions = remember(highlightState.testFlowScreens, transitions) {
        if (highlightState.testFlowScreens.isEmpty()) emptySet()
        else {
            val flowScreensList = externalHighlightedScreens
            val flowTransitions = mutableSetOf<String>()
            // Find transitions between consecutive screens in the flow
            for (i in 0 until flowScreensList.size - 1) {
                val fromScreen = flowScreensList[i]
                val toScreen = flowScreensList[i + 1]
                transitions.find { it.fromScreen == fromScreen && it.toScreen == toScreen }
                    ?.let { flowTransitions.add(it.id) }
            }
            flowTransitions
        }
    }

    val highlightedTransitions = remember(hoveredScreenName, hoveredTransitionId, transitions, testFlowTransitions) {
        when {
            testFlowTransitions.isNotEmpty() -> testFlowTransitions
            hoveredScreenName != null -> {
                // Highlight all edges connected to hovered screen
                transitions.filter { it.trigger != "back" }
                    .filter { it.fromScreen == hoveredScreenName || it.toScreen == hoveredScreenName }
                    .map { it.id }
                    .toSet()
            }
            hoveredTransitionId != null -> setOf(hoveredTransitionId!!)
            else -> emptySet()
        }
    }

    // Compute edge hit zones for hover detection
    // Each edge is represented by its start and end points (simplified from the full path)
    data class EdgeHitZone(
        val transitionId: String,
        val startX: Float,
        val startY: Float,
        val endX: Float,
        val endY: Float,
    )

    // Helper to compute distance from point to line segment
    fun distanceToSegment(px: Float, py: Float, x1: Float, y1: Float, x2: Float, y2: Float): Float {
        val dx = x2 - x1
        val dy = y2 - y1
        val lengthSquared = dx * dx + dy * dy

        if (lengthSquared == 0f) {
            // Segment is a point
            return kotlin.math.sqrt((px - x1) * (px - x1) + (py - y1) * (py - y1))
        }

        // Project point onto segment, clamped to [0, 1]
        val t = maxOf(0f, minOf(1f, ((px - x1) * dx + (py - y1) * dy) / lengthSquared))

        // Find projection point
        val projX = x1 + t * dx
        val projY = y1 + t * dy

        return kotlin.math.sqrt((px - projX) * (px - projX) + (py - projY) * (py - projY))
    }

    // Compute node positions using D3-style force-directed layout
    val nodePositions = remember(screens, transitions) {
        computeNodePositions(screens, transitions, density)
    }

    // Create lookup maps
    val screenById = remember(screens) { screens.associateBy { it.id } }
    val screenByName = remember(screens) { screens.associateBy { it.name } }
    val positionByName = remember(nodePositions) { nodePositions.associateBy { it.screenId } }

    // Convert dp to px for drawing
    val nodeWidthPx = with(density) { NODE_WIDTH.toPx() }
    val nodeHeightPx = with(density) { NODE_HEIGHT.toPx() }

    // Compute edge hit zones (right edge to left edge, matching actual line drawing)
    val edgeHitZones = remember(transitions, positionByName, nodeWidthPx, nodeHeightPx) {
        val forwardTransitions = transitions.filter { it.trigger != "back" }
        forwardTransitions.mapNotNull { transition ->
            val fromPos = positionByName[transition.fromScreen]
            val toPos = positionByName[transition.toScreen]
            if (fromPos != null && toPos != null) {
                EdgeHitZone(
                    transitionId = transition.id,
                    startX = fromPos.x + nodeWidthPx,  // Right edge
                    startY = fromPos.y + nodeHeightPx / 2,  // Center Y
                    endX = toPos.x,  // Left edge
                    endY = toPos.y + nodeHeightPx / 2,  // Center Y
                )
            } else null
        }
    }

    // Check edge hover when mouse moves (only if not hovering a screen)
    LaunchedEffect(mouseX, mouseY, edgeHitZones, scale, offsetX, offsetY, hoveredScreenName) {
        if (hoveredScreenName != null) {
            // Screen hover takes precedence - clear edge hover
            if (hoveredTransitionId != null) {
                hoveredTransitionId = null
            }
        } else {
            val hitThreshold = 15f  // Pixels from edge line to count as hit
            val detectedEdge = edgeHitZones.find { zone ->
                // Transform edge points to screen coordinates
                val sx = zone.startX * scale + offsetX
                val sy = zone.startY * scale + offsetY
                val ex = zone.endX * scale + offsetX
                val ey = zone.endY * scale + offsetY
                distanceToSegment(mouseX, mouseY, sx, sy, ex, ey) < hitThreshold
            }?.transitionId

            if (detectedEdge != hoveredTransitionId) {
                hoveredTransitionId = detectedEdge
            }
        }
    }
    val arrowColor = colors.text.normal.copy(alpha = 0.3f)
    val highlightedArrowColor = Color(0xFF1976D2)  // Darker blue for highlighted edges
    val dimmedArrowColor = colors.text.normal.copy(alpha = 0.1f)  // Dimmed when something else is highlighted

    // Track if we've done initial fit and auto-panned for highlighted screens
    var hasInitialFit by remember { mutableStateOf(false) }
    var lastAutoPannedScreens by remember { mutableStateOf<List<String>>(emptyList()) }

    // Update focusedScreenName from currentObservedScreen when auto-focus is enabled
    LaunchedEffect(autoFocusEnabled, currentObservedScreen) {
        if (autoFocusEnabled && currentObservedScreen != null) {
            focusedScreenName = currentObservedScreen
        }
    }

    // Helper to compute 2-step neighborhood of a screen (for auto-zoom)
    fun computeNeighborhood(screenName: String, maxSteps: Int): Set<String> {
        val result = mutableSetOf(screenName)
        var frontier = setOf(screenName)
        repeat(maxSteps) {
            val next = mutableSetOf<String>()
            for (screen in frontier) {
                transitions.filter { it.trigger != "back" }.forEach { t ->
                    if (t.fromScreen == screen) next.add(t.toScreen)
                    if (t.toScreen == screen) next.add(t.fromScreen)
                }
            }
            // Compute new frontier BEFORE adding to result, otherwise frontier is always empty
            frontier = next - result
            result.addAll(next)
        }
        return result
    }

    BoxWithConstraints(
        modifier = Modifier
            .fillMaxSize()
            .onPointerEvent(PointerEventType.Enter) { isCanvasHovered = true }
            .onPointerEvent(PointerEventType.Exit) { isCanvasHovered = false }
    ) {
        val viewportWidth = constraints.maxWidth.toFloat()
        val viewportHeight = constraints.maxHeight.toFloat()

        // Auto-fit entire graph on initial load (no highlights)
        LaunchedEffect(viewportWidth, viewportHeight, nodePositions) {
            if (!hasInitialFit && externalHighlightedScreens.isEmpty() &&
                nodePositions.isNotEmpty() && viewportWidth > 0 && viewportHeight > 0) {
                // Compute bounding box of ALL screens
                val minX = nodePositions.minOf { it.x }
                val maxX = nodePositions.maxOf { it.x } + nodeWidthPx
                val minY = nodePositions.minOf { it.y }
                val maxY = nodePositions.maxOf { it.y } + nodeHeightPx

                // Add padding
                val padding = 60f
                val boundsWidth = maxX - minX + padding * 2
                val boundsHeight = maxY - minY + padding * 2
                val centerX = (minX + maxX) / 2
                val centerY = (minY + maxY) / 2

                // Calculate scale to fit all nodes in viewport
                val scaleX = viewportWidth / boundsWidth
                val scaleY = viewportHeight / boundsHeight
                val newScale = minOf(scaleX, scaleY, 1.5f).coerceIn(0.2f, 1.5f)

                // Center the graph in viewport
                val newOffsetX = viewportWidth / 2 - centerX * newScale
                val newOffsetY = viewportHeight / 2 - centerY * newScale

                scale = newScale
                offsetX = newOffsetX
                offsetY = newOffsetY
                animatedScale.snapTo(newScale)
                animatedOffsetX.snapTo(newOffsetX)
                animatedOffsetY.snapTo(newOffsetY)
                hasInitialFit = true
            }
        }

        // Auto-pan to show highlighted screens when they change (from test flow)
        LaunchedEffect(externalHighlightedScreens, viewportWidth, viewportHeight) {
            if (externalHighlightedScreens.isNotEmpty() && externalHighlightedScreens != lastAutoPannedScreens) {
                // Compute bounding box of highlighted screens
                val highlightedPositions = externalHighlightedScreens.mapNotNull { screenName ->
                    positionByName[screenName]
                }
                if (highlightedPositions.isNotEmpty() && viewportWidth > 0 && viewportHeight > 0) {
                    val minX = highlightedPositions.minOf { it.x }
                    val maxX = highlightedPositions.maxOf { it.x } + nodeWidthPx
                    val minY = highlightedPositions.minOf { it.y }
                    val maxY = highlightedPositions.maxOf { it.y } + nodeHeightPx

                    // Add padding
                    val padding = 80f
                    val boundsWidth = maxX - minX + padding * 2
                    val boundsHeight = maxY - minY + padding * 2
                    val centerX = (minX + maxX) / 2
                    val centerY = (minY + maxY) / 2

                    // Calculate scale to fit bounds in viewport (with some margin)
                    val scaleX = viewportWidth / boundsWidth
                    val scaleY = viewportHeight / boundsHeight
                    val newScale = minOf(scaleX, scaleY, 1.5f).coerceIn(0.3f, 1.5f)

                    // Center the bounds in viewport
                    val newOffsetX = viewportWidth / 2 - centerX * newScale
                    val newOffsetY = viewportHeight / 2 - centerY * newScale

                    // Animate to new position smoothly
                    launch { animatedScale.animateTo(newScale, tween(350, easing = FastOutSlowInEasing)) }
                    launch { animatedOffsetX.animateTo(newOffsetX, tween(350, easing = FastOutSlowInEasing)) }
                    launch { animatedOffsetY.animateTo(newOffsetY, tween(350, easing = FastOutSlowInEasing)) }
                    lastAutoPannedScreens = externalHighlightedScreens
                }
            } else if (externalHighlightedScreens.isEmpty() && lastAutoPannedScreens.isNotEmpty()) {
                lastAutoPannedScreens = emptyList()
            }
        }

        // Animated pan and zoom for fog mode focus
        LaunchedEffect(focusedScreenName, autoFocusEnabled, fogModeEnabled, viewportWidth, viewportHeight, nodePositions) {
            if (fogModeEnabled && focusedScreenName != null && viewportWidth > 0 && viewportHeight > 0) {
                val targetPos = positionByName[focusedScreenName]
                if (targetPos != null) {
                    // Compute 2-step neighborhood for auto-zoom
                    val neighborhood = computeNeighborhood(focusedScreenName!!, 2)
                    val neighborPositions = neighborhood.mapNotNull { positionByName[it] }

                    if (neighborPositions.isNotEmpty()) {
                        // Compute bounding box of neighborhood
                        val minX = neighborPositions.minOf { it.x }
                        val maxX = neighborPositions.maxOf { it.x } + nodeWidthPx
                        val minY = neighborPositions.minOf { it.y }
                        val maxY = neighborPositions.maxOf { it.y } + nodeHeightPx

                        // Add padding
                        val padding = 80f
                        val boundsWidth = maxX - minX + padding * 2
                        val boundsHeight = maxY - minY + padding * 2

                        // Calculate scale to fit neighborhood in viewport
                        val scaleX = viewportWidth / boundsWidth
                        val scaleY = viewportHeight / boundsHeight
                        val newScale = minOf(scaleX, scaleY, 1.5f).coerceIn(0.3f, 1.5f)

                        // Calculate target offset to center the focused node
                        val targetOffsetX = viewportWidth / 2 - (targetPos.x + nodeWidthPx / 2) * newScale
                        val targetOffsetY = viewportHeight / 2 - (targetPos.y + nodeHeightPx / 2) * newScale

                        // Animate scale and offset together with smooth easing
                        launch { animatedScale.animateTo(newScale, tween(350, easing = FastOutSlowInEasing)) }
                        launch { animatedOffsetX.animateTo(targetOffsetX, tween(350, easing = FastOutSlowInEasing)) }
                        launch { animatedOffsetY.animateTo(targetOffsetY, tween(350, easing = FastOutSlowInEasing)) }
                    }
                }
            }
        }

        // Sync animated values to actual values when animations drive position
        LaunchedEffect(animatedOffsetX.value, animatedOffsetY.value, animatedScale.value) {
            scale = animatedScale.value
            offsetX = animatedOffsetX.value
            offsetY = animatedOffsetY.value
        }

        // Detect focus mode: when canvas is hovered AND any node extends beyond visible bounds
        // Top bound is the header area, other bounds are viewport edges
        // Focus mode only activates when user is actively interacting with the canvas
        LaunchedEffect(scale, offsetX, offsetY, nodePositions, viewportWidth, viewportHeight, headerHeightPx, isCanvasHovered) {
            if (!isCanvasHovered || nodePositions.isEmpty() || viewportWidth <= 0 || viewportHeight <= 0) {
                onFocusModeChanged(false)
                return@LaunchedEffect
            }

            // Check if any node extends beyond visible bounds
            var contentExceedsBounds = false
            for (pos in nodePositions) {
                // Calculate node screen bounds
                val nodeScreenLeft = pos.x * scale + offsetX
                val nodeScreenTop = pos.y * scale + offsetY
                val nodeScreenRight = nodeScreenLeft + nodeWidthPx * scale
                val nodeScreenBottom = nodeScreenTop + nodeHeightPx * scale

                // Check all four edges:
                // - Top: overlap with header area
                // - Left/Right/Bottom: extend beyond viewport edges
                if (nodeScreenTop < headerHeightPx ||
                    nodeScreenLeft < 0 ||
                    nodeScreenRight > viewportWidth ||
                    nodeScreenBottom > viewportHeight) {
                    contentExceedsBounds = true
                    break
                }
            }

            onFocusModeChanged(contentExceedsBounds)
        }

        // Zoom helper that keeps a specific point fixed
        fun zoomAroundPoint(newScale: Float, pivotX: Float, pivotY: Float) {
            val oldScale = scale
            // Find the content point at the pivot
            val contentX = (pivotX - offsetX) / oldScale
            val contentY = (pivotY - offsetY) / oldScale
            // Update scale
            scale = newScale
            // Adjust offset so the same content point stays at pivot
            offsetX = pivotX - contentX * newScale
            offsetY = pivotY - contentY * newScale
        }

        // Zoom helper that keeps viewport center fixed
        fun zoomAroundCenter(newScale: Float) {
            zoomAroundPoint(newScale, viewportWidth / 2, viewportHeight / 2)
        }

        Box(
            modifier = Modifier
                .fillMaxSize()
                .pointerInput(Unit) {
                    detectDragGestures { change, dragAmount ->
                        change.consume()
                        offsetX += dragAmount.x
                        offsetY += dragAmount.y
                        // Snap animatables to prevent conflicts with manual drag
                        animationScope.launch {
                            animatedOffsetX.snapTo(offsetX)
                            animatedOffsetY.snapTo(offsetY)
                            animatedScale.snapTo(scale)
                        }
                    }
                }
                .onPointerEvent(PointerEventType.Move) { event ->
                    val pos = event.changes.firstOrNull()?.position
                    if (pos != null) {
                        mouseX = pos.x
                        mouseY = pos.y
                    }
                }
                .onPointerEvent(PointerEventType.Exit) {
                    // Deselect all elements when mouse leaves canvas
                    hoveredScreenName = null
                    hoveredTransitionId = null
                }
                .onPointerEvent(PointerEventType.Scroll) { event ->
                    // Only allow scroll-to-zoom when a graph element is selected (hovered)
                    if (hoveredScreenName == null && hoveredTransitionId == null) return@onPointerEvent
                    val change = event.changes.firstOrNull() ?: return@onPointerEvent
                    val scrollDelta = change.scrollDelta.y
                    if (scrollDelta != 0f) {
                        // 10x less sensitive: smaller zoom factor per scroll tick
                        val zoomFactor = if (scrollDelta > 0) 0.99f else 1.01f
                        val newScale = (scale * zoomFactor).coerceIn(0.05f, 3f)
                        // Zoom around cursor position
                        zoomAroundPoint(newScale, change.position.x, change.position.y)
                        // Snap animatables to prevent conflicts with manual zoom
                        animationScope.launch {
                            animatedScale.snapTo(scale)
                            animatedOffsetX.snapTo(offsetX)
                            animatedOffsetY.snapTo(offsetY)
                        }
                    }
                }
                .drawBehind {
                // Draw smooth curved edges between closest points on nodes
                val strokeWidth = 4f * scale

                // Filter out back press transitions
                val forwardTransitions = transitions.filter { it.trigger != "back" }

                // Edge point data class
                data class EdgePoint(val x: Float, val y: Float, val side: String)

                forwardTransitions.forEach { transition ->
                    val fromPos = positionByName[transition.fromScreen]
                    val toPos = positionByName[transition.toScreen]

                    if (fromPos != null && toPos != null) {
                        // Calculate all edge midpoints for source node
                        val fromLeft = EdgePoint(fromPos.x * scale + offsetX, (fromPos.y + nodeHeightPx / 2) * scale + offsetY, "left")
                        val fromRight = EdgePoint((fromPos.x + nodeWidthPx) * scale + offsetX, (fromPos.y + nodeHeightPx / 2) * scale + offsetY, "right")
                        val fromTop = EdgePoint((fromPos.x + nodeWidthPx / 2) * scale + offsetX, fromPos.y * scale + offsetY, "top")
                        val fromBottom = EdgePoint((fromPos.x + nodeWidthPx / 2) * scale + offsetX, (fromPos.y + nodeHeightPx) * scale + offsetY, "bottom")

                        // Calculate all edge midpoints for target node
                        val toLeft = EdgePoint(toPos.x * scale + offsetX, (toPos.y + nodeHeightPx / 2) * scale + offsetY, "left")
                        val toRight = EdgePoint((toPos.x + nodeWidthPx) * scale + offsetX, (toPos.y + nodeHeightPx / 2) * scale + offsetY, "right")
                        val toTop = EdgePoint((toPos.x + nodeWidthPx / 2) * scale + offsetX, toPos.y * scale + offsetY, "top")
                        val toBottom = EdgePoint((toPos.x + nodeWidthPx / 2) * scale + offsetX, (toPos.y + nodeHeightPx) * scale + offsetY, "bottom")

                        val fromPoints = listOf(fromRight, fromBottom, fromTop, fromLeft)  // Priority order
                        val toPoints = listOf(toLeft, toTop, toBottom, toRight)  // Priority order

                        // Find the pair of points with minimum distance
                        fun dist(p1: EdgePoint, p2: EdgePoint) =
                            kotlin.math.sqrt((p2.x - p1.x) * (p2.x - p1.x) + (p2.y - p1.y) * (p2.y - p1.y))

                        // Deterministic side priority (lower = preferred when distances are close)
                        fun sidePriority(fromSide: String, toSide: String): Int {
                            val fromPriority = when (fromSide) {
                                "right" -> 0
                                "bottom" -> 1
                                "top" -> 2
                                else -> 3  // left
                            }
                            val toPriority = when (toSide) {
                                "left" -> 0
                                "top" -> 1
                                "bottom" -> 2
                                else -> 3  // right
                            }
                            return fromPriority * 4 + toPriority
                        }

                        // Find minimum distance first
                        var minDist = Float.MAX_VALUE
                        for (fp in fromPoints) {
                            for (tp in toPoints) {
                                val d = dist(fp, tp)
                                if (d < minDist) minDist = d
                            }
                        }

                        // Find best pair within 15% of minimum distance, using priority as tie-breaker
                        val margin = minDist * 0.15f
                        var bestFrom = fromRight
                        var bestTo = toLeft
                        var bestPriority = Int.MAX_VALUE

                        for (fp in fromPoints) {
                            for (tp in toPoints) {
                                val d = dist(fp, tp)
                                if (d <= minDist + margin) {
                                    val priority = sidePriority(fp.side, tp.side)
                                    if (priority < bestPriority) {
                                        bestPriority = priority
                                        bestFrom = fp
                                        bestTo = tp
                                    }
                                }
                            }
                        }

                        val startX = bestFrom.x
                        val startY = bestFrom.y
                        val endX = bestTo.x
                        val endY = bestTo.y

                        // Determine edge color based on highlight state
                        val isHighlighted = transition.id in highlightedTransitions
                        val hasAnyHighlight = highlightedScreens.isNotEmpty() || highlightedTransitions.isNotEmpty()
                        val edgeColor = when {
                            isHighlighted -> highlightedArrowColor
                            hasAnyHighlight -> dimmedArrowColor
                            else -> arrowColor
                        }
                        val edgeStrokeWidth = if (isHighlighted) strokeWidth * 1.5f else strokeWidth

                        // Build smooth curved path using cubic bezier
                        val path = Path()
                        path.moveTo(startX, startY)

                        // Control point offset - extends perpendicular to the edge
                        val curveStrength = minDist * 0.4f

                        // Control point 1: extends outward from start point based on which side
                        val ctrl1X = when (bestFrom.side) {
                            "left" -> startX - curveStrength
                            "right" -> startX + curveStrength
                            else -> startX
                        }
                        val ctrl1Y = when (bestFrom.side) {
                            "top" -> startY - curveStrength
                            "bottom" -> startY + curveStrength
                            else -> startY
                        }

                        // Control point 2: extends outward from end point based on which side
                        val ctrl2X = when (bestTo.side) {
                            "left" -> endX - curveStrength
                            "right" -> endX + curveStrength
                            else -> endX
                        }
                        val ctrl2Y = when (bestTo.side) {
                            "top" -> endY - curveStrength
                            "bottom" -> endY + curveStrength
                            else -> endY
                        }

                        path.cubicTo(ctrl1X, ctrl1Y, ctrl2X, ctrl2Y, endX, endY)

                        drawPath(
                            path = path,
                            color = edgeColor,
                            style = Stroke(width = edgeStrokeWidth, cap = StrokeCap.Round),
                        )
                    }
                }
                }
        ) {
            // Render screen nodes as Composables
            nodePositions.forEach { pos ->
                val screen = screenByName[pos.screenId] ?: return@forEach

                val hasAnyHighlight = highlightedScreens.isNotEmpty() || highlightedTransitions.isNotEmpty()

                Box(
                    modifier = Modifier
                        .offset {
                            IntOffset(
                                (pos.x * scale + offsetX).roundToInt(),
                                (pos.y * scale + offsetY).roundToInt()
                            )
                        }
                        .graphicsLayer {
                            scaleX = scale
                            scaleY = scale
                            transformOrigin = androidx.compose.ui.graphics.TransformOrigin(0f, 0f)
                        }
                ) {
                    ScreenNodeCard(
                        screen = screen,
                        isHovered = screen.name == highlightState.hoveredScreen,
                        isSource = screen.name in highlightState.sourceScreens,
                        isTarget = screen.name in highlightState.targetScreens,
                        isInTestFlow = screen.name in highlightState.testFlowScreens,
                        isCurrentReplayStep = screen.name == currentReplayScreen,
                        isFogFocused = fogModeEnabled && screen.name == focusedScreenName,
                        isDimmed = hasAnyHighlight && screen.name !in highlightedScreens,
                        onClick = {
                            // When clicking a node, focus on it and disable auto-focus
                            if (fogModeEnabled) {
                                focusedScreenName = screen.name
                                onAutoFocusToggled(false)
                            }
                            onScreenSelected(screen.id)
                        },
                        onHoverChange = { isHovered ->
                            hoveredScreenName = if (isHovered) screen.name else null
                        },
                        screenshotLoader = screenshotLoader,
                    )
                }
            }

            // Fog overlay - radial gradient centered on focused node
            if (fogModeEnabled && focusedScreenName != null) {
                val focusPos = positionByName[focusedScreenName]
                if (focusPos != null) {
                    val centerX = (focusPos.x + nodeWidthPx / 2) * scale + offsetX
                    val centerY = (focusPos.y + nodeHeightPx / 2) * scale + offsetY
                    val surfaceColor = colors.text.normal.copy(alpha = 0f)
                    val fogColor = JewelTheme.globalColors.text.normal.copy(alpha = 0.5f)

                    Canvas(modifier = Modifier.fillMaxSize().zIndex(1f)) {
                        val maxRadius = maxOf(size.width, size.height)

                        drawRect(
                            brush = Brush.radialGradient(
                                colorStops = arrayOf(
                                    0.0f to Color.Transparent,
                                    0.3f to fogColor.copy(alpha = 0.05f),
                                    0.6f to fogColor.copy(alpha = 0.20f),
                                    1.0f to fogColor,
                                ),
                                center = androidx.compose.ui.geometry.Offset(centerX, centerY),
                                radius = maxRadius,
                            ),
                            size = size,
                        )
                    }
                }
            }

            // Toggle controls inside canvas, below the header
            Row(
                modifier = Modifier
                    .align(Alignment.TopStart)
                    .zIndex(2f)
                    .offset(y = with(density) { headerHeightPx.toDp() } + 8.dp)
                    .padding(start = 12.dp)
                    .background(colors.text.normal.copy(alpha = 0.1f), RoundedCornerShape(8.dp))
                    .padding(8.dp)
                    .graphicsLayer { alpha = chromeAlpha },
                horizontalArrangement = Arrangement.spacedBy(16.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                // Fog Mode toggle
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text("Fog", fontSize = 11.sp, color = colors.text.normal.copy(alpha = 0.7f))
                    Spacer(Modifier.width(4.dp))
                    ToggleSwitch(checked = fogModeEnabled, onCheckedChange = onFogModeToggled)
                }

                // Auto-Focus toggle (only visible when fog mode is on)
                if (fogModeEnabled) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text("Auto", fontSize = 11.sp, color = colors.text.normal.copy(alpha = 0.7f))
                        Spacer(Modifier.width(4.dp))
                        ToggleSwitch(checked = autoFocusEnabled, onCheckedChange = onAutoFocusToggled)
                    }
                }
            }

            // Zoom controls in bottom right
            ZoomControls(
                scale = scale,
                onZoomIn = {
                    zoomAroundCenter((scale * 1.2f).coerceAtMost(3f))
                    animationScope.launch {
                        animatedScale.snapTo(scale)
                        animatedOffsetX.snapTo(offsetX)
                        animatedOffsetY.snapTo(offsetY)
                    }
                },
                onZoomOut = {
                    zoomAroundCenter((scale / 1.2f).coerceAtLeast(0.05f))
                    animationScope.launch {
                        animatedScale.snapTo(scale)
                        animatedOffsetX.snapTo(offsetX)
                        animatedOffsetY.snapTo(offsetY)
                    }
                },
                onReset = {
                    scale = 1f
                    offsetX = 0f
                    offsetY = 0f
                    animationScope.launch {
                        animatedScale.snapTo(1f)
                        animatedOffsetX.snapTo(0f)
                        animatedOffsetY.snapTo(0f)
                    }
                },
                modifier = Modifier
                    .align(Alignment.BottomEnd)
                    .zIndex(2f)
                    .padding(16.dp)
                    .graphicsLayer { alpha = chromeAlpha },
            )

        }
    }
}

@Composable
private fun ScreenNodeCard(
    screen: ScreenNode,
    isHovered: Boolean,
    isSource: Boolean,  // Orange - nodes we came from
    isTarget: Boolean,  // Green - nodes we could go to
    isInTestFlow: Boolean = false,  // Blue - part of test flow path
    isCurrentReplayStep: Boolean = false,  // Currently active step in replay
    isFogFocused: Boolean = false,  // Focused node in fog mode
    isDimmed: Boolean,
    onClick: () -> Unit,
    onHoverChange: (Boolean) -> Unit,
    screenshotLoader: NavigationScreenshotLoader? = null,
) {
    // Screenshot loading state
    var screenshotBitmap by remember { mutableStateOf<ImageBitmap?>(null) }
    var isLoadingScreenshot by remember { mutableStateOf(false) }

    // Load screenshot when available
    LaunchedEffect(screen.screenshotUri) {
        if (screen.screenshotUri != null && screenshotLoader != null) {
            isLoadingScreenshot = true
            screenshotBitmap = withContext(Dispatchers.IO) {
                screenshotLoader.load(screen.screenshotUri)
            }
            isLoadingScreenshot = false
        } else {
            screenshotBitmap = null
        }
    }

    val colors = JewelTheme.globalColors

    // Highlight colors
    val lightBlue = Color(0xFF64B5F6)   // Light blue for hovered screen
    val orange = Color(0xFFFF9800)       // Orange for source (came from)
    val green = Color(0xFF4CAF50)        // Green for target (could go to)
    val testFlowBlue = Color(0xFF2196F3) // Blue for test flow path
    val currentStepGreen = Color(0xFF00E676)  // Bright green for current step
    val fogFocusYellow = Color(0xFFFFEB3B)  // Yellow for fog focus center

    // Visual states based on highlighting type
    val isHighlighted = isHovered || isSource || isTarget || isInTestFlow || isCurrentReplayStep || isFogFocused
    val borderColor = when {
        isCurrentReplayStep -> currentStepGreen  // Current step is bright green
        isFogFocused -> fogFocusYellow  // Fog focus is yellow
        isHovered -> lightBlue
        isInTestFlow -> testFlowBlue
        isSource -> orange
        isTarget -> green
        else -> Color.Transparent
    }
    val borderWidth = when {
        isCurrentReplayStep -> 3.dp
        isFogFocused -> 3.dp
        else -> 2.dp
    }
    val textAlpha = if (isDimmed) 0.4f else 0.8f

    Tooltip(
        tooltip = {
            Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                Text(screen.name, fontSize = 12.sp)
                Text(screen.type, fontSize = 11.sp, color = colors.text.normal.copy(alpha = 0.7f))
                Text(screen.packageName, fontSize = 10.sp, color = colors.text.normal.copy(alpha = 0.5f))
                Text("Coverage: ${screen.testCoverage}%", fontSize = 11.sp, color = colors.text.normal.copy(alpha = 0.7f))
            }
        },
    ) {
        Box(
            modifier = Modifier
                .clickable(onClick = onClick)
                .pointerHoverIcon(PointerIcon.Hand)
                .onPointerEvent(PointerEventType.Enter) { onHoverChange(true) }
                .onPointerEvent(PointerEventType.Exit) { onHoverChange(false) },
        ) {
            // Screen name positioned 8dp above the card (plus ~12dp for text height)
            Text(
                text = screen.name.take(12) + if (screen.name.length > 12) "…" else "",
                fontSize = 9.sp,
                color = colors.text.normal.copy(alpha = textAlpha),
                modifier = Modifier
                    .align(Alignment.TopCenter)
                    .offset(y = (-20).dp),
            )

            // Screenshot card - edge to edge
            Box(
                modifier = Modifier
                    .size(NODE_WIDTH, NODE_HEIGHT)
                    .clip(RoundedCornerShape(8.dp))
                    .background(colors.text.normal.copy(alpha = 0.08f))
                    .then(
                        if (isHighlighted) Modifier.border(borderWidth, borderColor, RoundedCornerShape(8.dp))
                        else Modifier
                    ),
                contentAlignment = Alignment.Center,
            ) {
                when {
                    screenshotBitmap != null -> {
                        Image(
                            bitmap = screenshotBitmap!!,
                            contentDescription = "Screenshot of ${screen.name}",
                            modifier = Modifier.fillMaxSize(),
                            contentScale = ContentScale.Crop,
                        )
                    }
                    isLoadingScreenshot -> {
                        // Show subtle loading indicator (dimmed placeholder)
                        Box(
                            modifier = Modifier
                                .fillMaxSize()
                                .background(colors.text.normal.copy(alpha = 0.04f)),
                        )
                    }
                    // else: empty placeholder (no screenshot available)
                }
            }
        }
    }
}

@Composable
private fun ZoomControls(
    scale: Float,
    onZoomIn: () -> Unit,
    onZoomOut: () -> Unit,
    onReset: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val colors = JewelTheme.globalColors

    Column(
        modifier = modifier
            .background(colors.text.normal.copy(alpha = 0.1f), RoundedCornerShape(8.dp))
            .padding(4.dp),
        verticalArrangement = Arrangement.spacedBy(2.dp),
    ) {
        ZoomButton("+", onClick = onZoomIn)
        ZoomButton("−", onClick = onZoomOut)
        ZoomButton("⟲", onClick = onReset)

        Text(
            "${(scale * 100).toInt()}%",
            fontSize = 9.sp,
            color = colors.text.normal.copy(alpha = 0.5f),
            modifier = Modifier.align(Alignment.CenterHorizontally).padding(top = 2.dp),
        )
    }
}

@Composable
private fun ZoomButton(label: String, onClick: () -> Unit) {
    val colors = JewelTheme.globalColors

    Box(
        modifier = Modifier
            .size(28.dp)
            .background(colors.text.normal.copy(alpha = 0.1f), RoundedCornerShape(4.dp))
            .clickable(onClick = onClick)
            .pointerHoverIcon(PointerIcon.Hand),
        contentAlignment = Alignment.Center,
    ) {
        Text(label, fontSize = 14.sp)
    }
}

@Composable
private fun ToggleSwitch(
    checked: Boolean,
    onCheckedChange: (Boolean) -> Unit,
    modifier: Modifier = Modifier,
) {
    val colors = JewelTheme.globalColors
    val trackColor = if (checked) Color(0xFF4CAF50) else colors.text.normal.copy(alpha = 0.3f)
    val thumbColor = Color.White

    Box(
        modifier = modifier
            .width(32.dp)
            .height(18.dp)
            .clip(RoundedCornerShape(9.dp))
            .background(trackColor)
            .clickable { onCheckedChange(!checked) }
            .pointerHoverIcon(PointerIcon.Hand)
            .padding(2.dp),
    ) {
        Box(
            modifier = Modifier
                .size(14.dp)
                .offset(x = if (checked) 14.dp else 0.dp)
                .clip(CircleShape)
                .background(thumbColor),
        )
    }
}


/**
 * D3-style disjoint force-directed layout algorithm.
 * Uses four forces (matching D3 defaults):
 * 1. Link force: attraction between connected nodes
 * 2. Charge force: repulsion between ALL nodes (many-body)
 * 3. forceX: pull toward center X (keeps disjoint components from escaping)
 * 4. forceY: pull toward center Y (keeps disjoint components from escaping)
 *
 * Based on: https://observablehq.com/@d3/disjoint-force-directed-graph/2
 */
private fun computeNodePositions(
    screens: List<ScreenNode>,
    transitions: List<ScreenTransition>,
    density: androidx.compose.ui.unit.Density,
): List<NodePosition> {
    if (screens.isEmpty()) return emptyList()

    val nodeWidth = with(density) { NODE_WIDTH.toPx() }
    val nodeHeight = with(density) { NODE_HEIGHT.toPx() }

    // Create mutable node state for simulation
    data class SimNode(
        val id: String,
        var x: Float,
        var y: Float,
        var vx: Float = 0f,
        var vy: Float = 0f,
    )

    // Initialize nodes in a phyllotaxis pattern (like D3 does for better initial spread)
    val nodes = screens.mapIndexed { i, screen ->
        val angle = Math.PI * (3 - kotlin.math.sqrt(5.0)) * i  // Golden angle
        val radius = 10f * kotlin.math.sqrt(i.toFloat() + 0.5f)
        SimNode(
            id = screen.name,
            x = (radius * kotlin.math.cos(angle)).toFloat(),
            y = (radius * kotlin.math.sin(angle)).toFloat(),
        )
    }
    val nodeById = nodes.associateBy { it.id }

    // Build link list (forward transitions only)
    data class SimLink(val source: SimNode, val target: SimNode)
    val links = transitions
        .filter { it.trigger != "back" }
        .mapNotNull { t ->
            val source = nodeById[t.fromScreen]
            val target = nodeById[t.toScreen]
            if (source != null && target != null && source != target) {
                SimLink(source, target)
            } else null
        }
        .distinctBy { setOf(it.source.id, it.target.id) }  // Deduplicate bidirectional

    // Count connections per node (for link strength calculation)
    val connectionCount = mutableMapOf<String, Int>().withDefault { 0 }
    links.forEach { link ->
        connectionCount[link.source.id] = connectionCount.getValue(link.source.id) + 1
        connectionCount[link.target.id] = connectionCount.getValue(link.target.id) + 1
    }

    // Force parameters (tuned for navigation graph with larger nodes)
    val linkDistance = nodeWidth * 2.5f      // Target distance between linked nodes
    val linkStrength = 0.3f                   // Link spring strength
    val chargeStrength = -400f                // Repulsion strength (negative = repel)
    val centerStrength = 0.05f                // Pull toward center
    val collisionStrength = 1.0f              // Collision force strength (strongest!)
    val collisionPadding = 20f                // Extra padding between nodes
    val edgeRepulsionStrength = 0.8f          // How strongly nodes avoid edges
    val edgeRepulsionDistance = nodeHeight    // Distance at which edge repulsion kicks in
    val velocityDecay = 0.6f                  // Friction (1 = no decay, 0 = instant stop)

    // Collision bounds (rectangle with padding)
    val collisionWidth = nodeWidth + collisionPadding
    val collisionHeight = nodeHeight + collisionPadding

    // Helper to compute closest point on line segment and distance
    fun pointToSegmentDistance(
        px: Float, py: Float,
        x1: Float, y1: Float,
        x2: Float, y2: Float
    ): Triple<Float, Float, Float> {  // Returns (distance, closestX, closestY)
        val dx = x2 - x1
        val dy = y2 - y1
        val lengthSq = dx * dx + dy * dy

        if (lengthSq == 0f) {
            // Segment is a point
            val dist = kotlin.math.sqrt((px - x1) * (px - x1) + (py - y1) * (py - y1))
            return Triple(dist, x1, y1)
        }

        // Project point onto segment, clamped to [0, 1]
        val t = maxOf(0f, minOf(1f, ((px - x1) * dx + (py - y1) * dy) / lengthSq))

        // Find closest point on segment
        val closestX = x1 + t * dx
        val closestY = y1 + t * dy
        val dist = kotlin.math.sqrt((px - closestX) * (px - closestX) + (py - closestY) * (py - closestY))

        return Triple(dist, closestX, closestY)
    }

    // Simulation parameters
    var alpha = 1f                            // Current "temperature"
    val alphaMin = 0.001f                     // Stop when alpha drops below this
    val alphaDecay = 0.0228f                  // How fast alpha decreases (1 - 0.001^(1/300))

    // Center point for forceX/forceY
    val centerX = 0f
    val centerY = 0f

    // Run simulation iterations
    var iterations = 0
    val maxIterations = 300

    while (alpha > alphaMin && iterations < maxIterations) {
        iterations++

        // Reset velocities contribution for this tick
        nodes.forEach { node ->
            node.vx *= velocityDecay
            node.vy *= velocityDecay
        }

        // 1. COLLISION FORCE (strongest - applied first and directly moves nodes)
        // Check all pairs and push apart if overlapping
        for (i in nodes.indices) {
            for (j in i + 1 until nodes.size) {
                val nodeA = nodes[i]
                val nodeB = nodes[j]

                // Calculate overlap using axis-aligned bounding boxes
                val dx = nodeB.x - nodeA.x
                val dy = nodeB.y - nodeA.y

                // Required separation (center to center)
                val minSepX = collisionWidth
                val minSepY = collisionHeight

                // Actual overlap amounts
                val overlapX = minSepX - kotlin.math.abs(dx)
                val overlapY = minSepY - kotlin.math.abs(dy)

                // If both overlaps are positive, nodes are colliding
                if (overlapX > 0 && overlapY > 0) {
                    // Push apart along the axis of least overlap (feels more natural)
                    if (overlapX < overlapY) {
                        // Separate horizontally
                        val push = overlapX * collisionStrength * 0.5f
                        if (dx > 0) {
                            nodeA.x -= push
                            nodeB.x += push
                        } else {
                            nodeA.x += push
                            nodeB.x -= push
                        }
                    } else {
                        // Separate vertically
                        val push = overlapY * collisionStrength * 0.5f
                        if (dy > 0) {
                            nodeA.y -= push
                            nodeB.y += push
                        } else {
                            nodeA.y += push
                            nodeB.y -= push
                        }
                    }
                }
            }
        }

        // 2. EDGE-NODE REPULSION: Push nodes away from edges they don't belong to
        links.forEach { link ->
            nodes.forEach { node ->
                // Skip if this node is part of this edge
                if (node.id == link.source.id || node.id == link.target.id) return@forEach

                // Calculate distance from node center to edge line segment
                val (distance, closestX, closestY) = pointToSegmentDistance(
                    node.x, node.y,
                    link.source.x, link.source.y,
                    link.target.x, link.target.y
                )

                // If node is too close to edge, push it away
                if (distance < edgeRepulsionDistance && distance > 0.1f) {
                    // Direction away from closest point on edge
                    val awayX = node.x - closestX
                    val awayY = node.y - closestY
                    val awayDist = kotlin.math.sqrt(awayX * awayX + awayY * awayY)

                    if (awayDist > 0.1f) {
                        // Stronger force when closer (inverse relationship)
                        val strength = edgeRepulsionStrength * (1f - distance / edgeRepulsionDistance)
                        val push = strength * (edgeRepulsionDistance - distance)

                        node.vx += (awayX / awayDist) * push
                        node.vy += (awayY / awayDist) * push
                    }
                }
            }
        }

        // 3. Link force: pull connected nodes toward target distance
        links.forEach { link ->
            val dx = link.target.x - link.source.x
            val dy = link.target.y - link.source.y
            var distance = kotlin.math.sqrt(dx * dx + dy * dy)
            if (distance == 0f) distance = 1f

            // D3-style adaptive strength: 1 / min(count(source), count(target))
            val adaptiveStrength = linkStrength / minOf(
                connectionCount.getValue(link.source.id),
                connectionCount.getValue(link.target.id)
            )

            // Spring force toward target distance
            val force = (distance - linkDistance) * adaptiveStrength * alpha
            val fx = (dx / distance) * force
            val fy = (dy / distance) * force

            // Apply to both nodes (Newton's third law)
            link.source.vx += fx
            link.source.vy += fy
            link.target.vx -= fx
            link.target.vy -= fy
        }

        // 4. Many-body force: repulsion between all node pairs
        for (i in nodes.indices) {
            for (j in i + 1 until nodes.size) {
                val nodeA = nodes[i]
                val nodeB = nodes[j]

                var dx = nodeB.x - nodeA.x
                var dy = nodeB.y - nodeA.y
                var distSq = dx * dx + dy * dy

                // Minimum distance to avoid division by zero and extreme forces
                if (distSq < 1f) distSq = 1f
                val distance = kotlin.math.sqrt(distSq)

                // Inverse square law for repulsion
                val force = chargeStrength * alpha / distSq
                val fx = (dx / distance) * force
                val fy = (dy / distance) * force

                nodeA.vx += fx
                nodeA.vy += fy
                nodeB.vx -= fx
                nodeB.vy -= fy
            }
        }

        // 5. ForceX: pull toward center X
        nodes.forEach { node ->
            node.vx += (centerX - node.x) * centerStrength * alpha
        }

        // 6. ForceY: pull toward center Y
        nodes.forEach { node ->
            node.vy += (centerY - node.y) * centerStrength * alpha
        }

        // Apply velocities to positions
        nodes.forEach { node ->
            node.x += node.vx
            node.y += node.vy
        }

        // Decay alpha (cooling)
        alpha *= (1 - alphaDecay)
    }

    // Final collision pass - ensure no overlaps remain after simulation
    repeat(10) {
        for (i in nodes.indices) {
            for (j in i + 1 until nodes.size) {
                val nodeA = nodes[i]
                val nodeB = nodes[j]

                val dx = nodeB.x - nodeA.x
                val dy = nodeB.y - nodeA.y
                val overlapX = collisionWidth - kotlin.math.abs(dx)
                val overlapY = collisionHeight - kotlin.math.abs(dy)

                if (overlapX > 0 && overlapY > 0) {
                    if (overlapX < overlapY) {
                        val push = overlapX * 0.5f
                        if (dx > 0) {
                            nodeA.x -= push
                            nodeB.x += push
                        } else {
                            nodeA.x += push
                            nodeB.x -= push
                        }
                    } else {
                        val push = overlapY * 0.5f
                        if (dy > 0) {
                            nodeA.y -= push
                            nodeB.y += push
                        } else {
                            nodeA.y += push
                            nodeB.y -= push
                        }
                    }
                }
            }
        }
    }

    // Compute bounding box and add padding
    val minX = nodes.minOfOrNull { it.x } ?: 0f
    val minY = nodes.minOfOrNull { it.y } ?: 0f
    val paddingX = 100f + nodeWidth / 2
    val paddingY = 100f + nodeHeight / 2

    return nodes.map { node ->
        NodePosition(
            screenId = node.id,
            x = node.x - minX + paddingX,
            y = node.y - minY + paddingY,
        )
    }
}
