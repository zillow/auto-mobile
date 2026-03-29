package dev.jasonpearson.automobile.desktop.core.shell

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.pointer.PointerIcon
import androidx.compose.ui.input.pointer.pointerHoverIcon
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import dev.jasonpearson.automobile.desktop.core.theme.SharedTheme

// ── Data Model ──────────────────────────────────────────────────────────

/**
 * Severity level for a notification rule.
 */
enum class NotificationSeverity(val label: String, val color: Long) {
    Info("Info", 0xFF74C0FC),
    Warning("Warning", 0xFFE0C040),
    Critical("Critical", 0xFFFF6B6B),
}

/**
 * Condition type that triggers a notification.
 */
enum class ConditionType(val label: String) {
    CrashCountAbove("Crash count >"),
    AnrCountAbove("ANR count >"),
    FpsBelow("FPS <"),
    MemoryAbove("Memory (MB) >"),
    ToolFailureCountAbove("Tool failure count >"),
}

/**
 * A user-defined notification rule.
 *
 * @param id Unique rule identifier.
 * @param name Human-readable name.
 * @param condition The condition type to evaluate.
 * @param threshold Numeric threshold for the condition.
 * @param severity How urgent the notification is.
 * @param enabled Whether the rule is active.
 * @param sustainSeconds How long the condition must hold before firing (0 = immediate).
 */
data class NotificationRule(
    val id: String,
    val name: String,
    val condition: ConditionType,
    val threshold: Double,
    val severity: NotificationSeverity,
    val enabled: Boolean = true,
    val sustainSeconds: Int = 0,
)

/**
 * A fired toast notification.
 */
data class ToastNotification(
    val id: String,
    val ruleId: String,
    val ruleName: String,
    val message: String,
    val severity: NotificationSeverity,
    val timestampMs: Long,
)

// ── Evaluation ──────────────────────────────────────────────────────────

/**
 * Snapshot of live metrics used for evaluating notification rules.
 */
data class MetricsSnapshot(
    val crashCount: Int = 0,
    val anrCount: Int = 0,
    val toolFailureCount: Int = 0,
    val fps: Float? = null,
    val memoryMb: Float? = null,
)

/**
 * Evaluate a single rule against current metrics. Returns a message if triggered, null otherwise.
 */
fun evaluateRule(rule: NotificationRule, metrics: MetricsSnapshot): String? {
    if (!rule.enabled) return null
    return when (rule.condition) {
        ConditionType.CrashCountAbove ->
            if (metrics.crashCount > rule.threshold) "Crash count ${metrics.crashCount} exceeds ${rule.threshold.toInt()}" else null
        ConditionType.AnrCountAbove ->
            if (metrics.anrCount > rule.threshold) "ANR count ${metrics.anrCount} exceeds ${rule.threshold.toInt()}" else null
        ConditionType.FpsBelow ->
            if (metrics.fps != null && metrics.fps < rule.threshold) "FPS ${metrics.fps.toInt()} below ${rule.threshold.toInt()}" else null
        ConditionType.MemoryAbove ->
            if (metrics.memoryMb != null && metrics.memoryMb > rule.threshold) "Memory ${metrics.memoryMb.toInt()} MB exceeds ${rule.threshold.toInt()} MB" else null
        ConditionType.ToolFailureCountAbove ->
            if (metrics.toolFailureCount > rule.threshold) "Tool failures ${metrics.toolFailureCount} exceeds ${rule.threshold.toInt()}" else null
    }
}

// ── Toast UI ────────────────────────────────────────────────────────────

/**
 * Renders a stack of toast notifications in the top-right corner.
 * Each toast auto-dismisses after 5 seconds.
 */
@Composable
fun ToastStack(
    toasts: List<ToastNotification>,
    onDismiss: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    // Dismiss overflow toasts immediately so they are not silently dropped
    val overflow = if (toasts.size > 5) toasts.dropLast(5) else emptyList<ToastNotification>()
    val overflowIds = overflow.map { it.id }
    LaunchedEffect(overflowIds) {
        overflow.forEach { onDismiss(it.id) }
    }
    Column(
        modifier = modifier.padding(12.dp),
        verticalArrangement = Arrangement.spacedBy(6.dp),
        horizontalAlignment = Alignment.End,
    ) {
        toasts.takeLast(5).forEach { toast ->
            // Auto-dismiss after 5 seconds
            LaunchedEffect(toast.id) {
                kotlinx.coroutines.delay(5000)
                onDismiss(toast.id)
            }
            ToastItem(toast = toast, onDismiss = { onDismiss(toast.id) })
        }
    }
}

@Composable
private fun ToastItem(
    toast: ToastNotification,
    onDismiss: () -> Unit,
) {
    val bgColor = when (toast.severity) {
        NotificationSeverity.Critical -> Color(0xFF3D1212)
        NotificationSeverity.Warning -> Color(0xFF3D3012)
        NotificationSeverity.Info -> Color(0xFF122A3D)
    }
    val borderColor = Color(toast.severity.color)

    Box(
        modifier = Modifier
            .widthIn(max = 320.dp)
            .background(bgColor, RoundedCornerShape(6.dp))
            .padding(1.dp)
            .background(bgColor, RoundedCornerShape(5.dp))
            .padding(10.dp),
    ) {
        Column {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    toast.ruleName,
                    fontSize = 12.sp,
                    color = borderColor,
                    maxLines = 1,
                )
                Text(
                    "\u00D7",
                    fontSize = 14.sp,
                    color = Color.White.copy(alpha = 0.6f),
                    modifier = Modifier
                        .clickable(onClick = onDismiss)
                        .pointerHoverIcon(PointerIcon.Hand)
                        .padding(start = 8.dp),
                )
            }
            Spacer(Modifier.height(2.dp))
            Text(
                toast.message,
                fontSize = 11.sp,
                color = Color.White.copy(alpha = 0.8f),
            )
        }
    }
}

// ── Rules Editor (for Settings panel) ──────────────────────────────────

/**
 * Inline rules editor for the settings panel.
 * Allows adding, editing, and deleting notification rules.
 */
@Composable
fun NotificationRulesEditor(
    rules: List<NotificationRule>,
    onRulesChanged: (List<NotificationRule>) -> Unit,
    modifier: Modifier = Modifier,
) {
    val colors = SharedTheme.globalColors

    Column(modifier = modifier, verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text("Notification Rules", fontSize = 16.sp, color = colors.text.normal)
        Text(
            "Define conditions that trigger toast notifications.",
            fontSize = 12.sp,
            color = colors.text.normal.copy(alpha = 0.6f),
        )
        Spacer(Modifier.height(4.dp))

        rules.forEachIndexed { index, rule ->
            NotificationRuleRow(
                rule = rule,
                onToggle = { enabled ->
                    onRulesChanged(rules.toMutableList().also { it[index] = rule.copy(enabled = enabled) })
                },
                onDelete = {
                    onRulesChanged(rules.toMutableList().also { it.removeAt(index) })
                },
            )
        }

        // Add rule button
        Text(
            "+ Add Rule",
            fontSize = 12.sp,
            color = colors.text.info,
            modifier = Modifier
                .clickable {
                    val newRule = NotificationRule(
                        id = "rule_${System.currentTimeMillis()}",
                        name = "New Rule",
                        condition = ConditionType.CrashCountAbove,
                        threshold = 0.0,
                        severity = NotificationSeverity.Warning,
                    )
                    onRulesChanged(rules + newRule)
                }
                .pointerHoverIcon(PointerIcon.Hand)
                .padding(vertical = 4.dp),
        )
    }
}

@Composable
private fun NotificationRuleRow(
    rule: NotificationRule,
    onToggle: (Boolean) -> Unit,
    onDelete: () -> Unit,
) {
    val colors = SharedTheme.globalColors
    val severityColor = Color(rule.severity.color)

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(colors.text.normal.copy(alpha = 0.04f), RoundedCornerShape(4.dp))
            .padding(8.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        // Enabled indicator
        Box(
            modifier = Modifier
                .background(
                    if (rule.enabled) severityColor.copy(alpha = 0.8f) else colors.text.normal.copy(alpha = 0.2f),
                    RoundedCornerShape(2.dp),
                )
                .clickable { onToggle(!rule.enabled) }
                .pointerHoverIcon(PointerIcon.Hand)
                .padding(horizontal = 6.dp, vertical = 2.dp),
        ) {
            Text(
                if (rule.enabled) "ON" else "OFF",
                fontSize = 9.sp,
                color = Color.White,
            )
        }

        // Rule description
        Column(modifier = Modifier.weight(1f)) {
            Text(rule.name, fontSize = 12.sp, color = colors.text.normal)
            Text(
                "${rule.condition.label} ${rule.threshold.toInt()}" +
                    if (rule.sustainSeconds > 0) " for ${rule.sustainSeconds}s" else "",
                fontSize = 10.sp,
                color = colors.text.normal.copy(alpha = 0.6f),
            )
        }

        // Severity badge
        Text(
            rule.severity.label,
            fontSize = 10.sp,
            color = severityColor,
        )

        // Delete
        Text(
            "\u00D7",
            fontSize = 14.sp,
            color = colors.text.normal.copy(alpha = 0.4f),
            modifier = Modifier
                .clickable(onClick = onDelete)
                .pointerHoverIcon(PointerIcon.Hand),
        )
    }
}
