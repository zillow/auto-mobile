package dev.jasonpearson.automobile.ide.layout

import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonObject

private val log = com.intellij.openapi.diagnostic.Logger.getInstance("HierarchyParser")

/**
 * Parse a hierarchy JsonElement (from observation stream) into a [ParsedHierarchy]
 * containing the root tree plus pre-built element and parent maps.
 *
 * Supports two JSON formats:
 * 1. MCP format with attributes in "$" object:
 *    { "hierarchy": { "node": { "$": { "class": "...", "bounds": "..." }, "node": [...] } } }
 * 2. Direct format with attributes at root:
 *    { "hierarchy": { "node": { "className": "...", "bounds": {...} } } }
 */
fun parseHierarchyFromJson(hierarchyJson: JsonElement): ParsedHierarchy? {
    return try {
        val jsonObj = hierarchyJson.jsonObject
        val hierarchy = jsonObj["hierarchy"]?.jsonObject ?: return null
        val nodeElement = hierarchy["node"] ?: return null
        val elementMap = mutableMapOf<String, UIElementInfo>()
        val parentMap = mutableMapOf<String, String>()

        val root = parseNodeElement(nodeElement, 0, 0, elementMap, parentMap) ?: return null
        ParsedHierarchy(root = root, elementMap = elementMap, parentMap = parentMap)
    } catch (e: Exception) {
        log.warn("Failed to parse hierarchy JSON: ${e.message}", e)
        null
    }
}

/**
 * Parse a node JsonElement which can be either a single node or array of nodes.
 */
private fun parseNodeElement(
    nodeElement: JsonElement,
    depth: Int,
    siblingIndex: Int,
    elementMap: MutableMap<String, UIElementInfo>,
    parentMap: MutableMap<String, String>,
): UIElementInfo? {
    return when (nodeElement) {
        is JsonObject -> parseJsonObjectNode(nodeElement, depth, siblingIndex, elementMap, parentMap)
        is JsonArray -> {
            // If it's an array, parse the first element
            nodeElement.firstOrNull()?.let { parseNodeElement(it, depth, siblingIndex, elementMap, parentMap) }
        }
        else -> null
    }
}

/**
 * Parse a single node JsonObject into UIElementInfo.
 */
private fun parseJsonObjectNode(
    nodeObj: JsonObject,
    depth: Int,
    siblingIndex: Int,
    elementMap: MutableMap<String, UIElementInfo>,
    parentMap: MutableMap<String, String>,
): UIElementInfo {
    // Check if attributes are in "$" or at root level
    val attrs = nodeObj["\$"]?.jsonObject ?: nodeObj

    // Extract class name - try multiple keys
    val className = attrs.getString("class")
        ?: attrs.getString("className")
        ?: "android.view.View"

    // Extract other attributes
    val resourceId = attrs.getString("resource-id") ?: attrs.getString("resourceId")
    val text = attrs.getString("text")
    val contentDesc = attrs.getString("content-desc") ?: attrs.getString("contentDesc")

    // Parse bounds - can be string format or object format
    val bounds = parseBounds(attrs, nodeObj)

    // Parse boolean attributes (stored as "true"/"false" strings)
    val isClickable = attrs.getString("clickable") == "true"
    val isEnabled = attrs.getString("enabled") != "false"
    val isFocused = attrs.getString("focused") == "true"
    val isSelected = attrs.getString("selected") == "true"
    val isScrollable = attrs.getString("scrollable") == "true"
    val isCheckable = attrs.getString("checkable") == "true"
    val isChecked = attrs.getString("checked") == "true"

    // Parse children from "node" field
    val childrenElement = nodeObj["node"]
    val children = parseChildren(childrenElement, depth + 1, elementMap, parentMap)

    // Generate stable ID from depth, sibling index, and bounds — no global counter
    // so IDs remain stable when nodes are added/removed in unrelated subtrees.
    val baseId = resourceId
        ?: contentDesc?.let { "desc:$it" }
        ?: text?.take(20)?.let { "text:$it" }
        ?: "view"
    val id = "$baseId@d${depth}s${siblingIndex}:${bounds.left},${bounds.top}-${bounds.right},${bounds.bottom}"

    val element = UIElementInfo(
        id = id,
        className = className,
        resourceId = resourceId?.takeIf { it.isNotEmpty() },
        text = text?.takeIf { it.isNotEmpty() },
        contentDescription = contentDesc?.takeIf { it.isNotEmpty() },
        bounds = bounds,
        isClickable = isClickable,
        isEnabled = isEnabled,
        isFocused = isFocused,
        isSelected = isSelected,
        isScrollable = isScrollable,
        isCheckable = isCheckable,
        isChecked = isChecked,
        depth = depth,
        children = children,
    )

    // Populate lookup indexes as side-effect during parsing — zero extra traversals
    elementMap[id] = element
    for (child in children) {
        parentMap[child.id] = id
    }

    return element
}

/**
 * Parse bounds from either the attributes object or a separate bounds object.
 */
private fun parseBounds(attrs: JsonObject, nodeObj: JsonObject): ElementBounds {
    // Try bounds string in attributes "[left,top][right,bottom]"
    attrs.getString("bounds")?.let { boundsStr ->
        val parsed = parseBoundsString(boundsStr)
        if (parsed.width > 0 || parsed.height > 0) return parsed
    }

    // Try bounds object in node
    nodeObj["bounds"]?.let { boundsElement ->
        when (boundsElement) {
            is JsonPrimitive -> {
                boundsElement.contentOrNull?.let { return parseBoundsString(it) }
            }
            is JsonObject -> {
                return ElementBounds(
                    left = boundsElement.getInt("left") ?: 0,
                    top = boundsElement.getInt("top") ?: 0,
                    right = boundsElement.getInt("right") ?: 0,
                    bottom = boundsElement.getInt("bottom") ?: 0,
                )
            }
            else -> {}
        }
    }

    return ElementBounds(0, 0, 0, 0)
}

/**
 * Parse bounds string format "[left,top][right,bottom]".
 */
private fun parseBoundsString(boundsStr: String): ElementBounds {
    val regex = """\[(\d+),(\d+)\]\[(\d+),(\d+)\]""".toRegex()
    val match = regex.find(boundsStr)
    return if (match != null) {
        val (left, top, right, bottom) = match.destructured
        ElementBounds(
            left = left.toIntOrNull() ?: 0,
            top = top.toIntOrNull() ?: 0,
            right = right.toIntOrNull() ?: 0,
            bottom = bottom.toIntOrNull() ?: 0,
        )
    } else {
        ElementBounds(0, 0, 0, 0)
    }
}

/**
 * Parse child nodes from the "node" field which can be a single object or array.
 */
private fun parseChildren(
    childrenElement: JsonElement?,
    parentDepth: Int,
    elementMap: MutableMap<String, UIElementInfo>,
    parentMap: MutableMap<String, String>,
): List<UIElementInfo> {
    if (childrenElement == null) return emptyList()

    return when (childrenElement) {
        is JsonArray -> {
            childrenElement.mapIndexedNotNull { index, elem ->
                parseNodeElement(elem, parentDepth, index, elementMap, parentMap)
            }
        }
        is JsonObject -> {
            listOfNotNull(parseJsonObjectNode(childrenElement, parentDepth, 0, elementMap, parentMap))
        }
        else -> emptyList()
    }
}

// Extension functions for safe JSON access

private fun JsonObject.getString(key: String): String? {
    return this[key]?.let {
        when (it) {
            is JsonPrimitive -> it.contentOrNull?.takeIf { str -> str.isNotEmpty() }
            else -> null
        }
    }
}

private fun JsonObject.getInt(key: String): Int? {
    return this[key]?.let {
        when (it) {
            is JsonPrimitive -> it.intOrNull
            else -> null
        }
    }
}
