package dev.jasonpearson.automobile.desktop.core.performance

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.material3.Text

/**
 * Summary view for Performance shown when collapsed.
 * Shows all available metrics stacked vertically with color coding.
 */
@Composable
fun PerformanceSummary(
    currentFps: Float?,
    currentFrameTimeMs: Float?,
    currentJankFrames: Int?,
    currentMemoryMb: Float?,
    currentTouchLatencyMs: Float?,
    currentRecompositionRate: Float? = null,
    updateCounter: Int = 0,
    modifier: Modifier = Modifier,
) {
    val hasAnyMetric = currentFps != null || currentFrameTimeMs != null ||
        currentJankFrames != null || currentMemoryMb != null || currentTouchLatencyMs != null ||
        currentRecompositionRate != null

    // Flashing indicator color alternates between green and blue on each update
    val indicatorColor = if (updateCounter % 2 == 0) {
        Color(0xFF4CAF50) // Green
    } else {
        Color(0xFF2196F3) // Blue
    }

    Column(
        modifier = modifier
            .fillMaxHeight()
            .padding(vertical = 8.dp)
            .verticalScroll(rememberScrollState()),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        // Update indicator - flashes green/blue on data updates
        if (hasAnyMetric) {
            Box(
                modifier = Modifier
                    .size(6.dp)
                    .clip(CircleShape)
                    .background(indicatorColor)
            )
        }

        // FPS indicator
        if (currentFps != null) {
            val fpsColor = when {
                currentFps >= 55 -> Color(0xFF4CAF50) // Green
                currentFps >= 30 -> Color(0xFFFF9800) // Orange
                else -> Color(0xFFE53935) // Red
            }
            MetricItem(value = "${currentFps.toInt()}", unit = "fps", color = fpsColor)
        }

        // Frame Time indicator
        if (currentFrameTimeMs != null) {
            val frameTimeColor = when {
                currentFrameTimeMs <= 16.7f -> Color(0xFF4CAF50) // Green (60fps target)
                currentFrameTimeMs <= 33.3f -> Color(0xFFFF9800) // Orange (30fps)
                else -> Color(0xFFE53935) // Red
            }
            MetricItem(value = "${currentFrameTimeMs.toInt()}", unit = "ms", color = frameTimeColor)
        }

        // Jank indicator
        if (currentJankFrames != null) {
            val jankColor = when {
                currentJankFrames == 0 -> Color(0xFF4CAF50) // Green
                currentJankFrames <= 5 -> Color(0xFFFF9800) // Orange
                else -> Color(0xFFE53935) // Red
            }
            MetricItem(value = "$currentJankFrames", unit = "jank", color = jankColor)
        }

        // Memory indicator
        if (currentMemoryMb != null) {
            val memColor = when {
                currentMemoryMb < 256 -> Color(0xFF4CAF50)
                currentMemoryMb < 512 -> Color(0xFFFF9800)
                else -> Color(0xFFE53935)
            }
            MetricItem(value = "${currentMemoryMb.toInt()}", unit = "MB", color = memColor)
        }

        // Touch Latency indicator
        if (currentTouchLatencyMs != null) {
            val latencyColor = when {
                currentTouchLatencyMs <= 50 -> Color(0xFF4CAF50) // Green
                currentTouchLatencyMs <= 100 -> Color(0xFFFF9800) // Orange
                else -> Color(0xFFE53935) // Red
            }
            MetricItem(value = "${currentTouchLatencyMs.toInt()}", unit = "lat", color = latencyColor)
        }

        // Recomposition rate indicator
        if (currentRecompositionRate != null) {
            val recompColor = when {
                currentRecompositionRate <= 10f -> Color(0xFF4CAF50) // Green
                currentRecompositionRate <= 50f -> Color(0xFFFF9800) // Orange
                else -> Color(0xFFE53935) // Red
            }
            MetricItem(value = "${currentRecompositionRate.toInt()}", unit = "r/s", color = recompColor)
        }

        // Fallback when no metrics
        if (!hasAnyMetric) {
            Text(
                text = "—",
                fontSize = 12.sp,
                color = Color.Gray.copy(alpha = 0.5f),
            )
        }
    }
}

@Composable
private fun MetricItem(
    value: String,
    unit: String,
    color: Color,
) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Text(
            text = value,
            fontSize = 11.sp,
            color = color,
            maxLines = 1,
        )
        Text(
            text = unit,
            fontSize = 7.sp,
            color = color.copy(alpha = 0.7f),
            maxLines = 1,
        )
    }
}
