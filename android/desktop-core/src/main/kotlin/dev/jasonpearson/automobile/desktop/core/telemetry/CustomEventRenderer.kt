package dev.jasonpearson.automobile.desktop.core.telemetry

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

// ── Config Model ────────────────────────────────────────────────────────

/**
 * Mapping from a property key to its display configuration.
 */
data class PropertyDisplayConfig(
    val key: String,
    val label: String,
    val visible: Boolean = true,
    val order: Int = Int.MAX_VALUE,
)

/**
 * Renderer configuration for a custom event type, identified by event name.
 * When [propertyConfigs] is empty, all properties are shown as key-value pairs (default behavior).
 */
data class CustomEventRendererConfig(
    val eventName: String,
    val displayTitle: String? = null,
    val propertyConfigs: List<PropertyDisplayConfig> = emptyList(),
)

// ── In-memory registry ──────────────────────────────────────────────────

/**
 * Registry of custom event renderer configurations.
 * Stored in memory; callers can persist/load from a file as needed.
 */
class CustomEventRendererRegistry {
    private val configs = mutableMapOf<String, CustomEventRendererConfig>()

    fun register(config: CustomEventRendererConfig) {
        configs[config.eventName] = config
    }

    fun remove(eventName: String) {
        configs.remove(eventName)
    }

    fun get(eventName: String): CustomEventRendererConfig? = configs[eventName]

    fun getAll(): List<CustomEventRendererConfig> = configs.values.toList()
}

// ── Composable Renderer ─────────────────────────────────────────────────

/**
 * Renders a [TelemetryDisplayEvent.Custom] event using an optional
 * [CustomEventRendererConfig]. If no config is provided, all properties
 * are shown as key-value pairs (default behavior).
 */
@Composable
fun CustomEventRenderedDetail(
    event: TelemetryDisplayEvent.Custom,
    config: CustomEventRendererConfig?,
    textColor: Color,
    modifier: Modifier = Modifier,
) {
    Column(modifier = modifier, verticalArrangement = Arrangement.spacedBy(4.dp)) {
        // Title
        val title = config?.displayTitle ?: event.name
        Text(
            title,
            fontSize = 13.sp,
            fontWeight = FontWeight.SemiBold,
            color = textColor,
        )
        Spacer(Modifier.height(2.dp))

        if (config != null && config.propertyConfigs.isNotEmpty()) {
            // Configured layout: respect order, labels, and visibility
            val orderedConfigs = config.propertyConfigs
                .filter { it.visible }
                .sortedBy { it.order }

            orderedConfigs.forEach { propConfig ->
                val value = event.properties[propConfig.key]
                if (value != null) {
                    PropertyRow(label = propConfig.label, value = value, textColor = textColor)
                }
            }

            // Show any remaining properties not in config
            val configuredKeys = config.propertyConfigs.map { it.key }.toSet()
            event.properties
                .filter { it.key !in configuredKeys }
                .forEach { (key, value) ->
                    PropertyRow(label = key, value = value, textColor = textColor)
                }
        } else {
            // Default: show all properties as key-value pairs
            event.properties.forEach { (key, value) ->
                PropertyRow(label = key, value = value, textColor = textColor)
            }
        }
    }
}

@Composable
private fun PropertyRow(label: String, value: String, textColor: Color) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(vertical = 1.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Text(
            label,
            fontSize = 11.sp,
            color = textColor.copy(alpha = 0.6f),
            modifier = Modifier.weight(0.4f),
        )
        Text(
            value,
            fontSize = 11.sp,
            color = textColor,
            modifier = Modifier.weight(0.6f),
        )
    }
}
