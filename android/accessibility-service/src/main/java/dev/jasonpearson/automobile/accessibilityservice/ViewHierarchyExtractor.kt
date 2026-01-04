package dev.jasonpearson.automobile.accessibilityservice

import android.graphics.Rect
import android.os.Build
import android.util.Log
import android.view.accessibility.AccessibilityNodeInfo
import android.view.accessibility.AccessibilityWindowInfo
import dev.jasonpearson.automobile.accessibilityservice.models.ElementBounds
import dev.jasonpearson.automobile.accessibilityservice.models.ScreenDimensions
import dev.jasonpearson.automobile.accessibilityservice.models.UIElementInfo
import dev.jasonpearson.automobile.accessibilityservice.models.ViewHierarchy
import dev.jasonpearson.automobile.accessibilityservice.models.WindowHierarchy
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
    private const val MAX_DEPTH = 100 // Prevent infinite recursion
    private const val MAX_CHILDREN = 256 // Limit children to prevent memory issues

    private val GENERIC_CLASS_NAMES =
        setOf(
            "android.view.View",
            "android.widget.FrameLayout",
            "android.widget.ScrollView",
            "android.widget.TextView")
  }

  private val json = Json { ignoreUnknownKeys = true }

  /**
   * Extracts view hierarchy from the active window.
   * @param rootNode Root accessibility node
   * @param textFilter Optional text filter
   * @param screenDimensions Optional screen dimensions for offscreen filtering
   * @param dedupeTextContentDesc When true, omit content-desc when it equals text (default: true)
   */
  fun extractFromActiveWindow(
      rootNode: AccessibilityNodeInfo?,
      textFilter: String? = null,
      screenDimensions: ScreenDimensions? = null,
      dedupeTextContentDesc: Boolean = true
  ): ViewHierarchy? {
    if (rootNode == null) {
      Log.w(TAG, "Root node is null")
      return ViewHierarchy(error = "Root node is null")
    }

    return try {
      val rootElement = extractNodeInfo(rootNode, 0, textFilter, screenDimensions, dedupeTextContentDesc)
      val optimizedElement = rootElement?.let { optimizeHierarchy(it) }

      ViewHierarchy(packageName = rootNode.packageName?.toString(), hierarchy = optimizedElement)
    } catch (e: Exception) {
      Log.e(TAG, "Error extracting view hierarchy", e)
      ViewHierarchy(error = "Failed to extract view hierarchy: ${e.message}")
    }
  }

  /**
   * Extracts view hierarchy from all visible windows.
   * This captures popups, toolbars, and other floating windows that aren't in the main window.
   * Filters out irrelevant windows (system UI, input methods, selection handles) to reduce payload size.
   *
   * @param windows List of all accessibility windows (from AccessibilityService.windows)
   * @param activeWindowRoot Root node of the active window (for backward compatibility)
   * @param textFilter Optional text filter
   * @param screenDimensions Optional screen dimensions for offscreen filtering
   * @param dedupeTextContentDesc When true, omit content-desc when it equals text (default: true)
   */
  fun extractFromAllWindows(
      windows: List<AccessibilityWindowInfo>,
      activeWindowRoot: AccessibilityNodeInfo?,
      textFilter: String? = null,
      screenDimensions: ScreenDimensions? = null,
      dedupeTextContentDesc: Boolean = true
  ): ViewHierarchy {
    if (windows.isEmpty() && activeWindowRoot == null) {
      Log.w(TAG, "No windows available for extraction")
      return ViewHierarchy(error = "No windows available")
    }

    val windowHierarchies = mutableListOf<WindowHierarchy>()
    var mainHierarchy: UIElementInfo? = null
    var mainPackageName: String? = null

    // Extract from each window
    for (window in windows) {
      try {
        val rootNode = window.root ?: continue

        val windowType = when (window.type) {
          AccessibilityWindowInfo.TYPE_APPLICATION -> "application"
          AccessibilityWindowInfo.TYPE_INPUT_METHOD -> "input_method"
          AccessibilityWindowInfo.TYPE_SYSTEM -> "system"
          AccessibilityWindowInfo.TYPE_ACCESSIBILITY_OVERLAY -> "accessibility_overlay"
          AccessibilityWindowInfo.TYPE_SPLIT_SCREEN_DIVIDER -> "split_screen_divider"
          AccessibilityWindowInfo.TYPE_MAGNIFICATION_OVERLAY -> "magnification_overlay"
          else -> "unknown_${window.type}"
        }

        val element = extractNodeInfo(rootNode, 0, textFilter, screenDimensions, dedupeTextContentDesc)
        val optimizedElement = element?.let { optimizeHierarchy(it) }
        val packageName = rootNode.packageName?.toString()

        // The active window becomes the main hierarchy (backward compatibility)
        if (window.isActive) {
          mainHierarchy = optimizedElement
          mainPackageName = packageName
          // Skip adding to windows list - it's already in main hierarchy
          continue
        }

        // Filter out irrelevant windows to reduce payload size
        if (shouldSkipWindow(windowType, optimizedElement)) {
          Log.d(TAG, "Skipping window ${window.id} (type=$windowType): filtered out")
          continue
        }

        // Get window layer for z-ordering
        val layer = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
          window.displayId
        } else {
          window.id
        }

        windowHierarchies.add(
          WindowHierarchy(
            windowId = window.id,
            windowType = windowType,
            windowLayer = layer,
            packageName = packageName,
            isActive = window.isActive,
            isFocused = window.isFocused,
            hierarchy = optimizedElement
          )
        )
      } catch (e: Exception) {
        Log.e(TAG, "Error extracting hierarchy from window ${window.id}", e)
      }
    }

    // Fallback to activeWindowRoot if no active window found in window list
    if (mainHierarchy == null && activeWindowRoot != null) {
      val element = extractNodeInfo(activeWindowRoot, 0, textFilter, screenDimensions, dedupeTextContentDesc)
      mainHierarchy = element?.let { optimizeHierarchy(it) }
      mainPackageName = activeWindowRoot.packageName?.toString()
    }

    Log.d(TAG, "Extracted ${windowHierarchies.size} additional window hierarchies (after filtering)")

    return ViewHierarchy(
      packageName = mainPackageName,
      hierarchy = mainHierarchy,
      windows = if (windowHierarchies.isNotEmpty()) windowHierarchies else null
    )
  }

  /**
   * Determines if a window should be skipped based on filtering heuristics.
   * We skip windows that don't add useful information for UI automation:
   * - System windows (status bar, navigation bar)
   * - Input method windows (keyboard)
   * - Tiny windows without actionable content (selection handles)
   * - Windows without any clickable elements with text/content-desc
   */
  private fun shouldSkipWindow(windowType: String, hierarchy: UIElementInfo?): Boolean {
    // Skip system windows (status bar, nav bar, etc.)
    if (windowType == "system") return true

    // Skip input method windows (keyboard)
    if (windowType == "input_method") return true

    // Skip accessibility overlays and magnification overlays
    if (windowType == "accessibility_overlay" || windowType == "magnification_overlay") return true

    // Skip split screen divider
    if (windowType == "split_screen_divider") return true

    // If no hierarchy, skip
    if (hierarchy == null) return true

    // Check if window has any actionable content worth keeping
    if (!hasActionableContent(hierarchy)) {
      // Check window size - tiny windows without content are likely selection handles
      val bounds = hierarchy.bounds
      if (bounds != null) {
        val width = bounds.right - bounds.left
        val height = bounds.bottom - bounds.top
        val area = width * height
        // Skip tiny windows (less than 100x100 = 10,000 px²)
        if (area < 10000) {
          Log.d(TAG, "Skipping tiny window with area $area px² and no actionable content")
          return true
        }
      }
      // No actionable content regardless of size
      return true
    }

    return false
  }

  /**
   * Checks if a hierarchy contains actionable content worth including.
   * Actionable content = clickable elements with text or content-desc.
   */
  private fun hasActionableContent(element: UIElementInfo): Boolean {
    // Check if this element is actionable
    if (element.isClickable || element.isLongClickable) {
      // Has meaningful identifier?
      if (!element.text.isNullOrBlank() ||
          !element.contentDesc.isNullOrBlank() ||
          !element.resourceId.isNullOrBlank()) {
        return true
      }
    }

    // Check children recursively via node property
    val nodeElement = element.node ?: return false
    return hasActionableContentInNode(nodeElement)
  }

  /**
   * Recursively checks if a node JsonElement contains actionable content.
   */
  private fun hasActionableContentInNode(nodeElement: JsonElement): Boolean {
    return when {
      nodeElement is JsonObject -> {
        try {
          val child = json.decodeFromJsonElement(UIElementInfo.serializer(), nodeElement)
          hasActionableContent(child)
        } catch (e: Exception) {
          false
        }
      }
      nodeElement is JsonArray -> {
        nodeElement.jsonArray.any { childJson ->
          try {
            val child = json.decodeFromJsonElement(UIElementInfo.serializer(), childJson)
            hasActionableContent(child)
          } catch (e: Exception) {
            false
          }
        }
      }
      else -> false
    }
  }

  /**
   * Recursively extracts node information with depth limiting, offscreen filtering, and zero-area filtering.
   * @param node The accessibility node to extract
   * @param depth Current recursion depth
   * @param textFilter Optional text filter
   * @param screenDimensions Optional screen dimensions for offscreen filtering
   * @param dedupeTextContentDesc When true, omit content-desc when it equals text
   */
  private fun extractNodeInfo(
      node: AccessibilityNodeInfo,
      depth: Int,
      textFilter: String? = null,
      screenDimensions: ScreenDimensions? = null,
      dedupeTextContentDesc: Boolean = true
  ): UIElementInfo? {
    if (depth > MAX_DEPTH) {
      return null
    }

    return try {
      val bounds = Rect()
      node.getBoundsInScreen(bounds)
      val elementBounds = ElementBounds(bounds)

      // Filter zero-area bounds early
      if (elementBounds.hasZeroArea()) {
        return null
      }

      // Filter completely offscreen nodes early to avoid processing subtrees
      if (screenDimensions != null && screenDimensions.isValid()) {
        if (elementBounds.isCompletelyOffscreen(screenDimensions.width, screenDimensions.height)) {
          return null
        }
      }

      val children = mutableListOf<UIElementInfo>()
      val childCount = min(node.childCount, MAX_CHILDREN)

      for (i in 0 until childCount) {
        val child = node.getChild(i)
        if (child != null) {
          val childInfo = extractNodeInfo(child, depth + 1, textFilter, screenDimensions, dedupeTextContentDesc)
          if (childInfo != null) {
            children.add(childInfo)
          }
        }
      }

      // Extract extra semantics fields
      var stateDescription: String? = null
      var text: String? = null
      var textSize: Float? = null
      var textColor: String? = null
      var tooltipText: String? = null
      var paneTitle: String? = null
      var liveRegion: String? = null
      var collectionInfo: String? = null
      var collectionItemInfo: String? = null
      var rangeInfo: String? = null
      var inputType: String? = null
      var actions: List<String>? = null

      // Check direct APIs if available
      if (Build.VERSION.SDK_INT >= 30) {
        stateDescription = node.stateDescription?.toString()
      }
      val hintText: String? = node.hintText?.toString()
      val errorMessage: String? = node.error?.toString()
      if (Build.VERSION.SDK_INT >= 28) {
        tooltipText = node.tooltipText?.toString()
        paneTitle = node.paneTitle?.toString()
      }

      // Extract accessibility actions
      val actionList = node.actionList
      if (actionList != null && actionList.isNotEmpty()) {
        actions =
            actionList.mapNotNull { action ->
              when (action.id) {
                AccessibilityNodeInfo.ACTION_ACCESSIBILITY_FOCUS -> "accessibility_focus"
                AccessibilityNodeInfo.ACTION_CLEAR_ACCESSIBILITY_FOCUS ->
                    "clear_accessibility_focus"
                AccessibilityNodeInfo.ACTION_CLEAR_FOCUS -> "clear_focus"
                AccessibilityNodeInfo.ACTION_CLEAR_SELECTION -> "clear_selection"
                AccessibilityNodeInfo.ACTION_CLICK -> "click"
                AccessibilityNodeInfo.ACTION_COLLAPSE -> "collapse"
                AccessibilityNodeInfo.ACTION_COPY -> "copy"
                AccessibilityNodeInfo.ACTION_CUT -> "cut"
                AccessibilityNodeInfo.ACTION_DISMISS -> "dismiss"
                AccessibilityNodeInfo.ACTION_EXPAND -> "expand"
                AccessibilityNodeInfo.ACTION_FOCUS -> "focus"
                AccessibilityNodeInfo.ACTION_LONG_CLICK -> "long_click"
                AccessibilityNodeInfo.ACTION_NEXT_AT_MOVEMENT_GRANULARITY ->
                    "next_at_movement_granularity"
                AccessibilityNodeInfo.ACTION_NEXT_HTML_ELEMENT -> "next_html_element"
                AccessibilityNodeInfo.ACTION_PASTE -> "paste"
                AccessibilityNodeInfo.ACTION_PREVIOUS_AT_MOVEMENT_GRANULARITY ->
                    "previous_at_movement_granularity"
                AccessibilityNodeInfo.ACTION_PREVIOUS_HTML_ELEMENT -> "previous_html_element"
                AccessibilityNodeInfo.ACTION_SCROLL_BACKWARD -> "scroll_backward"
                AccessibilityNodeInfo.ACTION_SCROLL_FORWARD -> "scroll_forward"
                AccessibilityNodeInfo.ACTION_SELECT -> "select"
                AccessibilityNodeInfo.ACTION_SET_SELECTION -> "set_selection"
                AccessibilityNodeInfo.ACTION_SET_TEXT -> "set_text"
                else -> null
              }
            }

        if (actions.isEmpty()) {
          actions = null
        }
      }

      // Extract collection info
      node.collectionInfo?.let { collectionInfo = "rows:${it.rowCount},cols:${it.columnCount}" }

      // Extract collection item info
      node.collectionItemInfo?.let {
        collectionItemInfo = "row:${it.rowIndex},col:${it.columnIndex}"
      }

      // Extract range info
      node.rangeInfo?.let { rangeInfo = "current:${it.current},min:${it.min},max:${it.max}" }

      val inputTypeInt = node.inputType
      if (inputTypeInt != 0) {
        inputType =
            when (inputTypeInt) {
              android.text.InputType.TYPE_CLASS_TEXT -> "text"
              android.text.InputType.TYPE_CLASS_NUMBER -> "number"
              android.text.InputType.TYPE_CLASS_PHONE -> "phone"
              android.text.InputType.TYPE_CLASS_DATETIME -> "datetime"
              android.text.InputType.TYPE_TEXT_VARIATION_EMAIL_ADDRESS -> "email_address"
              android.text.InputType.TYPE_TEXT_VARIATION_EMAIL_SUBJECT -> "email_subject"
              android.text.InputType.TYPE_TEXT_VARIATION_FILTER -> "filter"
              android.text.InputType.TYPE_TEXT_VARIATION_LONG_MESSAGE -> "long_message"
              android.text.InputType.TYPE_TEXT_VARIATION_PASSWORD -> "password"
              android.text.InputType.TYPE_TEXT_VARIATION_PERSON_NAME -> "person_name"
              android.text.InputType.TYPE_TEXT_VARIATION_PHONETIC -> "phonetic"
              android.text.InputType.TYPE_TEXT_VARIATION_POSTAL_ADDRESS -> "postal_address"
              android.text.InputType.TYPE_TEXT_VARIATION_SHORT_MESSAGE -> "short_message"
              android.text.InputType.TYPE_TEXT_VARIATION_URI -> "uri"
              android.text.InputType.TYPE_TEXT_VARIATION_VISIBLE_PASSWORD -> "visible_password"
              android.text.InputType.TYPE_TEXT_VARIATION_WEB_EDIT_TEXT -> "web_edit_text"
              android.text.InputType.TYPE_TEXT_VARIATION_WEB_EMAIL_ADDRESS -> "web_email_address"
              android.text.InputType.TYPE_TEXT_VARIATION_WEB_PASSWORD -> "web_password"
              else -> null
            }
      }

      val liveRegionMode = node.liveRegion
      if (liveRegionMode != 0) {
        liveRegion =
            when (liveRegionMode) {
              1 -> "polite"
              2 -> "assertive"
              else -> "live_region_$liveRegionMode"
            }
      }

      // Create the child node structure
      val nodeElement =
          when {
            children.isEmpty() -> null
            children.size == 1 -> json.encodeToJsonElement(UIElementInfo.serializer(), children[0])
            else -> json.encodeToJsonElement(ListSerializer(UIElementInfo.serializer()), children)
          }

      val className =
          if (node.className.isNullOrBlank() || GENERIC_CLASS_NAMES.contains(node.className)) {
            null
          } else {
            node.className?.toString()
          }

      node.text?.toString()?.let {
        text = it
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
          textSize = node.extraRenderingInfo?.textSizeInPx
        }
        textColor = null // Remove the getTextColorHex(node) call
      }

      // Dedupe content-desc when it equals text (keep text, omit content-desc)
      val rawContentDesc = node.contentDescription?.toString()
      val contentDesc = if (dedupeTextContentDesc && rawContentDesc == text) {
        null
      } else {
        rawContentDesc
      }

      val elementInfo =
          UIElementInfo(
              text = text,
              textSize = textSize,
              textColor = textColor,
              contentDesc = contentDesc,
              className = className,
              resourceId = node.viewIdResourceName,
              bounds = ElementBounds(bounds),
              clickable = if (node.isClickable) "true" else null,
              enabled = if (!node.isEnabled) "false" else null, // Only include if disabled
              focusable = if (node.isFocusable) "true" else null,
              focused = if (node.isFocused) "true" else null,
              scrollable = if (node.isScrollable) "true" else null,
              password = if (node.isPassword) "true" else null,
              checkable = if (node.isCheckable) "true" else null,
              checked = if (node.isChecked) "true" else null,
              selected = if (node.isSelected) "true" else null,
              longClickable = if (node.isLongClickable) "true" else null,
              node = nodeElement,
              stateDescription = stateDescription,
              hintText = hintText,
              errorMessage = errorMessage,
              tooltipText = tooltipText,
              paneTitle = paneTitle,
              liveRegion = liveRegion,
              collectionInfo = collectionInfo,
              collectionItemInfo = collectionItemInfo,
              rangeInfo = rangeInfo,
              inputType = inputType,
              actions = actions,
          )

      if (childCount == 0 && !meetsFilterCriteria(elementInfo, textFilter)) {
        null
      } else {
        elementInfo
      }
    } catch (e: Exception) {
      Log.e(TAG, "Error extracting node info at depth $depth", e)
      null
    }
  }

  /** Processes the hierarchy to add accessibility information (z-index analysis) */
  private fun processForAccessibility(element: UIElementInfo): UIElementInfo {
    return if (element.isClickable ||
        element.isLongClickable ||
        element.isCheckable ||
        element.isSelected ||
        element.isScrollable ||
        element.isFocusable) {
      val accessibilityScore = calculateAccessibilityScore(element)
      element.copy(accessible = accessibilityScore)
    } else {
      // Process children - copy() preserves all fields by default
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
          val child = json.decodeFromJsonElement(UIElementInfo.serializer(), nodeElement)
          val processedChild = processForAccessibility(child)
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
                val child = json.decodeFromJsonElement(UIElementInfo.serializer(), childJson)
                val processedChild = processForAccessibility(child)
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
    return max(
        0.0, min(1.0, kotlin.math.round(score * 1000.0) / 1000.0)) // Round to 3 decimal places
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
      val children =
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

      // Apply filter criteria to maintain consistency with extractNodeInfo behavior
      children.filter { child ->
        // If the child has its own children, keep it regardless of filter criteria
        // Otherwise, apply the filter criteria
        if (child.node != null) {
          true
        } else {
          meetsFilterCriteria(child)
        }
      }
    } catch (e: Exception) {
      emptyList()
    }
  }

  /** Check if element meets filter criteria (matches test expectations) */
  private fun meetsFilterCriteria(element: UIElementInfo, textFilter: String? = null): Boolean {
    // String filter criteria
    val hasStringCriteria =
        !element.text.isNullOrBlank() ||
            !element.resourceId.isNullOrBlank() ||
            !element.contentDesc.isNullOrBlank() ||
            !element.testTag.isNullOrBlank() ||
            !element.role.isNullOrBlank() ||
            !element.stateDescription.isNullOrBlank() ||
            !element.errorMessage.isNullOrBlank() ||
            !element.hintText.isNullOrBlank() ||
            !element.tooltipText.isNullOrBlank() ||
            !element.paneTitle.isNullOrBlank()

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

    // Accessibility feature criteria
    val hasAccessibilityFeatures =
        !element.liveRegion.isNullOrBlank() ||
            !element.collectionInfo.isNullOrBlank() ||
            !element.collectionItemInfo.isNullOrBlank() ||
            !element.rangeInfo.isNullOrBlank() ||
            !element.inputType.isNullOrBlank() ||
            !element.actions.isNullOrEmpty() ||
            !element.extras.isNullOrEmpty()

    // Apply text filter if provided
    val meetsTextFilter =
        textFilter?.let { filter -> element.text?.contains(filter, true) ?: false } ?: true

    return (hasStringCriteria || hasBooleanCriteria || hasAccessibilityFeatures) && meetsTextFilter
  }

  /**
   * Optimizes the hierarchy by:
   * 1. Collapsing single-child wrapper nodes (structural nodes with only bounds)
   * 2. Filtering out bounds-only intermediate nodes
   *
   * This significantly reduces hierarchy size for complex UIs like YouTube.
   */
  private fun optimizeHierarchy(element: UIElementInfo): UIElementInfo? {
    // First, recursively optimize children
    val optimizedNode = element.node?.let { optimizeNode(it) }

    // Check if this element is a bounds-only wrapper (has no useful properties)
    val isBoundsOnlyWrapper = !meetsFilterCriteria(element) && element.accessible == null

    // If it's a bounds-only wrapper with exactly one optimized child, collapse to that child
    if (isBoundsOnlyWrapper && optimizedNode != null) {
      val singleChild = extractSingleChild(optimizedNode)
      if (singleChild != null) {
        return singleChild
      }
    }

    // If it's a bounds-only wrapper with no children (leaf), filter it out
    if (isBoundsOnlyWrapper && optimizedNode == null) {
      return null
    }

    // Return element with optimized children
    return element.copy(node = optimizedNode)
  }

  /**
   * Recursively optimize node children (handles both single element and array).
   */
  private fun optimizeNode(nodeElement: JsonElement): JsonElement? {
    return when {
      nodeElement is JsonObject -> {
        try {
          val child = json.decodeFromJsonElement(UIElementInfo.serializer(), nodeElement)
          val optimized = optimizeHierarchy(child)
          optimized?.let { json.encodeToJsonElement(UIElementInfo.serializer(), it) }
        } catch (e: Exception) {
          nodeElement
        }
      }
      nodeElement is JsonArray -> {
        val optimizedChildren = nodeElement.jsonArray.mapNotNull { childJson ->
          try {
            val child = json.decodeFromJsonElement(UIElementInfo.serializer(), childJson)
            val optimized = optimizeHierarchy(child)
            optimized?.let { json.encodeToJsonElement(UIElementInfo.serializer(), it) }
          } catch (e: Exception) {
            childJson
          }
        }
        when {
          optimizedChildren.isEmpty() -> null
          optimizedChildren.size == 1 -> optimizedChildren[0]
          else -> JsonArray(optimizedChildren)
        }
      }
      else -> nodeElement
    }
  }

  /**
   * Extract single child from a node JsonElement.
   * Returns the child if there's exactly one, null otherwise.
   */
  private fun extractSingleChild(nodeElement: JsonElement): UIElementInfo? {
    return when {
      nodeElement is JsonObject -> {
        try {
          json.decodeFromJsonElement(UIElementInfo.serializer(), nodeElement)
        } catch (e: Exception) {
          null
        }
      }
      nodeElement is JsonArray && nodeElement.jsonArray.size == 1 -> {
        try {
          json.decodeFromJsonElement(UIElementInfo.serializer(), nodeElement.jsonArray[0])
        } catch (e: Exception) {
          null
        }
      }
      else -> null
    }
  }
}
