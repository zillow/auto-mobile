package dev.jasonpearson.automobile.desktop.core.failures

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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.material3.Text

/**
 * Badge showing failure count with color indicating severity.
 * Red = has critical/high severity failures
 * Orange = has medium severity failures
 * Gray = no failures
 */
@Composable
fun FailuresBadge(
    failureCount: Int,
    hasCritical: Boolean,
    modifier: Modifier = Modifier,
) {
    val backgroundColor = when {
        failureCount == 0 -> Color.Gray.copy(alpha = 0.3f)
        hasCritical -> Color(0xFFE53935) // Red for critical
        else -> Color(0xFFFF9800) // Orange for non-critical
    }

    val textColor = when {
        failureCount == 0 -> Color.White.copy(alpha = 0.5f)
        else -> Color.White
    }

    Box(
        modifier = modifier
            .size(18.dp)
            .background(backgroundColor, CircleShape),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = if (failureCount > 99) "99+" else failureCount.toString(),
            fontSize = if (failureCount > 99) 6.sp else 9.sp,
            color = textColor,
            maxLines = 1,
        )
    }
}

/**
 * Collapsed view for Failures showing date range and all failure type counts with emojis.
 */
@Composable
fun FailuresCollapsedContent(
    dateRangeLabel: String,
    crashCount: Int,
    anrCount: Int,
    toolFailureCount: Int,
    nonFatalCount: Int,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier
            .fillMaxHeight()
            .padding(vertical = 8.dp)
            .verticalScroll(rememberScrollState()),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        // Date range indicator
        Text(
            text = dateRangeLabel,
            fontSize = 9.sp,
            color = Color.Gray,
            maxLines = 1,
        )

        // Crashes
        FailureMetricItem(
            count = crashCount,
            emoji = FailureType.Crash.icon,
            color = FailureType.Crash.color,
        )

        // ANRs
        FailureMetricItem(
            count = anrCount,
            emoji = FailureType.ANR.icon,
            color = FailureType.ANR.color,
        )

        // Tool Failures
        FailureMetricItem(
            count = toolFailureCount,
            emoji = FailureType.ToolCallFailure.icon,
            color = FailureType.ToolCallFailure.color,
        )

        // Non-Fatal
        FailureMetricItem(
            count = nonFatalCount,
            emoji = FailureType.NonFatal.icon,
            color = FailureType.NonFatal.color,
        )
    }
}

@Composable
private fun FailureMetricItem(
    count: Int,
    emoji: String,
    color: Color,
) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Text(
            text = formatCompactNumber(count),
            fontSize = 11.sp,
            color = if (count > 0) color else Color.Gray.copy(alpha = 0.5f),
            maxLines = 1,
        )
        Text(
            text = emoji,
            fontSize = 10.sp,
            maxLines = 1,
        )
    }
}

private fun formatCompactNumber(value: Int): String = when {
    value >= 1_000_000 -> String.format("%.1f", value / 1_000_000.0).removeSuffix(".0") + "m"
    value >= 1_000 -> String.format("%.1f", value / 1_000.0).removeSuffix(".0") + "k"
    else -> value.toString()
}
