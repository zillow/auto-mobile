@file:OptIn(
    androidx.compose.ui.ExperimentalComposeUiApi::class,
    androidx.compose.foundation.ExperimentalFoundationApi::class,
)

package dev.jasonpearson.automobile.ide.storage

import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.input.key.KeyEventType
import androidx.compose.ui.input.key.isCtrlPressed
import androidx.compose.ui.input.key.isMetaPressed
import androidx.compose.ui.input.key.key
import androidx.compose.ui.input.key.onKeyEvent
import androidx.compose.ui.input.key.type
import androidx.compose.ui.input.pointer.PointerIcon
import androidx.compose.ui.input.pointer.pointerHoverIcon
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Popup
import androidx.compose.ui.window.PopupProperties
import org.jetbrains.jewel.foundation.theme.JewelTheme
import org.jetbrains.jewel.ui.component.Text

/**
 * Database Inspector with tabs for Data, Structure, SQL, and Query History.
 */
@Composable
fun DatabaseInspector(
    databases: List<DatabaseInfo> = StorageMockData.databases,
    modifier: Modifier = Modifier,
) {
    val colors = JewelTheme.globalColors

    // State
    var selectedDatabase by remember(databases) { mutableStateOf(databases.firstOrNull()) }
    var selectedTable by remember(selectedDatabase) { mutableStateOf(selectedDatabase?.tables?.firstOrNull()) }
    var viewMode by remember { mutableStateOf(DatabaseViewMode.Data) }
    var queryText by remember { mutableStateOf("SELECT * FROM users WHERE is_active = 1") }
    var queryResult by remember { mutableStateOf<QueryResult?>(null) }
    var savedQueries by remember { mutableStateOf(StorageMockData.savedQueries) }
    var queryHistory by remember { mutableStateOf(StorageMockData.queryHistory) }

    Column(modifier = modifier.fillMaxSize()) {
        // Database and Table selectors
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .background(colors.text.normal.copy(alpha = 0.03f))
                .padding(horizontal = 12.dp, vertical = 8.dp),
            horizontalArrangement = Arrangement.spacedBy(16.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            // Database selector
            Row(
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    "DATABASE",
                    fontSize = 10.sp,
                    color = colors.text.normal.copy(alpha = 0.5f),
                )
                DropdownSelector(
                    items = databases,
                    selectedItem = selectedDatabase,
                    onItemSelected = {
                        selectedDatabase = it
                        selectedTable = it?.tables?.firstOrNull()
                    },
                    itemLabel = { it?.name ?: "None" },
                )
            }

            // Table selector (only show in Data/Structure modes)
            if (viewMode == DatabaseViewMode.Data || viewMode == DatabaseViewMode.Structure) {
                Row(
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(
                        "TABLE",
                        fontSize = 10.sp,
                        color = colors.text.normal.copy(alpha = 0.5f),
                    )
                    DropdownSelector(
                        items = selectedDatabase?.tables ?: emptyList(),
                        selectedItem = selectedTable,
                        onItemSelected = { selectedTable = it },
                        itemLabel = { it?.name ?: "None" },
                    )
                }
            }
        }

        // Show info banner when no databases are available
        if (databases.isEmpty()) {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(Color(0xFF2196F3).copy(alpha = 0.1f))
                    .padding(12.dp),
            ) {
                Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Text(
                        "No databases detected",
                        fontSize = 12.sp,
                        fontWeight = FontWeight.Medium,
                        color = Color(0xFF2196F3),
                    )
                    Text(
                        "AutoMobile can inspect databases via adb shell for debuggable apps. The SDK provides a richer inspection experience with live updates.",
                        fontSize = 11.sp,
                        color = colors.text.normal.copy(alpha = 0.7f),
                    )
                }
            }
        }

        // View mode tabs
        ViewModeTabs(
            selectedMode = viewMode,
            onModeSelected = { viewMode = it },
        )

        // Content based on view mode
        when (viewMode) {
            DatabaseViewMode.Data -> {
                if (selectedTable != null) {
                    DataView(
                        table = selectedTable!!,
                        result = StorageMockData.mockQueryResult,
                    )
                } else {
                    EmptyState("Select a table to view data")
                }
            }
            DatabaseViewMode.Structure -> {
                if (selectedTable != null) {
                    StructureView(table = selectedTable!!)
                } else {
                    EmptyState("Select a table to view structure")
                }
            }
            DatabaseViewMode.SQL -> {
                SQLView(
                    databaseName = selectedDatabase?.name ?: "",
                    queryText = queryText,
                    onQueryTextChange = { queryText = it },
                    queryResult = queryResult,
                    savedQueries = savedQueries,
                    onExecute = {
                        // Mock execution
                        queryResult = StorageMockData.mockQueryResult
                        queryHistory = listOf(
                            QueryHistoryEntry(
                                id = "h${System.currentTimeMillis()}",
                                sql = queryText,
                                databaseName = selectedDatabase?.name ?: "",
                                executedAt = System.currentTimeMillis(),
                                executionTimeMs = 15,
                                rowsAffected = StorageMockData.mockQueryResult.rowCount,
                                success = true,
                            )
                        ) + queryHistory
                    },
                    onSaveQuery = { name ->
                        savedQueries = savedQueries + SavedQuery(
                            id = "q${System.currentTimeMillis()}",
                            name = name,
                            sql = queryText,
                            databaseName = selectedDatabase?.name ?: "",
                            createdAt = System.currentTimeMillis(),
                        )
                    },
                    onLoadQuery = { query ->
                        queryText = query.sql
                    },
                )
            }
            DatabaseViewMode.QueryHistory -> {
                QueryHistoryView(
                    history = queryHistory,
                    onLoadQuery = { entry ->
                        queryText = entry.sql
                        viewMode = DatabaseViewMode.SQL
                    },
                )
            }
        }
    }
}

@Composable
private fun <T> DropdownSelector(
    items: List<T>,
    selectedItem: T?,
    onItemSelected: (T?) -> Unit,
    itemLabel: (T?) -> String,
) {
    val colors = JewelTheme.globalColors
    var expanded by remember { mutableStateOf(false) }

    Box {
        Row(
            modifier = Modifier
                .clip(RoundedCornerShape(4.dp))
                .background(colors.text.normal.copy(alpha = 0.08f))
                .clickable { expanded = !expanded }
                .pointerHoverIcon(PointerIcon.Hand)
                .padding(horizontal = 10.dp, vertical = 6.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                itemLabel(selectedItem),
                fontSize = 12.sp,
                color = colors.text.normal,
            )
            Text(
                if (expanded) "\u25B2" else "\u25BC",
                fontSize = 8.sp,
                color = colors.text.normal.copy(alpha = 0.5f),
            )
        }

        if (expanded) {
            Popup(
                onDismissRequest = { expanded = false },
                offset = IntOffset(0, 36),
                properties = PopupProperties(focusable = true),
            ) {
                Column(
                    modifier = Modifier
                        .width(180.dp)
                        .background(Color(0xFF2D2D2D), RoundedCornerShape(4.dp))
                        .border(1.dp, Color(0xFF404040), RoundedCornerShape(4.dp))
                ) {
                    items.forEach { item ->
                        Box(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clickable {
                                    onItemSelected(item)
                                    expanded = false
                                }
                                .pointerHoverIcon(PointerIcon.Hand)
                                .background(
                                    if (item == selectedItem) Color(0xFF2196F3).copy(alpha = 0.3f)
                                    else Color.Transparent
                                )
                                .padding(horizontal = 12.dp, vertical = 10.dp)
                        ) {
                            Text(
                                itemLabel(item),
                                fontSize = 12.sp,
                                color = Color.White,
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun ViewModeTabs(
    selectedMode: DatabaseViewMode,
    onModeSelected: (DatabaseViewMode) -> Unit,
) {
    val colors = JewelTheme.globalColors

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(colors.text.normal.copy(alpha = 0.02f))
            .padding(horizontal = 8.dp, vertical = 4.dp),
        horizontalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        DatabaseViewMode.entries.forEach { mode ->
            val isSelected = mode == selectedMode
            val (icon, label) = when (mode) {
                DatabaseViewMode.Data -> "\u2637" to "Data"
                DatabaseViewMode.Structure -> "\u2699" to "Structure"
                DatabaseViewMode.SQL -> "\u2318" to "SQL"
                DatabaseViewMode.QueryHistory -> "\u23F1" to "History"
            }

            Row(
                modifier = Modifier
                    .clip(RoundedCornerShape(4.dp))
                    .background(
                        if (isSelected) colors.text.normal.copy(alpha = 0.1f)
                        else Color.Transparent
                    )
                    .clickable { onModeSelected(mode) }
                    .pointerHoverIcon(PointerIcon.Hand)
                    .padding(horizontal = 12.dp, vertical = 6.dp),
                horizontalArrangement = Arrangement.spacedBy(6.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    icon,
                    fontSize = 12.sp,
                    color = if (isSelected) colors.text.normal else colors.text.normal.copy(alpha = 0.5f),
                )
                Text(
                    label,
                    fontSize = 11.sp,
                    color = if (isSelected) colors.text.normal else colors.text.normal.copy(alpha = 0.5f),
                )
            }
        }
    }
}

@Composable
private fun DataView(
    table: TableInfo,
    result: QueryResult,
) {
    val colors = JewelTheme.globalColors
    val scrollState = rememberScrollState()

    Column(modifier = Modifier.fillMaxSize()) {
        // Table header
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .background(colors.text.normal.copy(alpha = 0.05f))
                .horizontalScroll(scrollState)
                .padding(vertical = 8.dp),
        ) {
            result.columns.forEach { column ->
                Box(
                    modifier = Modifier
                        .width(150.dp)
                        .padding(horizontal = 8.dp),
                ) {
                    Text(
                        column,
                        fontSize = 11.sp,
                        fontWeight = FontWeight.SemiBold,
                        color = colors.text.normal,
                    )
                }
            }
        }

        // Divider
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(1.dp)
                .background(colors.text.normal.copy(alpha = 0.1f))
        )

        // Table rows
        LazyColumn(modifier = Modifier.fillMaxSize()) {
            items(result.rows) { row ->
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .horizontalScroll(scrollState)
                        .clickable { }
                        .pointerHoverIcon(PointerIcon.Hand)
                        .padding(vertical = 6.dp),
                ) {
                    row.forEach { cell ->
                        Box(
                            modifier = Modifier
                                .width(150.dp)
                                .padding(horizontal = 8.dp),
                        ) {
                            Text(
                                cell?.toString() ?: "NULL",
                                fontSize = 11.sp,
                                color = if (cell == null) colors.text.normal.copy(alpha = 0.4f) else colors.text.normal,
                                fontFamily = FontFamily.Monospace,
                            )
                        }
                    }
                }
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(1.dp)
                        .background(colors.text.normal.copy(alpha = 0.05f))
                )
            }
        }

        // Footer with row count
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .background(colors.text.normal.copy(alpha = 0.03f))
                .padding(horizontal = 12.dp, vertical = 6.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            Text(
                "${result.rowCount} rows",
                fontSize = 10.sp,
                color = colors.text.normal.copy(alpha = 0.5f),
            )
            Text(
                "Executed in ${result.executionTimeMs}ms",
                fontSize = 10.sp,
                color = colors.text.normal.copy(alpha = 0.5f),
            )
        }
    }
}

@Composable
private fun StructureView(table: TableInfo) {
    val colors = JewelTheme.globalColors

    Column(modifier = Modifier.fillMaxSize().padding(12.dp)) {
        Text(
            "Table: ${table.name}",
            fontSize = 14.sp,
            fontWeight = FontWeight.SemiBold,
            color = colors.text.normal,
        )
        Text(
            "${table.rowCount} rows",
            fontSize = 11.sp,
            color = colors.text.normal.copy(alpha = 0.5f),
            modifier = Modifier.padding(bottom = 16.dp),
        )

        // Column headers
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .background(colors.text.normal.copy(alpha = 0.05f))
                .padding(vertical = 8.dp, horizontal = 12.dp),
        ) {
            Text("Column", fontSize = 11.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(0.3f))
            Text("Type", fontSize = 11.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(0.2f))
            Text("PK", fontSize = 11.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(0.1f))
            Text("Nullable", fontSize = 11.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(0.15f))
            Text("Default", fontSize = 11.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(0.25f))
        }

        Box(modifier = Modifier.fillMaxWidth().height(1.dp).background(colors.text.normal.copy(alpha = 0.1f)))

        LazyColumn {
            items(table.columns) { column ->
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(vertical = 8.dp, horizontal = 12.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Row(
                        modifier = Modifier.weight(0.3f),
                        horizontalArrangement = Arrangement.spacedBy(4.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        if (column.isPrimaryKey) {
                            Text("\uD83D\uDD11", fontSize = 10.sp) // Key emoji
                        }
                        Text(column.name, fontSize = 11.sp, fontFamily = FontFamily.Monospace)
                    }
                    Text(
                        column.type,
                        fontSize = 11.sp,
                        color = Color(0xFF2196F3),
                        fontFamily = FontFamily.Monospace,
                        modifier = Modifier.weight(0.2f),
                    )
                    Text(
                        if (column.isPrimaryKey) "\u2713" else "",
                        fontSize = 11.sp,
                        color = Color(0xFF4CAF50),
                        modifier = Modifier.weight(0.1f),
                    )
                    Text(
                        if (column.isNullable) "YES" else "NO",
                        fontSize = 11.sp,
                        color = if (column.isNullable) colors.text.normal.copy(alpha = 0.5f) else colors.text.normal,
                        modifier = Modifier.weight(0.15f),
                    )
                    Text(
                        column.defaultValue ?: "-",
                        fontSize = 11.sp,
                        color = colors.text.normal.copy(alpha = 0.6f),
                        fontFamily = FontFamily.Monospace,
                        modifier = Modifier.weight(0.25f),
                    )
                }
                Box(modifier = Modifier.fillMaxWidth().height(1.dp).background(colors.text.normal.copy(alpha = 0.05f)))
            }
        }
    }
}

@Composable
private fun SQLView(
    databaseName: String,
    queryText: String,
    onQueryTextChange: (String) -> Unit,
    queryResult: QueryResult?,
    savedQueries: List<SavedQuery>,
    onExecute: () -> Unit,
    onSaveQuery: (String) -> Unit,
    onLoadQuery: (SavedQuery) -> Unit,
) {
    val colors = JewelTheme.globalColors
    var showSavedQueries by remember { mutableStateOf(false) }

    Column(modifier = Modifier.fillMaxSize()) {
        // SQL Editor
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(12.dp),
        ) {
            // Query input with syntax highlighting
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(120.dp)
                    .background(colors.text.normal.copy(alpha = 0.05f), RoundedCornerShape(4.dp))
                    .border(1.dp, colors.text.normal.copy(alpha = 0.1f), RoundedCornerShape(4.dp))
                    .padding(8.dp),
            ) {
                BasicTextField(
                    value = queryText,
                    onValueChange = onQueryTextChange,
                    textStyle = TextStyle(
                        fontSize = 13.sp,
                        color = colors.text.normal,
                        fontFamily = FontFamily.Monospace,
                    ),
                    cursorBrush = SolidColor(colors.text.normal),
                    modifier = Modifier
                        .fillMaxSize()
                        .onKeyEvent { event ->
                            // Ctrl/Cmd + Enter to execute
                            if (event.type == KeyEventType.KeyDown &&
                                event.key == Key.Enter &&
                                (event.isCtrlPressed || event.isMetaPressed)
                            ) {
                                onExecute()
                                true
                            } else false
                        },
                    decorationBox = { innerTextField ->
                        Box {
                            if (queryText.isEmpty()) {
                                Text(
                                    "Enter SQL query... (Ctrl+Enter to execute)",
                                    fontSize = 13.sp,
                                    color = colors.text.normal.copy(alpha = 0.4f),
                                    fontFamily = FontFamily.Monospace,
                                )
                            }
                            // Show syntax-highlighted text
                            Text(
                                highlightSQL(queryText),
                                fontSize = 13.sp,
                                fontFamily = FontFamily.Monospace,
                                modifier = Modifier.matchParentSize(),
                            )
                            // Invisible text field for input
                            Box(modifier = Modifier.matchParentSize()) {
                                innerTextField()
                            }
                        }
                    }
                )
            }

            Spacer(Modifier.height(8.dp))

            // Action buttons
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp, Alignment.End),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                // Favorite button
                Box(
                    modifier = Modifier
                        .clip(RoundedCornerShape(4.dp))
                        .clickable { onSaveQuery("Query ${savedQueries.size + 1}") }
                        .pointerHoverIcon(PointerIcon.Hand)
                        .border(1.dp, colors.text.normal.copy(alpha = 0.2f), RoundedCornerShape(4.dp))
                        .padding(horizontal = 10.dp, vertical = 6.dp),
                ) {
                    Text("\u2606", fontSize = 14.sp, color = colors.text.normal.copy(alpha = 0.6f)) // Star
                }

                // Saved queries dropdown
                Box {
                    Row(
                        modifier = Modifier
                            .clip(RoundedCornerShape(4.dp))
                            .clickable { showSavedQueries = !showSavedQueries }
                            .pointerHoverIcon(PointerIcon.Hand)
                            .border(1.dp, colors.text.normal.copy(alpha = 0.2f), RoundedCornerShape(4.dp))
                            .padding(horizontal = 10.dp, vertical = 6.dp),
                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                    ) {
                        Text("Saved queries", fontSize = 11.sp, color = colors.text.normal.copy(alpha = 0.7f))
                        Text(if (showSavedQueries) "\u25B2" else "\u25BC", fontSize = 8.sp, color = colors.text.normal.copy(alpha = 0.5f))
                    }

                    if (showSavedQueries && savedQueries.isNotEmpty()) {
                        Popup(
                            onDismissRequest = { showSavedQueries = false },
                            offset = IntOffset(0, 36),
                            properties = PopupProperties(focusable = true),
                        ) {
                            Column(
                                modifier = Modifier
                                    .width(220.dp)
                                    .background(Color(0xFF2D2D2D), RoundedCornerShape(4.dp))
                                    .border(1.dp, Color(0xFF404040), RoundedCornerShape(4.dp))
                            ) {
                                savedQueries.forEach { query ->
                                    Box(
                                        modifier = Modifier
                                            .fillMaxWidth()
                                            .clickable {
                                                onLoadQuery(query)
                                                showSavedQueries = false
                                            }
                                            .pointerHoverIcon(PointerIcon.Hand)
                                            .padding(10.dp)
                                    ) {
                                        Column {
                                            Text(query.name, fontSize = 11.sp, color = Color.White)
                                            Text(
                                                query.sql.take(40) + if (query.sql.length > 40) "..." else "",
                                                fontSize = 10.sp,
                                                color = Color.White.copy(alpha = 0.5f),
                                                fontFamily = FontFamily.Monospace,
                                            )
                                        }
                                    }
                                }
                            }
                        }
                    }
                }

                // Execute button
                Box(
                    modifier = Modifier
                        .clip(RoundedCornerShape(4.dp))
                        .background(Color(0xFF6200EE))
                        .clickable { onExecute() }
                        .pointerHoverIcon(PointerIcon.Hand)
                        .padding(horizontal = 16.dp, vertical = 8.dp),
                ) {
                    Text("Execute", fontSize = 12.sp, color = Color.White, fontWeight = FontWeight.Medium)
                }
            }
        }

        // Results
        if (queryResult != null) {
            Box(modifier = Modifier.fillMaxWidth().height(1.dp).background(colors.text.normal.copy(alpha = 0.1f)))

            if (queryResult.error != null) {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(Color(0xFFFF5722).copy(alpha = 0.1f))
                        .padding(12.dp),
                ) {
                    Text(
                        queryResult.error,
                        fontSize = 12.sp,
                        color = Color(0xFFFF5722),
                        fontFamily = FontFamily.Monospace,
                    )
                }
            } else {
                DataView(
                    table = TableInfo("result", queryResult.rowCount.toLong(), emptyList()),
                    result = queryResult,
                )
            }
        }
    }
}

@Composable
private fun QueryHistoryView(
    history: List<QueryHistoryEntry>,
    onLoadQuery: (QueryHistoryEntry) -> Unit,
) {
    val colors = JewelTheme.globalColors

    LazyColumn(modifier = Modifier.fillMaxSize().padding(12.dp)) {
        items(history) { entry ->
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(4.dp))
                    .clickable { onLoadQuery(entry) }
                    .pointerHoverIcon(PointerIcon.Hand)
                    .background(
                        if (entry.success) Color.Transparent
                        else Color(0xFFFF5722).copy(alpha = 0.05f)
                    )
                    .padding(12.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.Top,
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        entry.sql,
                        fontSize = 11.sp,
                        fontFamily = FontFamily.Monospace,
                        color = colors.text.normal,
                    )
                    Row(
                        horizontalArrangement = Arrangement.spacedBy(12.dp),
                        modifier = Modifier.padding(top = 4.dp),
                    ) {
                        Text(
                            entry.databaseName,
                            fontSize = 10.sp,
                            color = colors.text.normal.copy(alpha = 0.5f),
                        )
                        Text(
                            "${entry.executionTimeMs}ms",
                            fontSize = 10.sp,
                            color = colors.text.normal.copy(alpha = 0.5f),
                        )
                        Text(
                            "${entry.rowsAffected} rows",
                            fontSize = 10.sp,
                            color = colors.text.normal.copy(alpha = 0.5f),
                        )
                    }
                    if (!entry.success && entry.error != null) {
                        Text(
                            entry.error,
                            fontSize = 10.sp,
                            color = Color(0xFFFF5722),
                            modifier = Modifier.padding(top = 4.dp),
                        )
                    }
                }
                Text(
                    if (entry.success) "\u2713" else "\u2717",
                    fontSize = 14.sp,
                    color = if (entry.success) Color(0xFF4CAF50) else Color(0xFFFF5722),
                )
            }
            Box(modifier = Modifier.fillMaxWidth().height(1.dp).background(colors.text.normal.copy(alpha = 0.05f)))
        }
    }
}

@Composable
private fun EmptyState(message: String) {
    val colors = JewelTheme.globalColors

    Box(
        modifier = Modifier.fillMaxSize(),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            message,
            fontSize = 12.sp,
            color = colors.text.normal.copy(alpha = 0.5f),
        )
    }
}

/**
 * Basic SQL syntax highlighting.
 */
private fun highlightSQL(sql: String): AnnotatedString {
    val keywords = setOf(
        "SELECT", "FROM", "WHERE", "AND", "OR", "NOT", "IN", "LIKE", "BETWEEN",
        "ORDER", "BY", "ASC", "DESC", "LIMIT", "OFFSET", "GROUP", "HAVING",
        "JOIN", "LEFT", "RIGHT", "INNER", "OUTER", "ON", "AS",
        "INSERT", "INTO", "VALUES", "UPDATE", "SET", "DELETE",
        "CREATE", "TABLE", "INDEX", "DROP", "ALTER", "ADD", "COLUMN",
        "PRIMARY", "KEY", "FOREIGN", "REFERENCES", "UNIQUE", "NULL", "DEFAULT",
        "COUNT", "SUM", "AVG", "MIN", "MAX", "DISTINCT",
    )

    return buildAnnotatedString {
        val words = sql.split(Regex("(\\s+|(?=[,()]))"))
        var index = 0

        for (word in words) {
            val startIndex = sql.indexOf(word, index)
            if (startIndex > index) {
                // Add any skipped whitespace/punctuation
                append(sql.substring(index, startIndex))
            }

            when {
                word.uppercase() in keywords -> {
                    withStyle(SpanStyle(color = Color(0xFF569CD6), fontWeight = FontWeight.Bold)) {
                        append(word)
                    }
                }
                word.startsWith("'") || word.startsWith("\"") -> {
                    withStyle(SpanStyle(color = Color(0xFFCE9178))) {
                        append(word)
                    }
                }
                word.toIntOrNull() != null || word.toDoubleOrNull() != null -> {
                    withStyle(SpanStyle(color = Color(0xFFB5CEA8))) {
                        append(word)
                    }
                }
                else -> {
                    append(word)
                }
            }

            index = startIndex + word.length
        }

        // Add any remaining text
        if (index < sql.length) {
            append(sql.substring(index))
        }
    }
}
