package dev.jasonpearson.automobile.desktop.core.layout

import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
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
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import dev.jasonpearson.automobile.desktop.core.theme.SharedTheme

/**
 * Property inspector panel showing details of the selected UI element.
 * Displays:
 * - Identity (class, resource ID, content description)
 * - Bounds (position, size)
 * - State (clickable, enabled, focused, etc.)
 * - Text content
 */
@Composable
fun PropertyInspectorPanel(
    element: UIElementInfo?,
    modifier: Modifier = Modifier,
) {
    val colors = SharedTheme.globalColors
    val verticalScrollState = rememberScrollState()
    val horizontalScrollState = rememberScrollState()

    Box(
        modifier = modifier
            .fillMaxSize()
            .horizontalScroll(horizontalScrollState)
    ) {
        Column(
            modifier = Modifier
                .widthIn(min = 180.dp)
                .verticalScroll(verticalScrollState)
                .padding(12.dp),
        ) {
        if (element == null) {
            Box(
                modifier = Modifier.fillMaxSize(),
                contentAlignment = Alignment.Center,
            ) {
                Column(
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(4.dp),
                ) {
                    Text(
                        "No element selected",
                        color = colors.text.normal.copy(alpha = 0.5f),
                        fontSize = 12.sp,
                    )
                    Text(
                        "Click on the screen or tree to select",
                        color = colors.text.normal.copy(alpha = 0.3f),
                        fontSize = 11.sp,
                    )
                }
            }
        } else {
            // Identity section
            PropertySection(title = "Identity") {
                PropertyRow("Class", getSimpleClassName(element.className))
                PropertyRow("Full Class", element.className, isSecondary = true)
                element.resourceId?.let { PropertyRow("Resource ID", it) }
                element.contentDescription?.let { PropertyRow("Content Desc", it) }
                PropertyRow("Element ID", element.id, isSecondary = true)
            }

            Spacer(Modifier.height(16.dp))

            // Bounds section
            PropertySection(title = "Bounds") {
                PropertyRow("Position", "${element.bounds.left}, ${element.bounds.top}")
                PropertyRow("Size", "${element.bounds.width} x ${element.bounds.height}")
                PropertyRow("Right", "${element.bounds.right}", isSecondary = true)
                PropertyRow("Bottom", "${element.bounds.bottom}", isSecondary = true)
                PropertyRow("Center", "${element.bounds.centerX}, ${element.bounds.centerY}", isSecondary = true)
            }

            Spacer(Modifier.height(16.dp))

            // State section
            PropertySection(title = "State") {
                StateCheckbox("Clickable", element.isClickable)
                StateCheckbox("Enabled", element.isEnabled)
                StateCheckbox("Focused", element.isFocused)
                StateCheckbox("Selected", element.isSelected)
                StateCheckbox("Scrollable", element.isScrollable)
                StateCheckbox("Checkable", element.isCheckable)
                if (element.isCheckable) {
                    StateCheckbox("Checked", element.isChecked)
                }
            }

            // Text content section (if present)
            if (!element.text.isNullOrEmpty()) {
                Spacer(Modifier.height(16.dp))
                PropertySection(title = "Content") {
                    Column {
                        Text(
                            "Text",
                            fontSize = 10.sp,
                            color = colors.text.normal.copy(alpha = 0.5f),
                        )
                        Box(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(top = 4.dp)
                                .background(colors.text.normal.copy(alpha = 0.05f), RoundedCornerShape(4.dp))
                                .padding(8.dp),
                        ) {
                            Text(
                                element.text,
                                fontSize = 11.sp,
                                color = colors.text.normal,
                            )
                        }
                    }
                }
            }

            // Hierarchy info
            Spacer(Modifier.height(16.dp))
            PropertySection(title = "Hierarchy") {
                PropertyRow("Depth", "${element.depth}")
                PropertyRow("Children", "${element.children.size}")
            }
        }
        }
    }
}

@Composable
private fun PropertySection(
    title: String,
    content: @Composable () -> Unit,
) {
    val colors = SharedTheme.globalColors

    Column(modifier = Modifier.fillMaxWidth()) {
        Text(
            title,
            fontSize = 11.sp,
            color = colors.text.normal.copy(alpha = 0.7f),
            maxLines = 1,
            softWrap = false,
        )
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .padding(top = 2.dp, bottom = 4.dp)
                .height(1.dp)
                .background(colors.text.normal.copy(alpha = 0.1f))
        )
        Column(
            verticalArrangement = Arrangement.spacedBy(4.dp),
            modifier = Modifier.padding(top = 4.dp),
        ) {
            content()
        }
    }
}

@Composable
private fun PropertyRow(
    label: String,
    value: String,
    isSecondary: Boolean = false,
) {
    val colors = SharedTheme.globalColors

    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            label,
            fontSize = 11.sp,
            color = colors.text.normal.copy(alpha = if (isSecondary) 0.4f else 0.6f),
            maxLines = 1,
            softWrap = false,
            modifier = Modifier.width(80.dp),
        )
        Text(
            value,
            fontSize = 11.sp,
            color = colors.text.normal.copy(alpha = if (isSecondary) 0.6f else 1f),
            maxLines = 1,
            softWrap = false,
        )
    }
}

@Composable
private fun StateCheckbox(
    label: String,
    isChecked: Boolean,
) {
    val colors = SharedTheme.globalColors

    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            label,
            fontSize = 11.sp,
            color = colors.text.normal.copy(alpha = 0.6f),
            maxLines = 1,
            softWrap = false,
        )
        Box(
            modifier = Modifier
                .size(14.dp)
                .clip(RoundedCornerShape(3.dp))
                .background(
                    if (isChecked) Color(0xFF4CAF50).copy(alpha = 0.2f)
                    else colors.text.normal.copy(alpha = 0.05f)
                ),
            contentAlignment = Alignment.Center,
        ) {
            if (isChecked) {
                Text(
                    "\u2713", // Checkmark
                    fontSize = 10.sp,
                    color = Color(0xFF4CAF50),
                )
            }
        }
    }
}

private fun getSimpleClassName(fullName: String): String {
    return fullName.substringAfterLast(".")

}
