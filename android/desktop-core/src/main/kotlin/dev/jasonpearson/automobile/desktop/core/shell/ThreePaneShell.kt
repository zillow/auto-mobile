package dev.jasonpearson.automobile.desktop.core.shell

import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.pointer.PointerIcon
import androidx.compose.ui.input.pointer.pointerHoverIcon
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import dev.jasonpearson.automobile.desktop.core.theme.SharedTheme

/**
 * Top-level three-pane shell that assembles the Xcode-style layout:
 * left sidebar, center canvas + status bar, and right inspector,
 * with a collapsible bottom timeline pane.
 *
 * All pane contents are provided via composable lambdas so callers can
 * inject real or stub implementations.
 */
@Composable
fun ThreePaneShell(
    // Pane visibility
    showLeftPane: Boolean,
    onToggleLeftPane: () -> Unit,
    showRightPane: Boolean,
    onToggleRightPane: () -> Unit,
    showBottomPane: Boolean,
    onToggleBottomPane: () -> Unit,
    // Device info (for status bar)
    deviceName: String?,
    foregroundApp: String?,
    // Status bar data
    crashCount: Int,
    anrCount: Int,
    nonFatalCount: Int,
    toolFailureCount: Int,
    currentFps: Float?,
    currentMemoryMb: Float?,
    isDaemonConnected: Boolean,
    // Pane content slots
    centerContent: @Composable (Modifier) -> Unit,
    leftPaneContent: @Composable () -> Unit,
    rightPaneContent: @Composable () -> Unit,
    bottomPaneContent: @Composable () -> Unit,
    modifier: Modifier = Modifier,
) {
    val colors = SharedTheme.globalColors

    // Resizable pane widths
    var leftPaneWidth by remember { mutableStateOf(220.dp) }
    var rightPaneWidth by remember { mutableStateOf(300.dp) }
    var bottomPaneHeight by remember { mutableStateOf(120.dp) }

    Column(modifier.fillMaxSize()) {
        // macOS title bar spacer
        TitleBarSpacer()

        // Pane toggle toolbar
        PaneToggleToolbar(
            showLeftPane = showLeftPane,
            onToggleLeftPane = onToggleLeftPane,
            showRightPane = showRightPane,
            onToggleRightPane = onToggleRightPane,
            showBottomPane = showBottomPane,
            onToggleBottomPane = onToggleBottomPane,
        )

        // Main 3-pane area
        Row(Modifier.weight(1f)) {
            // Left sidebar (collapsible)
            if (showLeftPane) {
                Box(Modifier.width(leftPaneWidth).fillMaxHeight()) {
                    leftPaneContent()
                }
                VerticalDividerStub(
                    onDrag = { delta ->
                        leftPaneWidth = (leftPaneWidth + delta).coerceIn(150.dp, 400.dp)
                    },
                )
            }

            // Center canvas (flex) + status bar
            Column(Modifier.weight(1f)) {
                centerContent(Modifier.weight(1f))

                // Status bar
                StatusBarStub(
                    crashCount = crashCount,
                    anrCount = anrCount,
                    nonFatalCount = nonFatalCount,
                    toolFailureCount = toolFailureCount,
                    currentFps = currentFps,
                    currentMemoryMb = currentMemoryMb,
                    isDaemonConnected = isDaemonConnected,
                    deviceName = deviceName,
                    foregroundApp = foregroundApp,
                )
            }

            // Right inspector (collapsible)
            if (showRightPane) {
                VerticalDividerStub(
                    onDrag = { delta ->
                        rightPaneWidth = (rightPaneWidth - delta).coerceIn(200.dp, 500.dp)
                    },
                )
                Box(Modifier.width(rightPaneWidth).fillMaxHeight()) {
                    rightPaneContent()
                }
            }
        }

        // Bottom timeline (collapsible)
        if (showBottomPane) {
            HorizontalDividerStub(
                onDrag = { delta ->
                    bottomPaneHeight = (bottomPaneHeight - delta).coerceIn(80.dp, 300.dp)
                },
            )
            Box(Modifier.fillMaxWidth().height(bottomPaneHeight)) {
                bottomPaneContent()
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Stub composables — replaced by real implementations when units 1-7 merge
// ---------------------------------------------------------------------------

/** Reserves space for the macOS native transparent title bar (28dp). */
@Composable
private fun TitleBarSpacer() {
    val isMacOS = remember {
        System.getProperty("os.name")?.lowercase()?.contains("mac") == true
    }
    if (isMacOS) {
        Spacer(Modifier.fillMaxWidth().height(28.dp))
    }
}

/** Thin vertical divider with horizontal drag-to-resize. */
@Composable
private fun VerticalDividerStub(onDrag: (Dp) -> Unit) {
    val density = LocalDensity.current
    Box(
        Modifier
            .width(1.dp)
            .fillMaxHeight()
            .background(SharedTheme.globalColors.text.normal.copy(alpha = 0.12f))
            .pointerHoverIcon(PointerIcon.Hand)
            .pointerInput(Unit) {
                detectDragGestures { _, dragAmount ->
                    with(density) { onDrag(dragAmount.x.toDp()) }
                }
            },
    )
}

/** Thin horizontal divider with vertical drag-to-resize. */
@Composable
private fun HorizontalDividerStub(onDrag: (Dp) -> Unit) {
    val density = LocalDensity.current
    Box(
        Modifier
            .height(1.dp)
            .fillMaxWidth()
            .background(SharedTheme.globalColors.text.normal.copy(alpha = 0.12f))
            .pointerHoverIcon(PointerIcon.Hand)
            .pointerInput(Unit) {
                detectDragGestures { _, dragAmount ->
                    with(density) { onDrag(dragAmount.y.toDp()) }
                }
            },
    )
}

/** Status bar showing failure counts, FPS, memory, and connection state. */
@Composable
private fun StatusBarStub(
    crashCount: Int,
    anrCount: Int,
    nonFatalCount: Int,
    toolFailureCount: Int,
    currentFps: Float?,
    currentMemoryMb: Float?,
    isDaemonConnected: Boolean,
    deviceName: String?,
    foregroundApp: String?,
) {
    val colors = SharedTheme.globalColors
    val totalFailures = crashCount + anrCount + nonFatalCount + toolFailureCount

    Row(
        Modifier
            .fillMaxWidth()
            .height(24.dp)
            .background(colors.panelBackground)
            .padding(horizontal = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        // Connection indicator
        val connColor = if (isDaemonConnected) Color(0xFF4CAF50) else colors.text.normal.copy(alpha = 0.3f)
        Text(
            text = if (isDaemonConnected) "Connected" else "Disconnected",
            fontSize = 10.sp,
            color = connColor,
        )

        Spacer(Modifier.width(12.dp))

        // Device / app
        if (deviceName != null) {
            Text(
                text = deviceName + (foregroundApp?.let { " — $it" } ?: ""),
                fontSize = 10.sp,
                color = colors.text.normal.copy(alpha = 0.6f),
                maxLines = 1,
            )
        }

        Spacer(Modifier.weight(1f))

        // Failure counts
        if (totalFailures > 0) {
            Text(
                text = "Failures: $totalFailures",
                fontSize = 10.sp,
                color = if (crashCount > 0) colors.text.error else colors.text.warning,
            )
            Spacer(Modifier.width(12.dp))
        }

        // FPS
        currentFps?.let { fps ->
            Text(
                text = "FPS: ${fps.toInt()}",
                fontSize = 10.sp,
                color = when {
                    fps >= 55f -> Color(0xFF4CAF50)
                    fps >= 30f -> colors.text.warning
                    else -> colors.text.error
                },
            )
            Spacer(Modifier.width(12.dp))
        }

        // Memory
        currentMemoryMb?.let { mem ->
            Text(
                text = "Mem: ${mem.toInt()} MB",
                fontSize = 10.sp,
                color = colors.text.normal.copy(alpha = 0.6f),
            )
        }
    }
}

/** Toolbar row with pane toggle buttons (Xcode-style). */
@Composable
private fun PaneToggleToolbar(
    showLeftPane: Boolean,
    onToggleLeftPane: () -> Unit,
    showRightPane: Boolean,
    onToggleRightPane: () -> Unit,
    showBottomPane: Boolean,
    onToggleBottomPane: () -> Unit,
) {
    val colors = SharedTheme.globalColors
    Row(
        Modifier
            .fillMaxWidth()
            .height(28.dp)
            .background(colors.panelBackground)
            .padding(horizontal = 8.dp),
        horizontalArrangement = Arrangement.End,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        PaneToggleButton(
            label = "Left",
            isActive = showLeftPane,
            onClick = onToggleLeftPane,
        )
        Spacer(Modifier.width(4.dp))
        PaneToggleButton(
            label = "Bottom",
            isActive = showBottomPane,
            onClick = onToggleBottomPane,
        )
        Spacer(Modifier.width(4.dp))
        PaneToggleButton(
            label = "Right",
            isActive = showRightPane,
            onClick = onToggleRightPane,
        )
    }
}

@Composable
private fun PaneToggleButton(
    label: String,
    isActive: Boolean,
    onClick: () -> Unit,
) {
    val colors = SharedTheme.globalColors
    Text(
        text = label,
        fontSize = 10.sp,
        color = if (isActive) colors.text.info else colors.text.normal.copy(alpha = 0.4f),
        modifier = Modifier
            .clickable(onClick = onClick)
            .padding(horizontal = 6.dp, vertical = 2.dp),
    )
}
