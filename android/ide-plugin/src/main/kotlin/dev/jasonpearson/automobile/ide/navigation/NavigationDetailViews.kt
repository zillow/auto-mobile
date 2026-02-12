package dev.jasonpearson.automobile.ide.navigation

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.input.pointer.PointerIcon
import androidx.compose.ui.input.pointer.pointerHoverIcon
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.jetbrains.jewel.foundation.theme.JewelTheme
import org.jetbrains.jewel.ui.component.Link
import org.jetbrains.jewel.ui.component.Text

@Composable
fun FlowMapListView(
    screens: List<ScreenNode>,
    transitions: List<ScreenTransition>,
    onScreenSelected: (String) -> Unit,
    onTransitionSelected: (String) -> Unit,
) {
    val colors = JewelTheme.globalColors
    val scrollState = rememberScrollState()

    Column(modifier = Modifier.fillMaxSize().verticalScroll(scrollState)) {
        Text("Flow Map", fontSize = 16.sp)
        Text(
            "${screens.size} screens discovered • ${transitions.size} transitions",
            color = colors.text.normal.copy(alpha = 0.6f),
            fontSize = 12.sp,
            modifier = Modifier.padding(top = 4.dp, bottom = 16.dp),
        )

        // Screens section
        Text("Screens", fontSize = 13.sp, color = colors.text.normal.copy(alpha = 0.8f))
        Spacer(Modifier.height(8.dp))

        screens.forEach { screen ->
            ScreenNodeRow(
                screen = screen,
                onClick = { onScreenSelected(screen.id) },
            )
            Spacer(Modifier.height(4.dp))
        }

        Spacer(Modifier.height(16.dp))

        // Transitions section
        Text("Transitions", fontSize = 13.sp, color = colors.text.normal.copy(alpha = 0.8f))
        Spacer(Modifier.height(8.dp))

        transitions.forEach { transition ->
            TransitionRow(
                transition = transition,
                onClick = { onTransitionSelected(transition.id) },
            )
            Spacer(Modifier.height(4.dp))
        }
    }
}

@Composable
fun ScreenNodeRow(screen: ScreenNode, onClick: () -> Unit) {
    val colors = JewelTheme.globalColors
    val coverageColor = when {
        screen.testCoverage >= 80 -> Color(0xFF4CAF50)
        screen.testCoverage >= 50 -> Color(0xFFFFC107)
        else -> Color(0xFFFF5722)
    }

    Row(
        modifier =
        Modifier.fillMaxWidth()
            .background(colors.text.normal.copy(alpha = 0.05f), RoundedCornerShape(6.dp))
            .clickable(onClick = onClick)
            .pointerHoverIcon(PointerIcon.Hand)
            .padding(horizontal = 12.dp, vertical = 8.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(modifier = Modifier.weight(1f)) {
            Row(
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(screen.name, fontSize = 13.sp)
                Text(
                    screen.type,
                    fontSize = 10.sp,
                    color = colors.text.normal.copy(alpha = 0.5f),
                    modifier =
                    Modifier.background(colors.text.normal.copy(alpha = 0.1f), RoundedCornerShape(3.dp))
                        .padding(horizontal = 4.dp, vertical = 1.dp),
                )
            }
            Text(
                screen.packageName,
                fontSize = 11.sp,
                color = colors.text.normal.copy(alpha = 0.4f),
            )
        }

        Row(
            horizontalArrangement = Arrangement.spacedBy(12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            // Coverage indicator
            Row(
                horizontalArrangement = Arrangement.spacedBy(4.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Box(
                    modifier = Modifier.size(8.dp).background(coverageColor, CircleShape),
                )
                Text(
                    "${screen.testCoverage}%",
                    fontSize = 11.sp,
                    color = colors.text.normal.copy(alpha = 0.6f),
                )
            }

            // Transition count
            Text(
                "${screen.transitionCount} →",
                fontSize = 11.sp,
                color = colors.text.normal.copy(alpha = 0.5f),
            )
        }
    }
}

@Composable
fun TransitionRow(
    transition: ScreenTransition,
    onClick: () -> Unit,
    currentScreen: String? = null,  // Current screen name - won't be a link
    onScreenClick: ((String) -> Unit)? = null,  // Optional: click on screen name to navigate
) {
    val colors = JewelTheme.globalColors
    val triggerIcon = when (transition.trigger) {
        "tap" -> "👆"
        "back" -> "←"
        "swipe" -> "↔"
        "intent" -> "⚡"
        else -> "•"
    }

    Row(
        modifier =
        Modifier.fillMaxWidth()
            .background(colors.text.normal.copy(alpha = 0.03f), RoundedCornerShape(6.dp))
            .then(
                if (onScreenClick == null) Modifier.clickable(onClick = onClick).pointerHoverIcon(PointerIcon.Hand)
                else Modifier
            )
            .padding(horizontal = 12.dp, vertical = 8.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Row(
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier.weight(1f),
        ) {
            Text(triggerIcon, fontSize = 12.sp)
            // From screen - only link if not current screen
            if (onScreenClick != null && transition.fromScreen != currentScreen) {
                Link(transition.fromScreen, onClick = { onScreenClick(transition.fromScreen) })
            } else {
                Text(transition.fromScreen, fontSize = 12.sp)
            }
            Text("→", fontSize = 12.sp, color = colors.text.normal.copy(alpha = 0.4f))
            // To screen - only link if not current screen
            if (onScreenClick != null && transition.toScreen != currentScreen) {
                Link(transition.toScreen, onClick = { onScreenClick(transition.toScreen) })
            } else {
                Text(transition.toScreen, fontSize = 12.sp)
            }
            transition.element?.let {
                Text(
                    "($it)",
                    fontSize = 11.sp,
                    color = colors.text.normal.copy(alpha = 0.4f),
                )
            }
        }

        Row(
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            // Show traversal count (or latency if available)
            if (transition.avgLatencyMs > 0) {
                Text(
                    "${transition.avgLatencyMs}ms",
                    fontSize = 11.sp,
                    color = colors.text.normal.copy(alpha = 0.5f),
                )
            } else {
                Text(
                    "${transition.traversalCount}x",
                    fontSize = 11.sp,
                    color = colors.text.normal.copy(alpha = 0.5f),
                )
            }
            if (transition.failureRate > 0) {
                Text(
                    "${(transition.failureRate * 100).toInt()}% fail",
                    fontSize = 10.sp,
                    color = Color(0xFFFF5722).copy(alpha = 0.8f),
                )
            }
        }
    }
}

@Composable
fun ScreenDetailView(
    screen: ScreenNode,
    transitions: List<ScreenTransition>,
    onBack: () -> Unit,
    onScreenSelected: (String) -> Unit,  // Navigate to another screen by name
    screenshotLoader: ScreenshotLoader? = null,
) {
    val colors = JewelTheme.globalColors
    val scrollState = rememberScrollState()
    val outgoing = transitions.filter { it.fromScreen == screen.name }
    val incoming = transitions.filter { it.toScreen == screen.name }

    // Screenshot loading state
    var screenshotBitmap by remember { mutableStateOf<ImageBitmap?>(null) }
    var isLoadingScreenshot by remember { mutableStateOf(false) }

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

    Column(modifier = Modifier.fillMaxSize().verticalScroll(scrollState).padding(16.dp)) {
        Link("← Flow Map", onClick = onBack)
        Spacer(Modifier.height(12.dp))

        // Header
        Row(
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(screen.name, fontSize = 16.sp)
            Text(
                screen.type,
                fontSize = 11.sp,
                color = colors.text.normal.copy(alpha = 0.6f),
                modifier =
                Modifier.background(colors.text.normal.copy(alpha = 0.1f), RoundedCornerShape(4.dp))
                    .padding(horizontal = 6.dp, vertical = 2.dp),
            )
        }
        Text(
            screen.packageName,
            fontSize = 12.sp,
            color = colors.text.normal.copy(alpha = 0.5f),
            modifier = Modifier.padding(top = 2.dp),
        )

        Spacer(Modifier.height(20.dp))

        // Screenshot
        Box(
            modifier =
            Modifier.width(120.dp)
                .height(220.dp)
                .clip(RoundedCornerShape(8.dp))
                .background(colors.text.normal.copy(alpha = 0.08f)),
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
                    Text("Loading...", fontSize = 11.sp, color = colors.text.normal.copy(alpha = 0.3f))
                }
                else -> {
                    Text("No screenshot", fontSize = 11.sp, color = colors.text.normal.copy(alpha = 0.3f))
                }
            }
        }

        Spacer(Modifier.height(20.dp))

        // Stats row
        Row(horizontalArrangement = Arrangement.spacedBy(24.dp)) {
            StatItem("Test Coverage", "${screen.testCoverage}%")
            StatItem("Outgoing", "${outgoing.size}")
            StatItem("Incoming", "${incoming.size}")
        }

        Spacer(Modifier.height(20.dp))

        // Outgoing transitions - click screen name to navigate
        if (outgoing.isNotEmpty()) {
            Text("Outgoing Transitions", fontSize = 13.sp, color = colors.text.normal.copy(alpha = 0.8f))
            Spacer(Modifier.height(8.dp))
            outgoing.forEach { t ->
                TransitionRow(
                    transition = t,
                    onClick = { },
                    currentScreen = screen.name,
                    onScreenClick = onScreenSelected,
                )
                Spacer(Modifier.height(4.dp))
            }
            Spacer(Modifier.height(12.dp))
        }

        // Incoming transitions - click screen name to navigate
        if (incoming.isNotEmpty()) {
            Text("Incoming Transitions", fontSize = 13.sp, color = colors.text.normal.copy(alpha = 0.8f))
            Spacer(Modifier.height(8.dp))
            incoming.forEach { t ->
                TransitionRow(
                    transition = t,
                    onClick = { },
                    currentScreen = screen.name,
                    onScreenClick = onScreenSelected,
                )
                Spacer(Modifier.height(4.dp))
            }
        }
    }
}

@Composable
fun StatItem(label: String, value: String) {
    val colors = JewelTheme.globalColors
    Column {
        Text(value, fontSize = 18.sp)
        Text(label, fontSize = 11.sp, color = colors.text.normal.copy(alpha = 0.5f))
    }
}

@Composable
fun TransitionDetailView(
    transition: ScreenTransition,
    onBack: () -> Unit,
    onScreenSelected: (String) -> Unit,  // Navigate to a screen by name
) {
    val colors = JewelTheme.globalColors
    val scrollState = rememberScrollState()

    Column(modifier = Modifier.fillMaxSize().verticalScroll(scrollState).padding(16.dp)) {
        Link("← Flow Map", onClick = onBack)
        Spacer(Modifier.height(12.dp))

        // Header
        Text("Transition Detail", fontSize = 16.sp)
        Row(
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier.padding(top = 8.dp),
        ) {
            Link(transition.fromScreen, onClick = { onScreenSelected(transition.fromScreen) })
            Text("→", fontSize = 14.sp, color = colors.text.normal.copy(alpha = 0.4f))
            Link(transition.toScreen, onClick = { onScreenSelected(transition.toScreen) })
        }

        Spacer(Modifier.height(20.dp))

        // Details
        DetailRow("Trigger", transition.trigger.replaceFirstChar { it.uppercase() })
        transition.element?.let { DetailRow("Element", it) }
        DetailRow("Traversals", "${transition.traversalCount}")
        if (transition.avgLatencyMs > 0) {
            DetailRow("Avg Latency", "${transition.avgLatencyMs}ms")
        }
        if (transition.failureRate > 0) {
            DetailRow("Failure Rate", "${(transition.failureRate * 100)}%")
        }

        Spacer(Modifier.height(20.dp))

        // Tests section
        Text("Related Tests", fontSize = 13.sp, color = colors.text.normal.copy(alpha = 0.8f))
        Spacer(Modifier.height(8.dp))
        Text(
            "• NavigationTest.testHomeToSettings()",
            fontSize = 12.sp,
            color = colors.text.normal.copy(alpha = 0.6f),
        )
        Text(
            "• SmokeTest.testBasicNavigation()",
            fontSize = 12.sp,
            color = colors.text.normal.copy(alpha = 0.6f),
        )
    }
}

@Composable
fun DetailRow(label: String, value: String) {
    val colors = JewelTheme.globalColors
    Row(
        modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
    ) {
        Text(label, fontSize = 12.sp, color = colors.text.normal.copy(alpha = 0.5f))
        Text(value, fontSize = 12.sp)
    }
}
