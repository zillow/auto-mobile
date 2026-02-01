@file:OptIn(androidx.compose.ui.ExperimentalComposeUiApi::class)

package dev.jasonpearson.automobile.ide.storage

import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
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
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.input.pointer.PointerIcon
import androidx.compose.ui.input.pointer.pointerHoverIcon
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import dev.jasonpearson.automobile.ide.socket.StorageChangeListener
import dev.jasonpearson.automobile.ide.socket.StorageSocketClient
import kotlinx.coroutines.delay
import org.jetbrains.jewel.foundation.theme.JewelTheme
import org.jetbrains.jewel.ui.component.Text

/** Duration for the highlight animation when a key changes */
private const val HIGHLIGHT_DURATION_MS = 2000L

/** Color for highlighting recently changed entries */
private val HIGHLIGHT_COLOR = Color(0xFF4CAF50).copy(alpha = 0.3f)

/**
 * Key-Value storage inspector for SharedPreferences (Android) / UserDefaults (iOS).
 *
 * @param keyValueFiles List of key-value storage files to display
 * @param storageSocketClient Optional socket client for real-time change updates
 * @param modifier Modifier for the composable
 */
@Composable
fun KeyValueInspector(
    keyValueFiles: List<KeyValueFile>,
    storageSocketClient: StorageSocketClient? = null,
    modifier: Modifier = Modifier,
) {
    val colors = JewelTheme.globalColors

    // State
    var selectedFile by remember(keyValueFiles) { mutableStateOf(keyValueFiles.firstOrNull()) }
    var searchQuery by remember { mutableStateOf("") }
    var selectedEntry by remember { mutableStateOf<KeyValueEntry?>(null) }
    var editingEntry by remember { mutableStateOf<KeyValueEntry?>(null) }
    var editValue by remember { mutableStateOf("") }

    // Track recently changed keys for highlight animation
    // Key format: "fileName:key" to uniquely identify entries across files
    var recentlyChangedKeys by remember { mutableStateOf<Set<String>>(emptySet()) }

    // Subscribe to storage changes
    DisposableEffect(storageSocketClient) {
        val listener = StorageChangeListener { event ->
            val changeKey = "${event.fileName}:${event.key}"
            recentlyChangedKeys = recentlyChangedKeys + changeKey
        }
        storageSocketClient?.subscribe(listener)
        onDispose {
            storageSocketClient?.unsubscribe(listener)
        }
    }

    // Auto-clear highlighted keys after animation duration
    LaunchedEffect(recentlyChangedKeys) {
        if (recentlyChangedKeys.isNotEmpty()) {
            delay(HIGHLIGHT_DURATION_MS)
            recentlyChangedKeys = emptySet()
        }
    }

    // Filter entries by search query
    val filteredEntries = remember(selectedFile, searchQuery) {
        selectedFile?.entries?.filter { entry ->
            searchQuery.isEmpty() ||
                entry.key.contains(searchQuery, ignoreCase = true) ||
                entry.value.toString().contains(searchQuery, ignoreCase = true)
        } ?: emptyList()
    }

    Row(modifier = modifier.fillMaxSize()) {
        // Left panel: File list
        Column(
            modifier = Modifier
                .width(200.dp)
                .fillMaxSize()
                .background(colors.text.normal.copy(alpha = 0.02f))
        ) {
            // Header
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(colors.text.normal.copy(alpha = 0.03f))
                    .padding(12.dp),
            ) {
                Text(
                    "Storage Files",
                    fontSize = 11.sp,
                    fontWeight = FontWeight.SemiBold,
                    color = colors.text.normal.copy(alpha = 0.7f),
                )
            }

            // File list
            LazyColumn(modifier = Modifier.fillMaxSize()) {
                items(keyValueFiles) { file ->
                    val isSelected = file == selectedFile

                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clickable { selectedFile = file }
                            .pointerHoverIcon(PointerIcon.Hand)
                            .background(
                                if (isSelected) colors.text.normal.copy(alpha = 0.08f)
                                else Color.Transparent
                            )
                            .padding(horizontal = 12.dp, vertical = 8.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        // Platform icon
                        Text(
                            if (file.platform == StoragePlatform.Android) "\uD83E\uDD16" else "\uD83C\uDF4E",
                            fontSize = 12.sp,
                        )

                        Column(modifier = Modifier.weight(1f)) {
                            Text(
                                file.name,
                                fontSize = 11.sp,
                                color = if (isSelected) colors.text.normal else colors.text.normal.copy(alpha = 0.8f),
                            )
                            Text(
                                "${file.entries.size} entries",
                                fontSize = 10.sp,
                                color = colors.text.normal.copy(alpha = 0.4f),
                            )
                        }
                    }
                }
            }
        }

        // Divider
        Box(
            modifier = Modifier
                .width(1.dp)
                .fillMaxSize()
                .background(colors.text.normal.copy(alpha = 0.1f))
        )

        // Right panel: Key-value list
        Column(modifier = Modifier.weight(1f).fillMaxSize()) {
            // Search bar
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(colors.text.normal.copy(alpha = 0.03f))
                    .padding(8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Box(
                    modifier = Modifier
                        .weight(1f)
                        .height(32.dp)
                        .background(colors.text.normal.copy(alpha = 0.05f), RoundedCornerShape(4.dp))
                        .padding(horizontal = 10.dp),
                    contentAlignment = Alignment.CenterStart,
                ) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        Text(
                            "\uD83D\uDD0D",
                            fontSize = 12.sp,
                            color = colors.text.normal.copy(alpha = 0.4f),
                        )
                        BasicTextField(
                            value = searchQuery,
                            onValueChange = { searchQuery = it },
                            textStyle = TextStyle(
                                fontSize = 12.sp,
                                color = colors.text.normal,
                            ),
                            cursorBrush = SolidColor(colors.text.normal),
                            singleLine = true,
                            modifier = Modifier.weight(1f),
                            decorationBox = { innerTextField ->
                                Box {
                                    if (searchQuery.isEmpty()) {
                                        Text(
                                            "Search keys or values...",
                                            fontSize = 12.sp,
                                            color = colors.text.normal.copy(alpha = 0.4f),
                                        )
                                    }
                                    innerTextField()
                                }
                            }
                        )
                        if (searchQuery.isNotEmpty()) {
                            Text(
                                "\u2715",
                                fontSize = 10.sp,
                                color = colors.text.normal.copy(alpha = 0.5f),
                                modifier = Modifier
                                    .clickable { searchQuery = "" }
                                    .pointerHoverIcon(PointerIcon.Hand)
                            )
                        }
                    }
                }
            }

            // Column headers
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(colors.text.normal.copy(alpha = 0.03f))
                    .padding(horizontal = 12.dp, vertical = 8.dp),
            ) {
                Text(
                    "Key",
                    fontSize = 10.sp,
                    fontWeight = FontWeight.SemiBold,
                    color = colors.text.normal.copy(alpha = 0.6f),
                    modifier = Modifier.weight(0.4f),
                )
                Text(
                    "Value",
                    fontSize = 10.sp,
                    fontWeight = FontWeight.SemiBold,
                    color = colors.text.normal.copy(alpha = 0.6f),
                    modifier = Modifier.weight(0.45f),
                )
                Text(
                    "Type",
                    fontSize = 10.sp,
                    fontWeight = FontWeight.SemiBold,
                    color = colors.text.normal.copy(alpha = 0.6f),
                    modifier = Modifier.weight(0.15f),
                )
            }

            Box(modifier = Modifier.fillMaxWidth().height(1.dp).background(colors.text.normal.copy(alpha = 0.1f)))

            // Entry list
            if (filteredEntries.isEmpty()) {
                Box(
                    modifier = Modifier.fillMaxSize(),
                    contentAlignment = Alignment.Center,
                ) {
                    Text(
                        if (searchQuery.isEmpty()) "No entries" else "No matching entries",
                        fontSize = 12.sp,
                        color = colors.text.normal.copy(alpha = 0.5f),
                    )
                }
            } else {
                LazyColumn(modifier = Modifier.fillMaxSize()) {
                    items(filteredEntries) { entry ->
                        val isSelected = entry == selectedEntry
                        val isEditing = entry == editingEntry

                        // Check if this entry was recently changed
                        val changeKey = "${selectedFile?.name}:${entry.key}"
                        val isRecentlyChanged = changeKey in recentlyChangedKeys

                        // Animate background color for recently changed entries
                        val backgroundColor by animateColorAsState(
                            targetValue = when {
                                isRecentlyChanged -> HIGHLIGHT_COLOR
                                isSelected -> Color(0xFF2196F3).copy(alpha = 0.1f)
                                else -> Color.Transparent
                            },
                            animationSpec = tween(durationMillis = 300),
                            label = "entryBackground"
                        )

                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clickable {
                                    selectedEntry = entry
                                    editingEntry = null
                                }
                                .pointerHoverIcon(PointerIcon.Hand)
                                .background(backgroundColor)
                                .padding(horizontal = 12.dp, vertical = 10.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            // Key
                            Text(
                                entry.key,
                                fontSize = 11.sp,
                                fontFamily = FontFamily.Monospace,
                                color = colors.text.normal,
                                modifier = Modifier.weight(0.4f),
                            )

                            // Value (editable if selected)
                            Box(modifier = Modifier.weight(0.45f)) {
                                if (isEditing) {
                                    BasicTextField(
                                        value = editValue,
                                        onValueChange = { editValue = it },
                                        textStyle = TextStyle(
                                            fontSize = 11.sp,
                                            color = colors.text.normal,
                                            fontFamily = FontFamily.Monospace,
                                        ),
                                        cursorBrush = SolidColor(colors.text.normal),
                                        singleLine = true,
                                        modifier = Modifier
                                            .fillMaxWidth()
                                            .background(colors.text.normal.copy(alpha = 0.05f), RoundedCornerShape(2.dp))
                                            .padding(4.dp),
                                    )
                                } else {
                                    Row(
                                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                                        verticalAlignment = Alignment.CenterVertically,
                                    ) {
                                        Text(
                                            formatValue(entry.value, entry.type),
                                            fontSize = 11.sp,
                                            fontFamily = FontFamily.Monospace,
                                            color = getValueColor(entry.type),
                                            modifier = Modifier.weight(1f, fill = false),
                                        )

                                        if (isSelected) {
                                            Text(
                                                "\u270E", // Edit icon
                                                fontSize = 12.sp,
                                                color = colors.text.normal.copy(alpha = 0.4f),
                                                modifier = Modifier
                                                    .clickable {
                                                        editingEntry = entry
                                                        editValue = entry.value.toString()
                                                    }
                                                    .pointerHoverIcon(PointerIcon.Hand)
                                            )
                                        }
                                    }
                                }
                            }

                            // Type badge
                            TypeBadge(
                                type = entry.type,
                                modifier = Modifier.weight(0.15f),
                            )
                        }

                        Box(
                            modifier = Modifier
                                .fillMaxWidth()
                                .height(1.dp)
                                .background(colors.text.normal.copy(alpha = 0.05f))
                        )
                    }
                }
            }

            // Footer
            if (selectedFile != null) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(colors.text.normal.copy(alpha = 0.03f))
                        .padding(horizontal = 12.dp, vertical = 6.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                ) {
                    Text(
                        selectedFile!!.path,
                        fontSize = 10.sp,
                        color = colors.text.normal.copy(alpha = 0.4f),
                        fontFamily = FontFamily.Monospace,
                    )
                    Text(
                        "${filteredEntries.size} of ${selectedFile!!.entries.size} entries",
                        fontSize = 10.sp,
                        color = colors.text.normal.copy(alpha = 0.5f),
                    )
                }
            }
        }
    }
}

@Composable
private fun TypeBadge(
    type: KeyValueType,
    modifier: Modifier = Modifier,
) {
    val (label, color) = when (type) {
        KeyValueType.String -> "Str" to Color(0xFFCE9178)
        KeyValueType.Int -> "Int" to Color(0xFFB5CEA8)
        KeyValueType.Long -> "Long" to Color(0xFFB5CEA8)
        KeyValueType.Float -> "Float" to Color(0xFFB5CEA8)
        KeyValueType.Boolean -> "Bool" to Color(0xFF569CD6)
        KeyValueType.StringSet -> "Set" to Color(0xFFDCDCAA)
        KeyValueType.Unknown -> "?" to Color.Gray
    }

    Box(
        modifier = modifier,
        contentAlignment = Alignment.CenterStart,
    ) {
        Box(
            modifier = Modifier
                .clip(RoundedCornerShape(3.dp))
                .background(color.copy(alpha = 0.15f))
                .padding(horizontal = 6.dp, vertical = 2.dp),
        ) {
            Text(
                label,
                fontSize = 9.sp,
                color = color,
                fontWeight = FontWeight.Medium,
            )
        }
    }
}

private fun formatValue(value: Any?, type: KeyValueType): String {
    return when {
        value == null -> "null"
        type == KeyValueType.String -> "\"$value\""
        type == KeyValueType.Boolean -> if (value == true) "true" else "false"
        type == KeyValueType.StringSet -> (value as? Set<*>)?.joinToString(", ", "[", "]") ?: value.toString()
        else -> value.toString()
    }
}

@Composable
private fun getValueColor(type: KeyValueType): Color {
    return when (type) {
        KeyValueType.String -> Color(0xFFCE9178)
        KeyValueType.Int, KeyValueType.Long, KeyValueType.Float -> Color(0xFFB5CEA8)
        KeyValueType.Boolean -> Color(0xFF569CD6)
        KeyValueType.StringSet -> Color(0xFFDCDCAA)
        KeyValueType.Unknown -> JewelTheme.globalColors.text.normal
    }
}
