package com.zillow.automobile.accessibilityservice

import android.graphics.Rect
import android.util.Log
import android.view.accessibility.AccessibilityNodeInfo
import android.view.accessibility.AccessibilityWindowInfo
import com.zillow.automobile.accessibilityservice.models.ElementBounds
import com.zillow.automobile.accessibilityservice.models.UIElementInfo
import com.zillow.automobile.accessibilityservice.models.ViewHierarchy
import com.zillow.automobile.accessibilityservice.models.WindowInfo
import kotlin.math.max
import kotlin.math.min
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonArray

/**
 * Component responsible for parsing AccessibilityNodeInfo trees and converting them into
 * UIElementInfo objects for automated testing.
 */
class ViewHierarchyExtractor {

  companion object {
    private const val TAG = "ViewHierarchyExtractor"
    private const val MAX_DEPTH = 50 // Prevent infinite recursion
    private const val MAX_CHILDREN = 64 // Limit children to prevent memory issues
  }

  private val json = Json { ignoreUnknownKeys = true }

  /** Extracts view hierarchy from the active window */
  fun extractFromActiveWindow(rootNode: AccessibilityNodeInfo?): ViewHierarchy? {
    if (rootNode == null) {
      Log.w(TAG, "Root node is null")
      return ViewHierarchy(error = "Root node is null")
    }

    return try {
      val rootElement = extractNodeInfo(rootNode, 0)
      val processedElement = rootElement?.let { processForAccessibility(it) }

      ViewHierarchy(packageName = rootNode.packageName?.toString(), hierarchy = processedElement)
    } catch (e: Exception) {
      Log.e(TAG, "Error extracting view hierarchy", e)
      ViewHierarchy(error = "Failed to extract view hierarchy: ${e.message}")
    }
  }

  /** Extracts view hierarchy from all windows */
  fun extractFromAllWindows(windows: List<AccessibilityWindowInfo>): List<ViewHierarchy> {
    val hierarchies = mutableListOf<ViewHierarchy>()

    for (window in windows) {
      try {
        val rootNode = window.root
        if (rootNode != null) {
          val windowInfo =
              WindowInfo(
                  id = window.id,
                  type = window.type,
                  isActive = window.isActive,
                  isFocused = window.isFocused,
                  bounds = extractWindowBounds(window))

          val rootElement = extractNodeInfo(rootNode, 0)
          val processedElement = rootElement?.let { processForAccessibility(it) }

          val hierarchy =
              ViewHierarchy(
                  packageName = rootNode.packageName?.toString(),
                  hierarchy = processedElement,
                  windowInfo = windowInfo)
          hierarchies.add(hierarchy)
        }
      } catch (e: Exception) {
        Log.e(TAG, "Error extracting hierarchy from window ${window.id}", e)
        hierarchies.add(
            ViewHierarchy(error = "Failed to extract from window ${window.id}: ${e.message}"))
      }
    }

    return hierarchies
  }

  /** Recursively extracts node information with depth limiting */
  private fun extractNodeInfo(node: AccessibilityNodeInfo, depth: Int): UIElementInfo? {
    if (depth > MAX_DEPTH) {
      Log.w(TAG, "Maximum depth reached, stopping recursion")
      return null
    }

    return try {
      val bounds = Rect()
      node.getBoundsInScreen(bounds)

      val children = mutableListOf<UIElementInfo>()
      val childCount = min(node.childCount, MAX_CHILDREN)

      for (i in 0 until childCount) {
        val child = node.getChild(i)
        if (child != null) {
          val childInfo = extractNodeInfo(child, depth + 1)
          if (childInfo != null) {
            children.add(childInfo)
          }
          child.recycle() // Important: recycle child nodes
        }
      }

      // Create the child node structure
      val nodeElement =
          when {
            children.isEmpty() -> null
            children.size == 1 -> json.encodeToJsonElement(UIElementInfo.serializer(), children[0])
            else -> json.encodeToJsonElement(ListSerializer(UIElementInfo.serializer()), children)
          }

      UIElementInfo(
          text = node.text?.toString(),
          contentDesc = node.contentDescription?.toString(),
          className = node.className?.toString(),
          resourceId = node.viewIdResourceName,
          packageName = node.packageName?.toString(),
          bounds = ElementBounds(bounds),
          clickable = if (node.isClickable) "true" else "false",
          enabled = if (node.isEnabled) "true" else "false",
          focusable = if (node.isFocusable) "true" else "false",
          focused = if (node.isFocused) "true" else "false",
          scrollable = if (node.isScrollable) "true" else "false",
          password = if (node.isPassword) "true" else "false",
          checkable = if (node.isCheckable) "true" else "false",
          checked = if (node.isChecked) "true" else "false",
          selected = if (node.isSelected) "true" else "false",
          longClickable = if (node.isLongClickable) "true" else "false",
          node = nodeElement)
    } catch (e: Exception) {
      Log.e(TAG, "Error extracting node info at depth $depth", e)
      null
    }
  }

  /** Extracts bounds from AccessibilityWindowInfo */
  private fun extractWindowBounds(window: AccessibilityWindowInfo): ElementBounds? {
    return try {
      val bounds = Rect()
      window.getBoundsInScreen(bounds)
      ElementBounds(bounds)
    } catch (e: Exception) {
      Log.e(TAG, "Error extracting window bounds", e)
      null
    }
  }

  /** Processes the hierarchy to add accessibility information (z-index analysis) */
  private fun processForAccessibility(element: UIElementInfo): UIElementInfo {
    return if (element.isClickable && element.bounds != null) {
      val accessibilityScore = calculateAccessibilityScore(element)
      element.copy(accessible = accessibilityScore)
    } else {
      // Process children
      val processedNode = element.node?.let { processNodeForAccessibility(it) }
      element.copy(node = processedNode)
    }
  }

  /** Process node element for accessibility (handles both single and array cases) */
  private fun processNodeForAccessibility(nodeElement: JsonElement): JsonElement {
    return when {
      nodeElement is JsonObject -> {
        // Single child - convert to UIElementInfo and process
        try {
          val childElement = json.decodeFromJsonElement(UIElementInfo.serializer(), nodeElement)
          val processedChild = processForAccessibility(childElement)
          json.encodeToJsonElement(UIElementInfo.serializer(), processedChild)
        } catch (e: Exception) {
          nodeElement
        }
      }
      nodeElement is JsonArray -> {
        // Multiple children - process each
        val processedChildren =
            nodeElement.jsonArray.map { childJson ->
              try {
                val childElement = json.decodeFromJsonElement(UIElementInfo.serializer(), childJson)
                val processedChild = processForAccessibility(childElement)
                json.encodeToJsonElement(UIElementInfo.serializer(), processedChild)
              } catch (e: Exception) {
                childJson
              }
            }
        JsonArray(processedChildren)
      }
      else -> nodeElement
    }
  }

  /** Calculate accessibility score for clickable elements based on z-index analysis */
  private fun calculateAccessibilityScore(element: UIElementInfo): Double {
    val bounds = element.bounds ?: return 1.0

    // For now, implement basic accessibility scoring
    // In a full implementation, this would analyze overlapping elements
    val totalArea = bounds.width * bounds.height
    if (totalArea <= 0) return 0.0

    // Calculate covered area by analyzing overlapping elements
    val coveredArea = calculateCoveredArea(element, bounds)
    val accessibleArea = totalArea - coveredArea

    val score = accessibleArea.toDouble() / totalArea.toDouble()
    return kotlin.math.round(score * 1000.0) / 1000.0 // Round to 3 decimal places
  }

  /** Calculate area covered by overlapping elements */
  private fun calculateCoveredArea(element: UIElementInfo, bounds: ElementBounds): Int {
    // This is a simplified implementation
    // In practice, you'd need to traverse the full hierarchy to find overlapping elements

    // For demonstration, simulate some coverage based on child elements
    val children = extractChildrenFromNode(element.node)
    var coveredArea = 0

    for (child in children) {
      val childBounds = child.bounds
      if (childBounds != null && !child.isClickable) {
        // Calculate intersection with parent bounds
        val intersection = calculateIntersection(bounds, childBounds)
        if (intersection > 0) {
          coveredArea += intersection
        }
      }
    }

    return coveredArea
  }

  /** Calculate intersection area between two bounds */
  private fun calculateIntersection(bounds1: ElementBounds, bounds2: ElementBounds): Int {
    val left = max(bounds1.left, bounds2.left)
    val top = max(bounds1.top, bounds2.top)
    val right = min(bounds1.right, bounds2.right)
    val bottom = min(bounds1.bottom, bounds2.bottom)

    return if (left < right && top < bottom) {
      (right - left) * (bottom - top)
    } else {
      0
    }
  }

  /** Extract children from node JsonElement */
  private fun extractChildrenFromNode(nodeElement: JsonElement?): List<UIElementInfo> {
    if (nodeElement == null) return emptyList()

    return try {
      when {
        nodeElement is JsonObject -> {
          val child = json.decodeFromJsonElement(UIElementInfo.serializer(), nodeElement)
          listOf(child)
        }

        nodeElement is JsonArray -> {
          nodeElement.jsonArray.mapNotNull { childJson ->
            try {
              json.decodeFromJsonElement(UIElementInfo.serializer(), childJson)
            } catch (e: Exception) {
              null
            }
          }
        }

        else -> emptyList()
      }
    } catch (e: Exception) {
      emptyList()
    }
  }

  /** Filters view hierarchy to remove noise and focus on interactive elements */
  fun filterViewHierarchy(hierarchy: ViewHierarchy): ViewHierarchy {
    val filteredRoot = hierarchy.hierarchy?.let { filterElement(it) }
    return hierarchy.copy(hierarchy = filteredRoot)
  }

  /** Recursively filters elements to keep only useful ones */
  private fun filterElement(element: UIElementInfo): UIElementInfo? {
    // Keep elements that meet filter criteria (match test expectations)
    val shouldKeep = meetsFilterCriteria(element)

    // Filter children recursively
    val filteredChildren = extractChildrenFromNode(element.node).mapNotNull { filterElement(it) }

    // Update node with filtered children
    val filteredNode =
        when {
          filteredChildren.isEmpty() -> null
          filteredChildren.size == 1 ->
              json.encodeToJsonElement(UIElementInfo.serializer(), filteredChildren[0])

          else ->
              json.encodeToJsonElement(ListSerializer(UIElementInfo.serializer()), filteredChildren)
        }

    // If this element should be kept or has filtered children, keep it
    return if (shouldKeep || filteredChildren.isNotEmpty()) {
      element.copy(node = filteredNode)
    } else {
      null
    }
  }

  /** Check if element meets filter criteria (matches test expectations) */
  private fun meetsFilterCriteria(element: UIElementInfo): Boolean {
    // String filter criteria
    val hasStringCriteria =
        !element.text.isNullOrBlank() ||
            !element.resourceId.isNullOrBlank() ||
            !element.contentDesc.isNullOrBlank()

    // Boolean filter criteria
    val hasBooleanCriteria =
        element.clickable == "true" ||
            element.scrollable == "true" ||
            element.focusable == "true" ||
            element.focused == "true" ||
            element.checkable == "true" ||
            element.checked == "true" ||
            element.selected == "true" ||
            element.longClickable == "true"

    return hasStringCriteria || hasBooleanCriteria
  }

  /** Finds all clickable elements in the hierarchy */
  fun findClickableElements(hierarchy: ViewHierarchy): List<UIElementInfo> {
    val clickableElements = mutableListOf<UIElementInfo>()
    hierarchy.hierarchy?.let { findClickableElementsRecursive(it, clickableElements) }
    return clickableElements
  }

  private fun findClickableElementsRecursive(
      element: UIElementInfo,
      result: MutableList<UIElementInfo>
  ) {
    if (element.isClickable) {
      result.add(element)
    }
    extractChildrenFromNode(element.node).forEach { findClickableElementsRecursive(it, result) }
  }

  /** Finds all scrollable elements in the hierarchy */
  fun findScrollableElements(hierarchy: ViewHierarchy): List<UIElementInfo> {
    val scrollableElements = mutableListOf<UIElementInfo>()
    hierarchy.hierarchy?.let { findScrollableElementsRecursive(it, scrollableElements) }
    return scrollableElements
  }

  private fun findScrollableElementsRecursive(
      element: UIElementInfo,
      result: MutableList<UIElementInfo>
  ) {
    if (element.isScrollable) {
      result.add(element)
    }
    extractChildrenFromNode(element.node).forEach { findScrollableElementsRecursive(it, result) }
  }

  /** Finds element by text content */
  fun findElementByText(
      hierarchy: ViewHierarchy,
      text: String,
      caseSensitive: Boolean = false
  ): UIElementInfo? {
    return hierarchy.hierarchy?.let { findElementByTextRecursive(it, text, caseSensitive) }
  }

  private fun findElementByTextRecursive(
      element: UIElementInfo,
      text: String,
      caseSensitive: Boolean
  ): UIElementInfo? {
    val elementText = element.text ?: ""
    val contentDesc = element.contentDesc ?: ""

    val matches =
        if (caseSensitive) {
          elementText.contains(text) || contentDesc.contains(text)
        } else {
          elementText.contains(text, ignoreCase = true) ||
              contentDesc.contains(text, ignoreCase = true)
        }

    if (matches) {
      return element
    }

    // Search in children
    for (child in extractChildrenFromNode(element.node)) {
      val found = findElementByTextRecursive(child, text, caseSensitive)
      if (found != null) {
        return found
      }
    }

    return null
  }

  /** Finds element by resource ID */
  fun findElementByResourceId(hierarchy: ViewHierarchy, resourceId: String): UIElementInfo? {
    return hierarchy.hierarchy?.let { findElementByResourceIdRecursive(it, resourceId) }
  }

  private fun findElementByResourceIdRecursive(
      element: UIElementInfo,
      resourceId: String
  ): UIElementInfo? {
    if (element.resourceId == resourceId) {
      return element
    }

    // Search in children
    for (child in extractChildrenFromNode(element.node)) {
      val found = findElementByResourceIdRecursive(child, resourceId)
      if (found != null) {
        return found
      }
    }

    return null
  }

  /** Find focused element in hierarchy */
  fun findFocusedElement(hierarchy: ViewHierarchy): UIElementInfo? {
    return hierarchy.hierarchy?.let { findFocusedElementRecursive(it) }
  }

  private fun findFocusedElementRecursive(element: UIElementInfo): UIElementInfo? {
    if (element.isFocused && element.bounds != null) {
      return element
    }

    // Search in children
    for (child in extractChildrenFromNode(element.node)) {
      val found = findFocusedElementRecursive(child)
      if (found != null) {
        return found
      }
    }

    return null
  }
}
