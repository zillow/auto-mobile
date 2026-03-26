@file:OptIn(androidx.compose.ui.ExperimentalComposeUiApi::class)

package dev.jasonpearson.automobile.desktop.core.layout

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectTapGestures
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
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
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
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.input.pointer.PointerEventType
import androidx.compose.ui.input.pointer.PointerIcon
import androidx.compose.ui.input.pointer.onPointerEvent
import androidx.compose.ui.input.pointer.pointerHoverIcon
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.delay
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import dev.jasonpearson.automobile.desktop.core.theme.SharedTheme

/**
 * Flattened tree node for virtualized rendering.
 */
private data class FlatTreeNode(
    val element: UIElementInfo,
    val depth: Int,
    val isExpanded: Boolean,
    val hasChildren: Boolean,
)

/**
 * Virtualized tree view of the UI element hierarchy.
 * Supports:
 * - Expand/collapse nodes
 * - Search/filter with debounce
 * - Selection highlighting
 * - Auto-expand to selected element
 * - Hover highlighting
 */
@Composable
fun HierarchyTreeView(
    hierarchy: UIElementInfo?,
    selectedElementId: String?,
    hoveredElementId: String?,
    onElementSelected: (String?) -> Unit,
    onElementHovered: (String?) -> Unit,
    onElementDoubleClicked: ((String) -> Unit)? = null,
    parentMap: Map<String, String> = emptyMap(),
    modifier: Modifier = Modifier,
) {
    val colors = SharedTheme.globalColors

    // Search state with debounce
    var searchQuery by remember { mutableStateOf("") }
    var debouncedQuery by remember { mutableStateOf("") }

    LaunchedEffect(searchQuery) {
        delay(150) // 150ms debounce
        debouncedQuery = searchQuery
    }

    // Expanded state for tree nodes - initialize with all nodes expanded up to depth 10
    var expandedIds by remember { mutableStateOf(setOf<String>()) }

    // Track which root we've auto-expanded so we only reset on a genuinely new hierarchy
    // (different root id), not on live-update mutations of the same tree.
    var expandedRootId by remember { mutableStateOf<String?>(null) }
    LaunchedEffect(hierarchy) {
        if (hierarchy != null && hierarchy.id != expandedRootId) {
            expandedIds = collectIdsUpToDepth(hierarchy, maxDepth = 10)
            expandedRootId = hierarchy.id
        }
    }

    // Expand to selected element when selection changes — O(depth) via parentMap
    LaunchedEffect(selectedElementId, parentMap) {
        if (selectedElementId != null && parentMap.isNotEmpty()) {
            val path = getPathFromParentMap(parentMap, selectedElementId)
            expandedIds = expandedIds + path.dropLast(1).toSet()
        }
    }

    // Compute selected path separately so it doesn't trigger flattenTree rebuild
    val selectedPath = remember(selectedElementId, parentMap) {
        if (selectedElementId != null && parentMap.isNotEmpty()) {
            getPathFromParentMap(parentMap, selectedElementId).toSet()
        } else emptySet()
    }

    // Pre-compute matching IDs for search — O(n) single pass instead of O(n^2) per-node
    val matchingIds = remember(hierarchy, debouncedQuery) {
        if (hierarchy != null && debouncedQuery.isNotEmpty()) {
            computeMatchingIds(hierarchy, debouncedQuery)
        } else emptySet()
    }

    // Flatten hierarchy for virtualized list + build index map for O(1) scroll
    val (flatNodes, nodeIndexMap) = remember(hierarchy, expandedIds, debouncedQuery) {
        if (hierarchy == null) {
            emptyList<FlatTreeNode>() to emptyMap()
        } else {
            val nodes = flattenTree(
                root = hierarchy,
                expandedIds = expandedIds,
                searchQuery = debouncedQuery,
                matchingIds = matchingIds,
            )
            nodes to nodes.withIndex().associate { (i, n) -> n.element.id to i }
        }
    }

    // Scroll to selected item — O(1) via index map
    val listState = rememberLazyListState()
    LaunchedEffect(selectedElementId, nodeIndexMap) {
        if (selectedElementId != null) {
            val index = nodeIndexMap[selectedElementId]
            if (index != null) {
                listState.animateScrollToItem(index)
            }
        }
    }

    Column(modifier = modifier.fillMaxSize()) {
        // Search bar
        dev.jasonpearson.automobile.desktop.core.components.SearchBar(
            query = searchQuery,
            onQueryChange = { searchQuery = it },
            placeholder = "Search views...",
            modifier = Modifier.fillMaxWidth().padding(8.dp),
        )

        // Tree list
        if (flatNodes.isEmpty()) {
            Box(
                modifier = Modifier.fillMaxSize(),
                contentAlignment = Alignment.Center,
            ) {
                if (hierarchy == null) {
                    Text(
                        "No hierarchy loaded",
                        color = colors.text.normal.copy(alpha = 0.5f),
                        fontSize = 12.sp,
                    )
                } else {
                    Text(
                        "No matching elements",
                        color = colors.text.normal.copy(alpha = 0.5f),
                        fontSize = 12.sp,
                    )
                }
            }
        } else {
            // Horizontal scroll state for the tree
            val horizontalScrollState = rememberScrollState()

            // Calculate max depth for determining content width
            val maxDepth = flatNodes.maxOfOrNull { it.depth } ?: 0
            // Estimate content width based on deepest nesting + typical content
            val estimatedContentWidth = ((maxDepth + 1) * 16 + 400).dp

            Box(modifier = Modifier.fillMaxSize().horizontalScroll(horizontalScrollState)) {
                LazyColumn(
                    state = listState,
                    modifier = Modifier.widthIn(min = estimatedContentWidth),
                ) {
                    items(flatNodes, key = { it.element.id }) { node ->
                        TreeNodeRow(
                            node = node,
                            isSelected = node.element.id == selectedElementId,
                            isHovered = node.element.id == hoveredElementId,
                            isInSelectedPath = node.element.id in selectedPath,
                            onToggleExpand = {
                                expandedIds = if (node.isExpanded) {
                                    expandedIds - node.element.id
                                } else {
                                    expandedIds + node.element.id
                                }
                            },
                            onSelect = { onElementSelected(node.element.id) },
                            onDoubleClick = { onElementDoubleClicked?.invoke(node.element.id) },
                            onHoverChange = { isHovered ->
                                onElementHovered(if (isHovered) node.element.id else null)
                            },
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun TreeNodeRow(
    node: FlatTreeNode,
    isSelected: Boolean,
    isHovered: Boolean,
    isInSelectedPath: Boolean,
    onToggleExpand: () -> Unit,
    onSelect: () -> Unit,
    onDoubleClick: () -> Unit,
    onHoverChange: (Boolean) -> Unit,
) {
    val colors = SharedTheme.globalColors

    val bgColor = when {
        isSelected -> Color(0xFF2196F3).copy(alpha = 0.2f)
        isHovered -> colors.text.normal.copy(alpha = 0.08f)
        isInSelectedPath -> colors.text.normal.copy(alpha = 0.04f)
        else -> Color.Transparent
    }

    Row(
        modifier = Modifier
            .widthIn(min = 200.dp)  // Minimum width to ensure content doesn't wrap
            .background(bgColor)
            .pointerInput(Unit) {
                detectTapGestures(
                    onTap = { onSelect() },
                    onDoubleTap = { onDoubleClick() },
                )
            }
            .onPointerEvent(PointerEventType.Enter) { onHoverChange(true) }
            .onPointerEvent(PointerEventType.Exit) { onHoverChange(false) }
            .pointerHoverIcon(PointerIcon.Hand)
            .padding(vertical = 2.dp, horizontal = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        // Indentation
        Spacer(Modifier.width((node.depth * 16).dp))

        // Expand/collapse chevron
        Box(
            modifier = Modifier.size(16.dp),
            contentAlignment = Alignment.Center,
        ) {
            if (node.hasChildren) {
                Text(
                    if (node.isExpanded) "\u25BC" else "\u25B6", // Down/right triangle
                    fontSize = 8.sp,
                    color = colors.text.normal.copy(alpha = 0.5f),
                    maxLines = 1,
                    modifier = Modifier
                        .clickable(onClick = onToggleExpand)
                        .pointerHoverIcon(PointerIcon.Hand),
                )
            }
        }

        Spacer(Modifier.width(4.dp))

        // Element icon based on type
        ElementIcon(className = node.element.className)

        Spacer(Modifier.width(6.dp))

        // Class name (simplified)
        Text(
            getSimpleClassName(node.element.className),
            fontSize = 11.sp,
            color = if (isSelected) Color(0xFF2196F3) else colors.text.normal,
            maxLines = 1,
            softWrap = false,
        )

        // Resource ID if present
        node.element.resourceId?.let { resId ->
            val simpleName = resId.substringAfterLast("/")
            Spacer(Modifier.width(4.dp))
            Text(
                "@$simpleName",
                fontSize = 10.sp,
                color = colors.text.normal.copy(alpha = 0.5f),
                maxLines = 1,
                softWrap = false,
            )
        }

        // Text content preview if present
        node.element.text?.takeIf { it.isNotEmpty() }?.let { text ->
            Spacer(Modifier.width(4.dp))
            Text(
                "\"${text.take(30)}${if (text.length > 30) "..." else ""}\"",
                fontSize = 10.sp,
                color = colors.text.normal.copy(alpha = 0.4f),
                maxLines = 1,
                softWrap = false,
            )
        }

        Spacer(Modifier.width(8.dp))

        // State indicators
        Row(
            horizontalArrangement = Arrangement.spacedBy(2.dp),
        ) {
            if (node.element.isClickable) {
                StateIndicator("\u261B", "Clickable") // Pointing hand
            }
            if (node.element.isFocused) {
                StateIndicator("\u25CE", "Focused") // Bullseye
            }
            if (node.element.isScrollable) {
                StateIndicator("\u2195", "Scrollable") // Up-down arrow
            }
        }

        // Right padding
        Spacer(Modifier.width(8.dp))
    }
}

@Composable
private fun ElementIcon(className: String) {
    val colors = SharedTheme.globalColors

    val (icon, color) = when {
        className.contains("Button") -> "\u25A3" to Color(0xFF4CAF50) // Square button
        className.contains("TextView") || className.contains("Text") -> "T" to Color(0xFF2196F3)
        className.contains("EditText") || className.contains("TextField") -> "\u270E" to Color(0xFFFFC107) // Pencil
        className.contains("ImageView") || className.contains("Image") -> "\u25A1" to Color(0xFF9C27B0) // Empty square
        className.contains("RecyclerView") || className.contains("ListView") -> "\u2261" to Color(0xFFFF5722) // Triple bar
        className.contains("Layout") || className.contains("ViewGroup") -> "\u25A2" to Color(0xFF607D8B) // Square outline
        className.contains("Toolbar") -> "\u2630" to Color(0xFF795548) // Hamburger
        className.contains("CheckBox") -> "\u2611" to Color(0xFF4CAF50) // Checked box
        className.contains("Switch") -> "\u25C9" to Color(0xFF4CAF50) // Toggle
        else -> "\u25A1" to colors.text.normal.copy(alpha = 0.5f) // Generic
    }

    Text(
        icon,
        fontSize = 12.sp,
        color = color,
    )
}

@Composable
private fun StateIndicator(icon: String, tooltip: String) {
    val colors = SharedTheme.globalColors

    Text(
        icon,
        fontSize = 9.sp,
        color = colors.text.normal.copy(alpha = 0.4f),
    )
}

private fun getSimpleClassName(fullName: String): String {
    return fullName.substringAfterLast(".")
}

/**
 * Flattens the tree hierarchy for virtualized rendering.
 * Filters by search query and handles expanded state.
 * [matchingIds] is pre-computed via [computeMatchingIds] for O(1) membership checks.
 */
private fun flattenTree(
    root: UIElementInfo,
    expandedIds: Set<String>,
    searchQuery: String,
    matchingIds: Set<String>,
): List<FlatTreeNode> {
    val result = mutableListOf<FlatTreeNode>()

    fun traverse(element: UIElementInfo, depth: Int) {
        val isIncluded = searchQuery.isEmpty() || element.id in matchingIds

        if (isIncluded) {
            val hasMatchingChild = searchQuery.isNotEmpty() &&
                element.children.any { it.id in matchingIds }
            val isExpanded = element.id in expandedIds ||
                (searchQuery.isNotEmpty() && hasMatchingChild)

            result.add(
                FlatTreeNode(
                    element = element,
                    depth = depth,
                    isExpanded = isExpanded,
                    hasChildren = element.children.isNotEmpty(),
                )
            )

            if (isExpanded) {
                element.children.forEach { child ->
                    traverse(child, depth + 1)
                }
            }
        }
    }

    traverse(root, 0)
    return result
}

/**
 * Pre-compute the set of element IDs that match the search query or have matching descendants.
 * Single O(n) pass — each node is visited exactly once.
 */
fun computeMatchingIds(root: UIElementInfo, searchQuery: String): Set<String> {
    if (searchQuery.isEmpty()) return emptySet()
    val ids = mutableSetOf<String>()
    fun traverse(element: UIElementInfo): Boolean {
        val selfMatches = matchesSearch(element, searchQuery)
        var childMatches = false
        for (child in element.children) {
            if (traverse(child)) childMatches = true
        }
        if (selfMatches || childMatches) {
            ids.add(element.id)
            return true
        }
        return false
    }
    traverse(root)
    return ids
}

private fun matchesSearch(element: UIElementInfo, searchQuery: String): Boolean {
    val query = searchQuery.lowercase()
    return element.className.lowercase().contains(query) ||
        element.resourceId?.lowercase()?.contains(query) == true ||
        element.text?.lowercase()?.contains(query) == true ||
        element.contentDescription?.lowercase()?.contains(query) == true
}

/**
 * Collects all element IDs up to a given depth for auto-expansion.
 */
private fun collectIdsUpToDepth(root: UIElementInfo, maxDepth: Int): Set<String> {
    val result = mutableSetOf<String>()

    fun traverse(element: UIElementInfo, depth: Int) {
        if (depth < maxDepth && element.children.isNotEmpty()) {
            result.add(element.id)
            element.children.forEach { child ->
                traverse(child, depth + 1)
            }
        }
    }

    traverse(root, 0)
    return result

}
