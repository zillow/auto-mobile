@file:OptIn(androidx.compose.ui.ExperimentalComposeUiApi::class)

package dev.jasonpearson.automobile.ide.layout

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
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
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.toComposeImageBitmap
import androidx.compose.ui.input.pointer.PointerEventType
import androidx.compose.ui.input.pointer.PointerIcon
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.input.pointer.onPointerEvent
import androidx.compose.ui.input.pointer.pointerHoverIcon
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import org.jetbrains.jewel.foundation.theme.JewelTheme
import org.jetbrains.jewel.ui.component.Text
import org.jetbrains.skia.Image
import kotlin.math.roundToInt

/**
 * Device screen view with screenshot display, zoom/pan controls, and element overlays.
 * Supports:
 * - Zoom via scroll wheel (centered on cursor)
 * - Pan via mouse drag
 * - Click to select elements (finds deepest element at point)
 * - Hover highlighting
 * - Selected element overlay (blue border)
 * - Hovered element overlay (gray border)
 */
@Composable
fun DeviceScreenView(
    screenshotData: ByteArray?,
    screenWidth: Int,
    screenHeight: Int,
    hierarchy: UIElementInfo?,
    selectedElementId: String?,
    hoveredElementId: String?,
    onElementSelected: (String?) -> Unit,
    onElementHovered: (String?) -> Unit,
    showTapTargetIssues: Boolean = false,
    onToggleTapTargetIssues: () -> Unit = {},
    modifier: Modifier = Modifier,
    refitTrigger: Any? = null,  // When this changes, refit the view to center
) {
    val colors = JewelTheme.globalColors

    // Zoom and pan state
    var scale by remember { mutableFloatStateOf(1f) }
    var offsetX by remember { mutableFloatStateOf(0f) }
    var offsetY by remember { mutableFloatStateOf(0f) }
    var hasInitialFit by remember { mutableStateOf(false) }

    // Track refitTrigger to reset fit state when panels change
    var lastRefitTrigger by remember { mutableStateOf<Any?>(null) }

    // Decode screenshot to ImageBitmap
    val imageBitmap = remember(screenshotData) {
        screenshotData?.let {
            try {
                val skiaImage = Image.makeFromEncoded(it)
                skiaImage.toComposeImageBitmap()
            } catch (e: Exception) {
                null
            }
        }
    }

    // Find selected and hovered elements
    val selectedElement = remember(hierarchy, selectedElementId) {
        if (hierarchy != null && selectedElementId != null) {
            LayoutInspectorMockData.findElementById(hierarchy, selectedElementId)
        } else null
    }

    val hoveredElement = remember(hierarchy, hoveredElementId) {
        if (hierarchy != null && hoveredElementId != null) {
            LayoutInspectorMockData.findElementById(hierarchy, hoveredElementId)
        } else null
    }

    // Find non-compliant tap targets (clickable elements smaller than 48x48dp)
    val nonCompliantElements = remember(hierarchy, screenWidth, screenHeight, showTapTargetIssues) {
        if (showTapTargetIssues && hierarchy != null && screenWidth > 0 && screenHeight > 0) {
            findNonCompliantTapTargets(hierarchy, screenWidth, screenHeight)
        } else {
            emptyList()
        }
    }

    Column(modifier = modifier) {
        // Tap target compliance toggle
        TapTargetComplianceToggle(
            enabled = showTapTargetIssues,
            issueCount = nonCompliantElements.size,
            onToggle = onToggleTapTargetIssues,
        )

        // Screenshot viewport
        BoxWithConstraints(
            modifier = Modifier
                .weight(1f)
                .fillMaxWidth()
                .background(colors.text.normal.copy(alpha = 0.03f))
        ) {
            val viewportWidth = constraints.maxWidth.toFloat()
            val viewportHeight = constraints.maxHeight.toFloat()

            // Use actual image dimensions if available, otherwise fall back to screen dimensions
            // This ensures frame sizing and hit testing match the actual screenshot
            val effectiveWidth = imageBitmap?.width ?: screenWidth
            val effectiveHeight = imageBitmap?.height ?: screenHeight

            // Calculate device frame size that fits viewport while maintaining aspect ratio
            val deviceAspectRatio = if (effectiveWidth > 0) effectiveHeight.toFloat() / effectiveWidth.toFloat() else 2.16f
            val padding = 32f
            val maxFrameWidth = (viewportWidth - padding * 2).coerceAtLeast(1f)
            val maxFrameHeight = (viewportHeight - padding * 2).coerceAtLeast(1f)

            // Size to fit within viewport maintaining aspect ratio
            val frameWidthPx: Float
            val frameHeightPx: Float
            if (maxFrameWidth * deviceAspectRatio <= maxFrameHeight) {
                // Width-constrained
                frameWidthPx = maxFrameWidth
                frameHeightPx = maxFrameWidth * deviceAspectRatio
            } else {
                // Height-constrained
                frameHeightPx = maxFrameHeight
                frameWidthPx = maxFrameHeight / deviceAspectRatio
            }

            // Scale factor from frame pixels to device pixels (for hit testing)
            val frameToDeviceScale = if (frameWidthPx > 0) effectiveWidth.toFloat() / frameWidthPx else 1f

            // Reset fit state when refitTrigger changes (e.g., panels toggled)
            LaunchedEffect(refitTrigger) {
                if (refitTrigger != null && refitTrigger != lastRefitTrigger) {
                    lastRefitTrigger = refitTrigger
                    hasInitialFit = false  // Allow refit to happen
                }
            }

            // Auto-fit on initial load or when refit is triggered
            LaunchedEffect(viewportWidth, viewportHeight, frameWidthPx, frameHeightPx, hasInitialFit) {
                if (!hasInitialFit && viewportWidth > 0 && viewportHeight > 0 && frameWidthPx > 0) {
                    // Calculate scale needed to fit device in viewport
                    // The frame is already sized to fit, so scale 1.0 should fit
                    // But if viewport is very narrow, we may need to scale down further
                    val fitScale = minOf(
                        viewportWidth / (frameWidthPx + padding * 2),
                        viewportHeight / (frameHeightPx + padding * 2),
                        1f  // Don't scale up beyond 1.0 initially
                    ).coerceIn(0.3f, 1f)

                    scale = fitScale
                    // Center the device frame in viewport
                    offsetX = (viewportWidth - frameWidthPx * scale) / 2
                    offsetY = (viewportHeight - frameHeightPx * scale) / 2
                    hasInitialFit = true
                }
            }

            // Zoom helper
            fun zoomAroundPoint(newScale: Float, pivotX: Float, pivotY: Float) {
                val oldScale = scale
                val contentX = (pivotX - offsetX) / oldScale
                val contentY = (pivotY - offsetY) / oldScale
                scale = newScale
                offsetX = pivotX - contentX * newScale
                offsetY = pivotY - contentY * newScale
            }

            fun zoomAroundCenter(newScale: Float) {
                zoomAroundPoint(newScale, viewportWidth / 2, viewportHeight / 2)
            }

            // Convert screen coordinates to device pixel coordinates (for hit testing)
            fun screenToDevice(screenX: Float, screenY: Float): Pair<Int, Int> {
                // First convert to frame coordinates, then scale to device pixels
                val frameX = (screenX - offsetX) / scale
                val frameY = (screenY - offsetY) / scale
                val deviceX = (frameX * frameToDeviceScale).roundToInt()
                val deviceY = (frameY * frameToDeviceScale).roundToInt()
                return deviceX to deviceY
            }

            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .clipToBounds()
                    .pointerInput(Unit) {
                        detectDragGestures { change, dragAmount ->
                            change.consume()
                            offsetX += dragAmount.x
                            offsetY += dragAmount.y
                        }
                    }
                    .pointerInput(hierarchy) {
                        detectTapGestures { offset ->
                            if (hierarchy != null) {
                                val (deviceX, deviceY) = screenToDevice(offset.x, offset.y)
                                val element = LayoutInspectorMockData.findElementAt(hierarchy, deviceX, deviceY)
                                onElementSelected(element?.id)
                            }
                        }
                    }
                    .onPointerEvent(PointerEventType.Move) { event ->
                        if (hierarchy != null) {
                            val pos = event.changes.firstOrNull()?.position
                            if (pos != null) {
                                val (deviceX, deviceY) = screenToDevice(pos.x, pos.y)
                                val element = LayoutInspectorMockData.findElementAt(hierarchy, deviceX, deviceY)
                                onElementHovered(element?.id)
                            }
                        }
                    }
                    .onPointerEvent(PointerEventType.Exit) {
                        onElementHovered(null)
                    }
                    .onPointerEvent(PointerEventType.Scroll) { event ->
                        val change = event.changes.firstOrNull() ?: return@onPointerEvent
                        val scrollDelta = change.scrollDelta.y
                        if (scrollDelta != 0f) {
                            val zoomFactor = if (scrollDelta > 0) 0.95f else 1.05f
                            val newScale = (scale * zoomFactor).coerceIn(0.1f, 5f)
                            zoomAroundPoint(newScale, change.position.x, change.position.y)
                        }
                    }
            ) {
                // Device frame - sized to fit viewport with proper aspect ratio
                val localDensity = LocalDensity.current
                val frameWidthDp = with(localDensity) { frameWidthPx.toDp() }
                val frameHeightDp = with(localDensity) { frameHeightPx.toDp() }

                Box(
                    modifier = Modifier
                        .graphicsLayer {
                            scaleX = scale
                            scaleY = scale
                            translationX = offsetX
                            translationY = offsetY
                            transformOrigin = androidx.compose.ui.graphics.TransformOrigin(0f, 0f)
                        }
                        .size(width = frameWidthDp, height = frameHeightDp)
                ) {
                    // Screenshot or placeholder
                    if (imageBitmap != null) {
                        Image(
                            bitmap = imageBitmap,
                            contentDescription = "Device screenshot",
                            modifier = Modifier
                                .fillMaxSize()
                                .drawWithContent {
                                    drawContent()

                                    // Scale factor: drawing context is in frame pixels, bounds are in device pixels
                                    // Use actual image dimensions for accurate overlay positioning.
                                    // This is critical because screenWidth/screenHeight from stream may not match
                                    // the actual screenshot dimensions (e.g., if derived from app window bounds
                                    // which exclude status bar, while screenshot includes full screen).
                                    val imageWidth = imageBitmap.width
                                    val imageHeight = imageBitmap.height
                                    val deviceToFrameScale = if (imageWidth > 0) size.width / imageWidth.toFloat() else 1f

                                    // Draw element overlays
                                    // Hovered element (gray)
                                    if (hoveredElement != null && hoveredElement.id != selectedElementId) {
                                        val bounds = hoveredElement.bounds
                                        val scaledLeft = bounds.left * deviceToFrameScale
                                        val scaledTop = bounds.top * deviceToFrameScale
                                        val scaledWidth = bounds.width * deviceToFrameScale
                                        val scaledHeight = bounds.height * deviceToFrameScale
                                        drawRect(
                                            color = Color.Gray.copy(alpha = 0.5f),
                                            topLeft = Offset(scaledLeft, scaledTop),
                                            size = Size(scaledWidth, scaledHeight),
                                            style = Stroke(width = 2f),
                                        )
                                    }

                                    // Selected element (blue)
                                    if (selectedElement != null) {
                                        val bounds = selectedElement.bounds
                                        val scaledLeft = bounds.left * deviceToFrameScale
                                        val scaledTop = bounds.top * deviceToFrameScale
                                        val scaledWidth = bounds.width * deviceToFrameScale
                                        val scaledHeight = bounds.height * deviceToFrameScale
                                        drawRect(
                                            color = Color(0xFF2196F3),
                                            topLeft = Offset(scaledLeft, scaledTop),
                                            size = Size(scaledWidth, scaledHeight),
                                            style = Stroke(width = 3f),
                                        )
                                        // Fill with semi-transparent blue
                                        drawRect(
                                            color = Color(0xFF2196F3).copy(alpha = 0.1f),
                                            topLeft = Offset(scaledLeft, scaledTop),
                                            size = Size(scaledWidth, scaledHeight),
                                        )
                                    }

                                    // Non-compliant tap targets (orange/red)
                                    if (showTapTargetIssues) {
                                        for (element in nonCompliantElements) {
                                            val bounds = element.bounds
                                            val scaledLeft = bounds.left * deviceToFrameScale
                                            val scaledTop = bounds.top * deviceToFrameScale
                                            val scaledWidth = bounds.width * deviceToFrameScale
                                            val scaledHeight = bounds.height * deviceToFrameScale

                                            // Draw orange border
                                            drawRect(
                                                color = Color(0xFFFF6B00),
                                                topLeft = Offset(scaledLeft, scaledTop),
                                                size = Size(scaledWidth, scaledHeight),
                                                style = Stroke(width = 2f),
                                            )
                                            // Fill with semi-transparent orange
                                            drawRect(
                                                color = Color(0xFFFF6B00).copy(alpha = 0.15f),
                                                topLeft = Offset(scaledLeft, scaledTop),
                                                size = Size(scaledWidth, scaledHeight),
                                            )
                                        }
                                    }
                                }
                        )
                    } else {
                        // Placeholder device frame
                        Box(
                            modifier = Modifier
                                .fillMaxSize()
                                .background(Color(0xFF1A1A1A))
                                .border(2.dp, Color(0xFF333333), RoundedCornerShape(8.dp)),
                            contentAlignment = Alignment.Center,
                        ) {
                            Text(
                                "Awaiting Observation",
                                color = colors.text.normal.copy(alpha = 0.5f),
                                fontSize = 12.sp,
                            )
                        }
                    }
                }

                // Zoom controls
                ZoomControls(
                    scale = scale,
                    onZoomIn = { zoomAroundCenter((scale * 1.2f).coerceAtMost(5f)) },
                    onZoomOut = { zoomAroundCenter((scale / 1.2f).coerceAtLeast(0.1f)) },
                    onFitToScreen = {
                        // Calculate scale to fit and center the frame
                        val fitScale = minOf(
                            viewportWidth / (frameWidthPx + padding * 2),
                            viewportHeight / (frameHeightPx + padding * 2),
                            1f
                        ).coerceIn(0.3f, 1f)
                        scale = fitScale
                        offsetX = (viewportWidth - frameWidthPx * scale) / 2
                        offsetY = (viewportHeight - frameHeightPx * scale) / 2
                    },
                    modifier = Modifier
                        .align(Alignment.BottomEnd)
                        .padding(8.dp),
                )
            }
        }
    }
}

@Composable
private fun ZoomControls(
    scale: Float,
    onZoomIn: () -> Unit,
    onZoomOut: () -> Unit,
    onFitToScreen: () -> Unit,
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
        ZoomButton("-", onClick = onZoomOut)
        ZoomButton("\u2922", onClick = onFitToScreen) // Fit icon

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

/**
 * Toggle for tap target compliance highlighting.
 * Shows the number of non-compliant elements when enabled.
 */
@Composable
private fun TapTargetComplianceToggle(
    enabled: Boolean,
    issueCount: Int,
    onToggle: () -> Unit,
) {
    val colors = JewelTheme.globalColors
    val backgroundColor = if (enabled) {
        Color(0xFFFF6B00).copy(alpha = 0.15f)
    } else {
        colors.text.normal.copy(alpha = 0.05f)
    }
    val borderColor = if (enabled) {
        Color(0xFFFF6B00).copy(alpha = 0.5f)
    } else {
        colors.text.normal.copy(alpha = 0.1f)
    }

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 8.dp, vertical = 4.dp),
        horizontalArrangement = Arrangement.Start,
    ) {
        Row(
            modifier = Modifier
                .background(backgroundColor, RoundedCornerShape(4.dp))
                .border(1.dp, borderColor, RoundedCornerShape(4.dp))
                .clickable(onClick = onToggle)
                .pointerHoverIcon(PointerIcon.Hand)
                .padding(horizontal = 8.dp, vertical = 4.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            // Warning icon
            Text(
                text = if (enabled && issueCount > 0) "\u26A0" else "\u2B1A",  // Warning or empty square
                fontSize = 12.sp,
                color = if (enabled) Color(0xFFFF6B00) else colors.text.normal.copy(alpha = 0.5f),
            )

            Text(
                text = "Tap Targets",
                fontSize = 11.sp,
                color = if (enabled) colors.text.normal else colors.text.normal.copy(alpha = 0.6f),
            )

            // Show issue count when enabled
            if (enabled) {
                Text(
                    text = "($issueCount)",
                    fontSize = 11.sp,
                    color = if (issueCount > 0) Color(0xFFFF6B00) else colors.text.normal.copy(alpha = 0.5f),
                )
            }
        }
    }
}
