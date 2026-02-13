@file:OptIn(androidx.compose.ui.ExperimentalComposeUiApi::class)

package dev.jasonpearson.automobile.ide.layout

import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
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
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
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
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.focus.focusTarget
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.toComposeImageBitmap
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.input.key.key
import androidx.compose.ui.input.key.onKeyEvent
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
import androidx.compose.ui.input.pointer.PointerEvent
import androidx.compose.ui.input.pointer.isCtrlPressed
import androidx.compose.ui.input.pointer.isMetaPressed
import kotlin.math.roundToInt

private val IS_MAC = System.getProperty("os.name", "").contains("Mac", ignoreCase = true)

/**
 * Transform element bounds from the original (unrotated) hierarchy coordinate system
 * to the rotated display coordinate system.
 *
 * @param bounds Original bounds in hierarchy coordinates
 * @param rotation Device rotation (0=portrait, 1=landscape 270°CW, 2=reverse, 3=landscape 90°CW)
 * @param rootWidth Width of the root element in hierarchy coordinates (unrotated)
 * @param rootHeight Height of the root element in hierarchy coordinates (unrotated)
 * @return Transformed bounds as (left, top, width, height) in rotated coordinates
 */
private fun transformBoundsForRotation(
    bounds: ElementBounds,
    rotation: Int,
    rootWidth: Int,
    rootHeight: Int,
): FloatArray {
    // Returns [left, top, width, height] in the rotated coordinate space
    return when (rotation) {
        1 -> {
            // Landscape (home button on right): rotate 270° CW
            // Original (x, y) -> rotated (y, rootWidth - x - width)
            floatArrayOf(
                bounds.top.toFloat(),
                (rootWidth - bounds.right).toFloat(),
                bounds.height.toFloat(),
                bounds.width.toFloat(),
            )
        }
        2 -> {
            // Reverse portrait: rotate 180°
            floatArrayOf(
                (rootWidth - bounds.right).toFloat(),
                (rootHeight - bounds.bottom).toFloat(),
                bounds.width.toFloat(),
                bounds.height.toFloat(),
            )
        }
        3 -> {
            // Reverse landscape (home button on left): rotate 90° CW
            // Original (x, y) -> rotated (rootHeight - y - height, x)
            floatArrayOf(
                (rootHeight - bounds.bottom).toFloat(),
                bounds.left.toFloat(),
                bounds.height.toFloat(),
                bounds.width.toFloat(),
            )
        }
        else -> {
            // No rotation
            floatArrayOf(
                bounds.left.toFloat(),
                bounds.top.toFloat(),
                bounds.width.toFloat(),
                bounds.height.toFloat(),
            )
        }
    }
}

private fun PointerEvent.isZoomModifierPressed(): Boolean =
    if (IS_MAC) keyboardModifiers.isMetaPressed else keyboardModifiers.isCtrlPressed

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
    rotation: Int = 0,
    hierarchy: UIElementInfo?,
    selectedElementId: String?,
    hoveredElementId: String?,
    flashElementId: String? = null,
    onFlashComplete: () -> Unit = {},
    onElementSelected: (String?) -> Unit,
    onElementHovered: (String?) -> Unit,
    showTapTargetIssues: Boolean = false,
    onToggleTapTargetIssues: () -> Unit = {},
    connectionStatus: ConnectionStatus = ConnectionStatus.Connected,
    socketExists: Boolean = true,
    onRestartDaemon: (() -> Unit)? = null,
    elementMap: Map<String, UIElementInfo>? = null,
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

    // Track previous viewport dimensions for auto-centering on resize
    var prevViewportWidth by remember { mutableFloatStateOf(0f) }
    var prevViewportHeight by remember { mutableFloatStateOf(0f) }

    // Decode raw screenshot without rotation
    val rawBitmap = remember(screenshotData) {
        screenshotData?.let {
            try {
                Image.makeFromEncoded(it).toComposeImageBitmap()
            } catch (e: Exception) {
                null
            }
        }
    }

    // Detect rotation needed to align the screenshot with the hierarchy coordinate system.
    // iOS screenshots may arrive in native pixel orientation (portrait) even when
    // the device is in landscape, while hierarchy bounds are in display orientation.
    // We rotate the screenshot to match the hierarchy so text reads correctly.
    val screenshotRotation = remember(rawBitmap, hierarchy, rotation) {
        // If the server explicitly reports rotation, use that
        if (rotation != 0) return@remember rotation

        // Auto-detect from screenshot vs hierarchy dimension mismatch
        val imgW = rawBitmap?.width ?: 0
        val imgH = rawBitmap?.height ?: 0
        val rootW = hierarchy?.bounds?.width ?: 0
        val rootH = hierarchy?.bounds?.height ?: 0
        if (imgW <= 0 || imgH <= 0 || rootW <= 0 || rootH <= 0) return@remember 0

        val imageIsPortrait = imgH > imgW
        val boundsIsPortrait = rootH > rootW

        if (imageIsPortrait && !boundsIsPortrait) {
            // Portrait screenshot, landscape bounds → rotate 90° CW to landscape
            3
        } else if (!imageIsPortrait && boundsIsPortrait) {
            // Landscape screenshot, portrait bounds → rotate 270° CW to portrait
            1
        } else {
            0
        }
    }

    // Apply rotation to align the screenshot with the hierarchy coordinate system.
    // After this, the image orientation matches the hierarchy bounds so overlays
    // and hit testing can use direct coordinate mapping without transformation.
    val imageBitmap = remember(rawBitmap, screenshotRotation, screenshotData) {
        val original = rawBitmap ?: return@remember null
        if (screenshotRotation == 0) return@remember original

        val angleDegrees = when (screenshotRotation) {
            1 -> 270f
            2 -> 180f
            3 -> 90f
            else -> return@remember original
        }

        try {
            val w = original.width
            val h = original.height
            val swapDims = screenshotRotation == 1 || screenshotRotation == 3
            val newW = if (swapDims) h else w
            val newH = if (swapDims) w else h

            val skiaImage = Image.makeFromEncoded(screenshotData!!)
            val surface = org.jetbrains.skia.Surface.makeRasterN32Premul(newW, newH)
            val canvas = surface.canvas
            canvas.translate(newW / 2f, newH / 2f)
            canvas.rotate(angleDegrees)
            canvas.translate(-w / 2f, -h / 2f)
            canvas.drawImage(skiaImage, 0f, 0f)
            surface.makeImageSnapshot().toComposeImageBitmap()
        } catch (e: Exception) {
            original
        }
    }

    // Screenshot has been rotated to match hierarchy, so no bounds rotation is needed.
    // All overlay and hit testing code uses identity transforms (boundsRotation=0).
    val boundsRotation = 0
    val isLandscape = false

    // Find selected and hovered elements — O(1) map lookups instead of DFS
    val selectedElement = remember(elementMap, selectedElementId) {
        selectedElementId?.let { elementMap?.get(it) }
    }

    val hoveredElement = remember(elementMap, hoveredElementId) {
        hoveredElementId?.let { elementMap?.get(it) }
    }

    // Flash element for highlight animation on double-click
    val flashElement = remember(elementMap, flashElementId) {
        flashElementId?.let { elementMap?.get(it) }
    }

    // Flash animation state
    var flashAlpha by remember { mutableFloatStateOf(0f) }
    LaunchedEffect(flashElementId) {
        if (flashElementId != null) {
            // Animate flash: bright -> fade out
            repeat(3) { // 3 flashes
                flashAlpha = 0.8f
                kotlinx.coroutines.delay(100)
                flashAlpha = 0.3f
                kotlinx.coroutines.delay(100)
            }
            flashAlpha = 0f
            onFlashComplete()
        }
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
        // Tap target compliance toggle - top padding to clear the Layout/Navigation toggle overlay
        TapTargetComplianceToggle(
            enabled = showTapTargetIssues,
            issueCount = nonCompliantElements.size,
            onToggle = onToggleTapTargetIssues,
            modifier = Modifier.padding(top = 36.dp),
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

            // Scale factor from frame pixels to device pixels (for aspect ratio calculations only)
            val frameToDeviceScale = if (frameWidthPx > 0) effectiveWidth.toFloat() / frameWidthPx else 1f

            // When the image is rotated, the hierarchy's width/height are in the original
            // (unrotated) coordinate system. After rotation, the frame width corresponds
            // to the hierarchy's height (for rotation 1/3) or width (for rotation 0/2).
            val rootBoundsWidth = hierarchy?.bounds?.width ?: effectiveWidth
            val rootBoundsHeight = hierarchy?.bounds?.height ?: effectiveHeight
            // The "rotated root width" is the root dimension that maps to the frame width
            val rotatedRootWidth = if (isLandscape) rootBoundsHeight else rootBoundsWidth

            // Scale factor from frame pixels to hierarchy bounds coordinates (for hit testing).
            val frameToHierarchyScale = if (frameWidthPx > 0) rotatedRootWidth.toFloat() / frameWidthPx else 1f

            // Reset fit state when refitTrigger changes (e.g., panels toggled)
            LaunchedEffect(refitTrigger) {
                if (refitTrigger != null && refitTrigger != lastRefitTrigger) {
                    lastRefitTrigger = refitTrigger
                    hasInitialFit = false  // Allow refit to happen
                }
            }

            // Auto-center when viewport dimensions change (window resize)
            LaunchedEffect(viewportWidth, viewportHeight) {
                if (hasInitialFit && prevViewportWidth > 0 && prevViewportHeight > 0) {
                    // Adjust offset to keep content centered when viewport resizes
                    val deltaX = (viewportWidth - prevViewportWidth) / 2
                    val deltaY = (viewportHeight - prevViewportHeight) / 2
                    offsetX += deltaX
                    offsetY += deltaY
                }
                prevViewportWidth = viewportWidth
                prevViewportHeight = viewportHeight
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

                    // Only change scale if it would increase (don't auto-shrink on window resize)
                    // This allows expanding when window grows but keeps current zoom when shrinking
                    if (fitScale > scale || scale == 1f) {
                        scale = fitScale
                    }
                    // Center the device frame in viewport
                    offsetX = (viewportWidth - frameWidthPx * scale) / 2
                    offsetY = (viewportHeight - frameHeightPx * scale) / 2
                    hasInitialFit = true
                    // Initialize previous viewport dimensions
                    prevViewportWidth = viewportWidth
                    prevViewportHeight = viewportHeight
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

            // Convert screen coordinates to hierarchy bounds coordinates (for hit testing).
            // Uses the same coordinate system as element.bounds so findElementAt works correctly.
            // When the screenshot is rotated, we reverse the rotation to get back to
            // the original hierarchy coordinate system.
            fun screenToHierarchyCoords(screenX: Float, screenY: Float): Pair<Int, Int> {
                val frameX = (screenX - offsetX) / scale
                val frameY = (screenY - offsetY) / scale
                // frameX/frameY are in the rotated display space — convert back to hierarchy space
                val hierX: Int
                val hierY: Int
                when (boundsRotation) {
                    1 -> {
                        // Reverse of: rotated(x,y) = (origY, rootW - origX)
                        // So: origX = rootW - frameY*scale, origY = frameX*scale
                        val s = frameToHierarchyScale
                        hierX = (rootBoundsWidth - (frameY * s)).roundToInt()
                        hierY = (frameX * s).roundToInt()
                    }
                    2 -> {
                        val s = frameToHierarchyScale
                        hierX = (rootBoundsWidth - (frameX * s)).roundToInt()
                        hierY = (rootBoundsHeight - (frameY * s)).roundToInt()
                    }
                    3 -> {
                        // Reverse of: rotated(x,y) = (rootH - origY, origX)
                        val s = frameToHierarchyScale
                        hierX = (frameY * s).roundToInt()
                        hierY = (rootBoundsHeight - (frameX * s)).roundToInt()
                    }
                    else -> {
                        hierX = (frameX * frameToHierarchyScale).roundToInt()
                        hierY = (frameY * frameToHierarchyScale).roundToInt()
                    }
                }
                return hierX to hierY
            }

            // Focus requester for keyboard events
            val focusRequester = remember { FocusRequester() }

            // Request focus when an element is selected
            LaunchedEffect(selectedElementId) {
                if (selectedElementId != null) {
                    focusRequester.requestFocus()
                }
            }

            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .clipToBounds()
                    .focusRequester(focusRequester)
                    .focusTarget()
                    .onKeyEvent { keyEvent ->
                        // Handle Escape to deselect
                        if (keyEvent.key == Key.Escape && selectedElementId != null) {
                            onElementSelected(null)
                            true
                        } else {
                            false
                        }
                    }
                    .pointerInput(Unit) {
                        // Allow pan/drag to move the viewport
                        detectDragGestures { change, dragAmount ->
                            change.consume()
                            offsetX += dragAmount.x
                            offsetY += dragAmount.y
                        }
                    }
                    .pointerInput(hierarchy) {
                        detectTapGestures { offset ->
                            if (hierarchy != null) {
                                val (deviceX, deviceY) = screenToHierarchyCoords(offset.x, offset.y)
                                val element = LayoutInspectorMockData.findElementAt(hierarchy, deviceX, deviceY)
                                onElementSelected(element?.id)
                            }
                        }
                    }
                    .onPointerEvent(PointerEventType.Move) { event ->
                        if (hierarchy != null) {
                            val pos = event.changes.firstOrNull()?.position
                            if (pos != null) {
                                val (deviceX, deviceY) = screenToHierarchyCoords(pos.x, pos.y)
                                val element = LayoutInspectorMockData.findElementAt(hierarchy, deviceX, deviceY)
                                onElementHovered(element?.id)
                            }
                        }
                    }
                    .onPointerEvent(PointerEventType.Exit) {
                        onElementHovered(null)
                    }
                    .onPointerEvent(PointerEventType.Scroll) { event ->
                        // Only allow zoom when Cmd (macOS) / Ctrl (other) is held
                        if (!event.isZoomModifierPressed()) return@onPointerEvent
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

                                    // Scale factor: drawing context is in frame pixels, bounds may be in:
                                    // - iOS points (logical pixels, need scaling by screen scale factor)
                                    // - Android pixels (device pixels, match screenshot directly)
                                    //
                                    // When rotated, the frame width corresponds to the rotated root dimension.
                                    // We use rotatedRootWidth (computed above) so overlays align with the rotated screenshot.
                                    val boundsToFrameScale = if (rotatedRootWidth > 0) size.width / rotatedRootWidth.toFloat() else 1f

                                    // Helper to get scaled overlay rect from element bounds,
                                    // applying rotation transform before scaling.
                                    fun overlayRect(bounds: ElementBounds): FloatArray {
                                        val t = transformBoundsForRotation(bounds, boundsRotation, rootBoundsWidth, rootBoundsHeight)
                                        // t = [left, top, width, height] in rotated coords
                                        return floatArrayOf(
                                            t[0] * boundsToFrameScale,
                                            t[1] * boundsToFrameScale,
                                            t[2] * boundsToFrameScale,
                                            t[3] * boundsToFrameScale,
                                        )
                                    }

                                    // Draw element overlays
                                    // Hovered element (gray)
                                    if (hoveredElement != null && hoveredElement.id != selectedElementId) {
                                        val r = overlayRect(hoveredElement.bounds)
                                        drawRect(
                                            color = Color.Gray.copy(alpha = 0.5f),
                                            topLeft = Offset(r[0], r[1]),
                                            size = Size(r[2], r[3]),
                                            style = Stroke(width = 2f),
                                        )
                                    }

                                    // Selected element (blue)
                                    if (selectedElement != null) {
                                        val r = overlayRect(selectedElement.bounds)
                                        drawRect(
                                            color = Color(0xFF2196F3),
                                            topLeft = Offset(r[0], r[1]),
                                            size = Size(r[2], r[3]),
                                            style = Stroke(width = 3f),
                                        )
                                        // Fill with semi-transparent blue
                                        drawRect(
                                            color = Color(0xFF2196F3).copy(alpha = 0.1f),
                                            topLeft = Offset(r[0], r[1]),
                                            size = Size(r[2], r[3]),
                                        )
                                    }

                                    // Flash element highlight (yellow/gold flash on double-click)
                                    if (flashElement != null && flashAlpha > 0f) {
                                        val r = overlayRect(flashElement.bounds)
                                        // Draw bright yellow border
                                        drawRect(
                                            color = Color(0xFFFFD700).copy(alpha = flashAlpha),
                                            topLeft = Offset(r[0], r[1]),
                                            size = Size(r[2], r[3]),
                                            style = Stroke(width = 4f),
                                        )
                                        // Fill with semi-transparent yellow
                                        drawRect(
                                            color = Color(0xFFFFD700).copy(alpha = flashAlpha * 0.3f),
                                            topLeft = Offset(r[0], r[1]),
                                            size = Size(r[2], r[3]),
                                        )
                                    }

                                    // Non-compliant tap targets (orange/red)
                                    if (showTapTargetIssues) {
                                        for (element in nonCompliantElements) {
                                            val r = overlayRect(element.bounds)
                                            // Draw orange border
                                            drawRect(
                                                color = Color(0xFFFF6B00),
                                                topLeft = Offset(r[0], r[1]),
                                                size = Size(r[2], r[3]),
                                                style = Stroke(width = 2f),
                                            )
                                            // Fill with semi-transparent orange
                                            drawRect(
                                                color = Color(0xFFFF6B00).copy(alpha = 0.15f),
                                                topLeft = Offset(r[0], r[1]),
                                                size = Size(r[2], r[3]),
                                            )
                                        }
                                    }
                                }
                        )
                    } else {
                        // Placeholder device frame - context-aware based on connection status
                        Box(
                            modifier = Modifier
                                .fillMaxSize()
                                .background(Color(0xFF1A1A1A))
                                .border(2.dp, Color(0xFF333333), RoundedCornerShape(8.dp)),
                            contentAlignment = Alignment.Center,
                        ) {
                            when {
                                connectionStatus == ConnectionStatus.Disconnected && !socketExists -> {
                                    // Daemon is down - show restart button
                                    Column(
                                        horizontalAlignment = Alignment.CenterHorizontally,
                                        verticalArrangement = Arrangement.spacedBy(12.dp),
                                    ) {
                                        Text(
                                            "Device Disconnected",
                                            color = colors.text.normal.copy(alpha = 0.5f),
                                            fontSize = 12.sp,
                                        )
                                        if (onRestartDaemon != null) {
                                            Box(
                                                modifier = Modifier
                                                    .background(colors.text.normal.copy(alpha = 0.1f), RoundedCornerShape(4.dp))
                                                    .border(1.dp, colors.text.normal.copy(alpha = 0.2f), RoundedCornerShape(4.dp))
                                                    .clickable(onClick = onRestartDaemon)
                                                    .pointerHoverIcon(PointerIcon.Hand)
                                                    .padding(horizontal = 12.dp, vertical = 6.dp),
                                            ) {
                                                Text(
                                                    "Restart MCP Daemon",
                                                    color = colors.text.normal.copy(alpha = 0.7f),
                                                    fontSize = 11.sp,
                                                )
                                            }
                                        }
                                    }
                                }
                                connectionStatus == ConnectionStatus.Disconnected -> {
                                    // Socket exists but device gone
                                    Text(
                                        "Device Disconnected",
                                        color = colors.text.normal.copy(alpha = 0.5f),
                                        fontSize = 12.sp,
                                    )
                                }
                                connectionStatus == ConnectionStatus.Connecting -> {
                                    // Reconnecting state with spinner
                                    Column(
                                        horizontalAlignment = Alignment.CenterHorizontally,
                                        verticalArrangement = Arrangement.spacedBy(8.dp),
                                    ) {
                                        Text(
                                            "Device Disconnected",
                                            color = colors.text.normal.copy(alpha = 0.5f),
                                            fontSize = 12.sp,
                                        )
                                        ReconnectingSpinner()
                                        Text(
                                            "Reconnecting...",
                                            color = colors.text.normal.copy(alpha = 0.25f),
                                            fontSize = 10.sp,
                                        )
                                    }
                                }
                                else -> {
                                    Text(
                                        "Awaiting Observation",
                                        color = colors.text.normal.copy(alpha = 0.5f),
                                        fontSize = 12.sp,
                                    )
                                }
                            }
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
            maxLines = 1,
            softWrap = false,
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
 * Uses finger emoji when width is too narrow.
 */
@Composable
private fun TapTargetComplianceToggle(
    enabled: Boolean,
    issueCount: Int,
    onToggle: () -> Unit,
    modifier: Modifier = Modifier,
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

    BoxWithConstraints(
        modifier = modifier.padding(horizontal = 8.dp, vertical = 4.dp),
    ) {
        val isCompact = maxWidth < 150.dp

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
            // Checkbox indicator
            Text(
                text = if (enabled) "\u2611" else "\u2610",  // ☑ checked or ☐ unchecked
                fontSize = 12.sp,
                color = if (enabled) Color(0xFFFF6B00) else colors.text.normal.copy(alpha = 0.5f),
            )

            if (isCompact) {
                // Finger emoji for compact mode
                Text(
                    text = "\uD83D\uDC46",  // 👆
                    fontSize = 12.sp,
                )
            } else {
                Text(
                    text = "Tap Targets",
                    fontSize = 11.sp,
                    maxLines = 1,
                    softWrap = false,
                    color = if (enabled) colors.text.normal else colors.text.normal.copy(alpha = 0.6f),
                )
            }

            // Show issue count when enabled
            if (enabled) {
                Text(
                    text = if (isCompact) "$issueCount" else "($issueCount)",
                    fontSize = 11.sp,
                    maxLines = 1,
                    softWrap = false,
                    color = if (issueCount > 0) Color(0xFFFF6B00) else colors.text.normal.copy(alpha = 0.5f),
                )
            }
        }
    }
}

/**
 * Low-contrast reconnecting spinner with rotating dots.
 */
@Composable
private fun ReconnectingSpinner() {
    val infiniteTransition = rememberInfiniteTransition(label = "reconnecting")
    val angle by infiniteTransition.animateFloat(
        initialValue = 0f,
        targetValue = 360f,
        animationSpec = infiniteRepeatable(
            animation = tween(durationMillis = 1200, easing = LinearEasing),
            repeatMode = RepeatMode.Restart,
        ),
        label = "rotation",
    )

    val colors = JewelTheme.globalColors
    val dotColor = colors.text.normal.copy(alpha = 0.2f)

    Canvas(modifier = Modifier.size(24.dp)) {
        val centerX = size.width / 2
        val centerY = size.height / 2
        val radius = size.width / 2 - 4.dp.toPx()
        val dotRadius = 2.dp.toPx()
        val dotCount = 8

        for (i in 0 until dotCount) {
            val dotAngle = Math.toRadians((angle + i * 360.0 / dotCount).toDouble())
            val alpha = 0.15f + 0.15f * (i.toFloat() / dotCount)
            val x = centerX + radius * kotlin.math.cos(dotAngle).toFloat()
            val y = centerY + radius * kotlin.math.sin(dotAngle).toFloat()
            drawCircle(
                color = dotColor.copy(alpha = alpha),
                radius = dotRadius,
                center = androidx.compose.ui.geometry.Offset(x, y),
            )
        }
    }
}
