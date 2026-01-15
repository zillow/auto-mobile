package dev.jasonpearson.automobile.accessibilityservice

import android.graphics.Rect
import android.os.Build
import android.util.Log
import android.view.accessibility.AccessibilityNodeInfo
import android.view.accessibility.AccessibilityWindowInfo
import dev.jasonpearson.automobile.accessibilityservice.models.ElementBounds
import dev.jasonpearson.automobile.accessibilityservice.models.ScreenDimensions
import dev.jasonpearson.automobile.accessibilityservice.models.TraversalOrderResult
import dev.jasonpearson.automobile.accessibilityservice.models.UIElementInfo
import dev.jasonpearson.automobile.accessibilityservice.models.ViewHierarchy
import dev.jasonpearson.automobile.accessibilityservice.models.WindowInfo
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
class ViewHierarchyExtractor(private val recompositionStore: RecompositionStore? = null) {

  companion object {
    private const val TAG = "ViewHierarchyExtractor"
    private const val MAX_DEPTH = 100 // Prevent infinite recursion
    private const val MAX_CHILDREN = 256 // Limit children to prevent memory issues
    private const val OCCLUSION_FILTER_ENABLED = true
    private const val OCCLUSION_THRESHOLD = 0.95
    private const val DEFAULT_WINDOW_KEY = -1

    private val GENERIC_CLASS_NAMES =
        setOf(
            "android.view.View",
            "android.widget.FrameLayout",
            "android.widget.ScrollView",
            "android.widget.TextView",
        )
  }

  private val json = Json { ignoreUnknownKeys = true }

  /**
   * Extracts view hierarchy from the active window.
   *
   * @param rootNode Root accessibility node
   * @param textFilter Optional text filter
   * @param screenDimensions Optional screen dimensions for offscreen filtering
   * @param dedupeTextContentDesc When true, omit content-desc when it equals text (default: true)
   * @param disableAllFiltering When true, disable all optimizations and filtering (for rawViewHierarchy)
   */
  fun extractFromActiveWindow(
      rootNode: AccessibilityNodeInfo?,
      textFilter: String? = null,
      screenDimensions: ScreenDimensions? = null,
      dedupeTextContentDesc: Boolean = true,
      disableAllFiltering: Boolean = false,
  ): ViewHierarchy? {
    if (rootNode == null) {
      Log.w(TAG, "Root node is null")
      return ViewHierarchy(error = "Root node is null")
    }

    return try {
      // Find accessibility-focused node before extracting hierarchy
      val accessibilityFocusedNode =
          rootNode.findFocus(AccessibilityNodeInfo.FOCUS_ACCESSIBILITY)

      val rootElement =
          extractNodeInfo(
              rootNode,
              0,
              textFilter,
              screenDimensions,
              dedupeTextContentDesc,
              accessibilityFocusedNode,
          )

      // Skip optimization and filtering if disableAllFiltering is true
      val processedElement = if (disableAllFiltering) {
        rootElement
      } else {
        val optimizedList = rootElement?.let { optimizeHierarchy(it) }
        Log.d(TAG, "[PROCESS] After optimizeHierarchy: ${optimizedList?.size} elements")

        val wrappedElement = optimizedList?.let { wrapOptimizedElements(it) }
        val wrappedTextCount = wrappedElement?.let { countTextNodes(it) } ?: 0
        Log.d(TAG, "[PROCESS] After wrapOptimizedElements: hasElement=${wrappedElement != null}, textNodes=$wrappedTextCount")

        val finalElement = wrappedElement?.let {
          if (OCCLUSION_FILTER_ENABLED) {
            val filtered = applyOcclusionFilteringSingleWindow(it)
            val filteredTextCount = filtered?.let { countTextNodes(it) } ?: 0
            Log.d(TAG, "[PROCESS] After applyOcclusionFiltering: hasElement=${filtered != null}, textNodes=$filteredTextCount")
            filtered
          } else {
            it
          }
        }
        finalElement
      }

      val intentChooserDetected =
          processedElement?.let { detectIntentChooserIndicators(it) } ?: false
      val notificationPermissionDetected =
          processedElement?.let {
            detectNotificationPermissionDialog(it, rootNode.packageName?.toString())
          }

      val unifiedHierarchy =
          processedElement?.let {
            val nodeElement = encodeChildrenToNodeElement(listOf(it))
            nodeElement?.let { root -> UIElementInfo(node = root) }
          }

      // Find the accessibility-focused element in the unified hierarchy
      val accessibilityFocusedElement =
          unifiedHierarchy?.let { findAccessibilityFocusedElement(it) }

      ViewHierarchy(
          packageName = rootNode.packageName?.toString(),
          hierarchy = unifiedHierarchy,
          intentChooserDetected = intentChooserDetected,
          notificationPermissionDetected = notificationPermissionDetected,
          accessibilityFocusedElement = accessibilityFocusedElement,
      )
    } catch (e: Exception) {
      Log.e(TAG, "Error extracting view hierarchy", e)
      ViewHierarchy(error = "Failed to extract view hierarchy: ${e.message}")
    }
  }

  /**
   * Extracts view hierarchy from all visible windows. This captures popups, toolbars, and other
   * floating windows that aren't in the main window.
   *
   * @param windows List of all accessibility windows (from AccessibilityService.windows)
   * @param activeWindowRoot Root node of the active window (for backward compatibility)
   * @param textFilter Optional text filter
   * @param screenDimensions Optional screen dimensions for offscreen filtering
   * @param dedupeTextContentDesc When true, omit content-desc when it equals text (default: true)
   * @param disableAllFiltering When true, disable all optimizations and filtering (for rawViewHierarchy)
   */
  fun extractFromAllWindows(
      windows: List<AccessibilityWindowInfo>,
      activeWindowRoot: AccessibilityNodeInfo?,
      textFilter: String? = null,
      screenDimensions: ScreenDimensions? = null,
      dedupeTextContentDesc: Boolean = true,
      disableAllFiltering: Boolean = false,
  ): ViewHierarchy {
    if (windows.isEmpty() && activeWindowRoot == null) {
      Log.w(TAG, "No windows available for extraction")
      return ViewHierarchy(error = "No windows available")
    }

    // Find accessibility-focused node across all windows
    var accessibilityFocusedNode: AccessibilityNodeInfo? = null
    for (window in windows) {
      val rootNode = window.root ?: continue
      val focusedInWindow = rootNode.findFocus(AccessibilityNodeInfo.FOCUS_ACCESSIBILITY)
      if (focusedInWindow != null) {
        accessibilityFocusedNode = focusedInWindow
        break
      }
    }
    // Fallback to activeWindowRoot if not found in windows list
    if (accessibilityFocusedNode == null && activeWindowRoot != null) {
      accessibilityFocusedNode =
          activeWindowRoot.findFocus(AccessibilityNodeInfo.FOCUS_ACCESSIBILITY)
    }

    val windowEntries = mutableListOf<WindowEntry>()
    var mainHierarchy: UIElementInfo? = null
    var mainPackageName: String? = null
    var intentChooserDetected = false
    var notificationPermissionDetected: Boolean? = null
    var activeWindowLayer = 0
    var activeWindowKey: Int? = null
    val windowInfos = mutableListOf<WindowInfo>()

    // Extract from each window
    for (window in windows) {
      try {
        val rootNode = window.root ?: continue
        val windowLayer = window.layer
        if (window.isActive) {
          activeWindowLayer = windowLayer
          activeWindowKey = window.id
        }

        val windowType =
            when (window.type) {
              AccessibilityWindowInfo.TYPE_APPLICATION -> "application"
              AccessibilityWindowInfo.TYPE_INPUT_METHOD -> "input_method"
              AccessibilityWindowInfo.TYPE_SYSTEM -> "system"
              AccessibilityWindowInfo.TYPE_ACCESSIBILITY_OVERLAY -> "accessibility_overlay"
              AccessibilityWindowInfo.TYPE_SPLIT_SCREEN_DIVIDER -> "split_screen_divider"
              AccessibilityWindowInfo.TYPE_MAGNIFICATION_OVERLAY -> "magnification_overlay"
              else -> "unknown_${window.type}"
            }

        val windowBounds = Rect()
        window.getBoundsInScreen(windowBounds)
        windowInfos.add(
            WindowInfo(
                id = window.id,
                type = window.type,
                isActive = window.isActive,
                isFocused = window.isFocused,
                bounds = ElementBounds(windowBounds),
            )
        )

        val element =
            extractNodeInfo(
                rootNode,
                0,
                textFilter,
                screenDimensions,
                dedupeTextContentDesc,
                accessibilityFocusedNode,
            )
        // Skip optimization if disableAllFiltering is true
        val processedElement = if (disableAllFiltering) {
          element
        } else {
          element?.let {
            val optimizedList = optimizeHierarchy(it)
            val wrapped = wrapOptimizedElements(optimizedList)
            // Debug: Check if Tab elements have text children
            if (wrapped != null && window.isActive) {
              val wrappedJson = json.encodeToString(UIElementInfo.serializer(), wrapped)
              val hasTabText = wrappedJson.contains("\"text\":\"Tap\"")
              Log.d(TAG, "[WRAP-ACTIVE] Has Tap text after wrap: $hasTabText")
            }
            wrapped
          }
        }
        val packageName = rootNode.packageName?.toString()
        if (!intentChooserDetected && processedElement != null) {
          intentChooserDetected = detectIntentChooserIndicators(processedElement)
        }

        if (window.isActive) {
          mainHierarchy = processedElement
          mainPackageName = packageName
          if (notificationPermissionDetected == null && processedElement != null) {
            notificationPermissionDetected =
                detectNotificationPermissionDialog(processedElement, packageName)
          }
        }

        if (processedElement != null) {
          windowEntries.add(
              WindowEntry(
                  windowId = window.id,
                  windowType = windowType,
                  windowLayer = windowLayer,
                  packageName = packageName,
                  isActive = window.isActive,
                  isFocused = window.isFocused,
                  hierarchy = processedElement,
              )
          )
        }
      } catch (e: Exception) {
        Log.e(TAG, "Error extracting hierarchy from window ${window.id}", e)
      }
    }

    // Fallback to activeWindowRoot if no active window found in window list
    if (mainHierarchy == null && activeWindowRoot != null) {
      val element =
          extractNodeInfo(
              activeWindowRoot,
              0,
              textFilter,
              screenDimensions,
              dedupeTextContentDesc,
              accessibilityFocusedNode,
          )
      // Skip optimization if disableAllFiltering is true
      mainHierarchy = if (disableAllFiltering) {
        element
      } else {
        element?.let { wrapOptimizedElements(optimizeHierarchy(it)) }
      }
      mainPackageName = activeWindowRoot.packageName?.toString()
      if (!intentChooserDetected && mainHierarchy != null) {
        intentChooserDetected = detectIntentChooserIndicators(mainHierarchy!!)
      }
      if (notificationPermissionDetected == null && mainHierarchy != null) {
        notificationPermissionDetected =
            detectNotificationPermissionDialog(mainHierarchy!!, mainPackageName)
      }
      if (mainHierarchy != null) {
        val fallbackWindowId = activeWindowKey ?: DEFAULT_WINDOW_KEY
        windowEntries.add(
            WindowEntry(
                windowId = fallbackWindowId,
                windowType = "application",
                windowLayer = activeWindowLayer,
                packageName = mainPackageName,
                isActive = true,
                isFocused = true,
                hierarchy = mainHierarchy!!,
            )
        )
      }
    }

    // Skip occlusion filtering if disableAllFiltering is true
    if (!disableAllFiltering && OCCLUSION_FILTER_ENABLED && windowEntries.isNotEmpty()) {
      val occlusionInfo = buildOcclusionInfo(windowEntries)
      val filteredEntries =
          windowEntries.mapNotNull { windowEntry ->
            val hierarchy =
                filterOccludedHierarchy(
                    windowEntry.hierarchy,
                    occlusionInfo,
                    windowEntry.windowId,
                    path = "",
                    isRoot = false,
                )
            hierarchy?.let { windowEntry.copy(hierarchy = it) }
          }
      windowEntries.clear()
      windowEntries.addAll(filteredEntries)
      mainHierarchy = windowEntries.firstOrNull { it.isActive }?.hierarchy ?: mainHierarchy

      // Debug: Check if Tab text survives occlusion filtering
      mainHierarchy?.let {
        val filteredJson = json.encodeToString(UIElementInfo.serializer(), it)
        val hasTabText = filteredJson.contains("\"text\":\"Tap\"")
        Log.d(TAG, "[OCCLUSION-FILTERED] Has Tap text after filtering: $hasTabText")
      }
    }

    if (windowEntries.isEmpty()) {
      Log.w(TAG, "No visible windows available after filtering")
      return ViewHierarchy(error = "No visible windows available")
    }

    val sortedWindowRoots =
        windowEntries.sortedWith(compareBy<WindowEntry> { it.windowLayer }.thenBy { it.windowId })
            .map { it.hierarchy }
    val windowRootsElement = encodeChildrenToNodeElement(sortedWindowRoots)
    val unifiedHierarchy = windowRootsElement?.let { UIElementInfo(node = it) }

    val accessibilityFocusedElement =
        unifiedHierarchy?.let { findAccessibilityFocusedElement(it) }

    return ViewHierarchy(
        packageName = mainPackageName,
        hierarchy = unifiedHierarchy,
        windows = windowInfos.takeIf { it.isNotEmpty() },
        intentChooserDetected = intentChooserDetected,
        notificationPermissionDetected = notificationPermissionDetected,
        accessibilityFocusedElement = accessibilityFocusedElement,
    )
  }

  /** Detect intent chooser indicators in an optimized hierarchy. */
  private fun detectIntentChooserIndicators(element: UIElementInfo): Boolean {
    val textIndicators =
        setOf("Choose an app", "Open with", "Complete action using", "Always", "Just once")

    val classIndicators =
        listOf(
            "com.android.internal.app.ChooserActivity",
            "com.android.internal.app.ResolverActivity",
        )

    val resourceIdIndicators =
        listOf(
            "android:id/button_always",
            "android:id/button_once",
            "resolver_list",
            "chooser_list",
        )

    val nodeText = element.text ?: element.contentDesc ?: ""
    if (textIndicators.contains(nodeText)) {
      return true
    }

    val nodeClass = element.className ?: ""
    if (classIndicators.any { nodeClass.contains(it) }) {
      return true
    }

    val resourceId = element.resourceId ?: ""
    if (resourceIdIndicators.any { resourceId.contains(it) }) {
      return true
    }

    for (child in extractChildrenFromNode(element.node)) {
      if (detectIntentChooserIndicators(child)) {
        return true
      }
    }

    return false
  }

  internal fun detectIntentChooserIndicatorsForTest(element: UIElementInfo): Boolean {
    return detectIntentChooserIndicators(element)
  }

  /** Detect notification permission dialog indicators in an optimized hierarchy. */
  private fun detectNotificationPermissionDialog(
      element: UIElementInfo,
      packageName: String?,
  ): Boolean {
    if (packageName.isNullOrBlank() || !packageName.contains("permissioncontroller", true)) {
      return false
    }

    var hasNotificationText = false
    var hasPermissionButtons = false

    fun visit(node: UIElementInfo) {
      val text = (node.text ?: node.contentDesc ?: "").lowercase()
      if (text.contains("notification")) {
        hasNotificationText = true
      }

      val resourceId = node.resourceId?.lowercase() ?: ""
      if (
          resourceId.contains("permission_allow_button") ||
              resourceId.contains("permission_deny_button")
      ) {
        hasPermissionButtons = true
      }

      if (hasNotificationText && hasPermissionButtons) {
        return
      }

      for (child in extractChildrenFromNode(node.node)) {
        visit(child)
        if (hasNotificationText && hasPermissionButtons) {
          return
        }
      }
    }

    visit(element)
    return hasNotificationText && hasPermissionButtons
  }

  internal fun detectNotificationPermissionDialogForTest(
      element: UIElementInfo,
      packageName: String?,
  ): Boolean {
    return detectNotificationPermissionDialog(element, packageName)
  }

  /**
   * Recursively extracts node information with depth limiting, offscreen filtering, and zero-area
   * filtering.
   *
   * @param node The accessibility node to extract
   * @param depth Current recursion depth
   * @param textFilter Optional text filter
   * @param screenDimensions Optional screen dimensions for offscreen filtering
   * @param dedupeTextContentDesc When true, omit content-desc when it equals text
   * @param accessibilityFocusedNode The node that has accessibility focus (TalkBack cursor)
   */
  private fun extractNodeInfo(
      node: AccessibilityNodeInfo,
      depth: Int,
      textFilter: String? = null,
      screenDimensions: ScreenDimensions? = null,
      dedupeTextContentDesc: Boolean = true,
      accessibilityFocusedNode: AccessibilityNodeInfo? = null,
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

      // Filter nodes not actually visible to the user
      if (!node.isVisibleToUser) {
        return null
      }

      val children = mutableListOf<UIElementInfo>()
      val childCount = min(node.childCount, MAX_CHILDREN)

      for (i in 0 until childCount) {
        val child = node.getChild(i)
        if (child != null) {
          val childInfo =
              extractNodeInfo(
                  child,
                  depth + 1,
                  textFilter,
                  screenDimensions,
                  dedupeTextContentDesc,
                  accessibilityFocusedNode,
              )
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

      val extrasMap = extractExtras(node)
      val testTag = extractTestTag(extrasMap)

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
      val contentDesc =
          if (dedupeTextContentDesc && rawContentDesc == text) {
            null
          } else {
            rawContentDesc
          }

      val recompositionEntry =
          if (
              recompositionStore?.isEnabled() == true &&
                  recompositionStore.isForPackage(node.packageName?.toString())
          ) {
            recompositionStore.findMatch(extrasMap)
          } else {
            null
          }

      // Check if this node has accessibility focus
      val hasAccessibilityFocus =
          accessibilityFocusedNode != null && node == accessibilityFocusedNode

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
              accessibilityFocused = if (hasAccessibilityFocus) "true" else null,
              scrollable = if (node.isScrollable) "true" else null,
              password = if (node.isPassword) "true" else null,
              checkable = if (node.isCheckable) "true" else null,
              checked = if (node.isChecked) "true" else null,
              selected = if (node.isSelected) "true" else null,
              longClickable = if (node.isLongClickable) "true" else null,
              node = nodeElement,
              stateDescription = stateDescription,
              testTag = testTag,
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
              extras = extrasMap,
              recomposition = recompositionEntry,
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

  /**
   * Find the accessibility-focused element in the hierarchy.
   * Recursively searches for the element with accessibilityFocused == "true".
   */
  private fun findAccessibilityFocusedElement(element: UIElementInfo): UIElementInfo? {
    // Check if this element has accessibility focus
    if (element.isAccessibilityFocused) {
      return element
    }

    // Recursively check children
    val children = extractChildrenFromNode(element.node)
    for (child in children) {
      val focusedInChild = findAccessibilityFocusedElement(child)
      if (focusedInChild != null) {
        return focusedInChild
      }
    }

    return null
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

  private fun extractExtras(node: AccessibilityNodeInfo): Map<String, String>? {
    val extras = node.extras ?: return null
    val keys = extras.keySet()
    if (keys.isNullOrEmpty()) return null

    val map = mutableMapOf<String, String>()
    for (key in keys) {
      val value = extras.get(key)
      if (value != null) {
        map[key] = value.toString()
      }
    }
    return if (map.isEmpty()) null else map
  }

  private fun extractTestTag(extras: Map<String, String>?): String? {
    if (extras.isNullOrEmpty()) return null

    val candidates =
        listOf(
            "androidx.compose.ui.semantics.testTag",
            "androidx.compose.ui.semantics.TestTag",
            "androidx.compose.ui.testTag",
            "testTag",
            "test-tag",
        )

    for (key in candidates) {
      val value = extras[key]
      if (!value.isNullOrBlank()) {
        return value
      }
    }

    return extras.entries.firstOrNull { it.key.contains("testtag", ignoreCase = true) }?.value
  }

  /** Check if element meets filter criteria (matches test expectations) */
  private fun meetsFilterCriteria(element: UIElementInfo, textFilter: String? = null): Boolean {
    // String filter criteria
    val hasStringCriteria = hasStringCriteria(element)

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

  private fun hasStringCriteria(element: UIElementInfo): Boolean {
    return !element.text.isNullOrBlank() ||
        !element.resourceId.isNullOrBlank() ||
        !element.contentDesc.isNullOrBlank() ||
        !element.testTag.isNullOrBlank() ||
        !element.role.isNullOrBlank() ||
        !element.stateDescription.isNullOrBlank() ||
        !element.errorMessage.isNullOrBlank() ||
        !element.hintText.isNullOrBlank() ||
        !element.tooltipText.isNullOrBlank() ||
        !element.paneTitle.isNullOrBlank()
  }

  private fun decodeOptimizedChildren(nodeElement: JsonElement): List<UIElementInfo>? {
    return when {
      nodeElement is JsonObject -> {
        try {
          listOf(json.decodeFromJsonElement(UIElementInfo.serializer(), nodeElement))
        } catch (e: Exception) {
          null
        }
      }
      nodeElement is JsonArray -> {
        val children = mutableListOf<UIElementInfo>()
        for (childJson in nodeElement.jsonArray) {
          val child =
              try {
                json.decodeFromJsonElement(UIElementInfo.serializer(), childJson)
              } catch (e: Exception) {
                return null
              }
          children.add(child)
        }
        children
      }
      else -> null
    }
  }

  private fun wrapOptimizedElements(elements: List<UIElementInfo>): UIElementInfo? {
    if (elements.isEmpty()) {
      return null
    }
    if (elements.size == 1) {
      return elements[0]
    }

    val nodeElement = encodeChildrenToNodeElement(elements) ?: return null
    return UIElementInfo(node = nodeElement)
  }

  /**
   * Optimizes the hierarchy by:
   * 1. Promoting children of bounds-only wrapper nodes (structural nodes with only bounds)
   * 2. Filtering out bounds-only intermediate nodes
   * 3. Preserving text-bearing children of interactive elements (e.g., Tab labels)
   *
   * This significantly reduces hierarchy size for complex UIs like YouTube.
   */
  private fun optimizeHierarchy(element: UIElementInfo): List<UIElementInfo> {
    // Check if this element is a bounds-only wrapper (has no useful properties)
    val isBoundsOnlyWrapper = !meetsFilterCriteria(element)

    // Special handling: Never promote children of interactive elements (clickable/focusable)
    // This preserves Tab labels, NavigationBar labels, and other text children of interactive parents
    val isInteractive = element.clickable == "true" || element.focusable == "true" ||
                        element.selected == "true" || element.longClickable == "true"

    // Debug logging
    val elementDesc = buildString {
      append("text=${element.text?.take(20)}, ")
      append("resId=${element.resourceId?.substringAfterLast('.')?.take(15)}, ")
      append("clickable=${element.clickable}, focusable=${element.focusable}, ")
      append("bounds=${element.bounds}, ")
      append("hasNode=${element.node != null}")
    }
    Log.d(TAG, "[OPT] Element: $elementDesc, boundsOnly=$isBoundsOnlyWrapper, interactive=$isInteractive")

    // Now recursively optimize children
    val optimizedNode = element.node?.let { optimizeNode(it) }

    // Only promote children (flatten hierarchy) if this is a bounds-only wrapper AND not interactive
    if (isBoundsOnlyWrapper && !isInteractive) {
      if (optimizedNode == null) {
        Log.d(TAG, "[OPT] -> FILTER OUT (bounds-only, no children)")
        return emptyList()
      }

      val optimizedChildren = decodeOptimizedChildren(optimizedNode)
      if (optimizedChildren == null) {
        Log.d(TAG, "[OPT] -> KEEP AS-IS (couldn't decode children)")
        return listOf(element.copy(node = optimizedNode))
      }
      if (optimizedChildren.isEmpty()) {
        Log.d(TAG, "[OPT] -> FILTER OUT (bounds-only, empty children)")
        return emptyList()
      }
      Log.d(TAG, "[OPT] -> PROMOTE ${optimizedChildren.size} children")
      return optimizedChildren
    }

    Log.d(TAG, "[OPT] -> KEEP (meets criteria or interactive)")
    return listOf(element.copy(node = optimizedNode))
  }

  /** Check if a node or its children have text content */
  private fun hasTextInNode(nodeElement: JsonElement?): Boolean {
    if (nodeElement == null) return false

    return when (nodeElement) {
      is JsonObject -> {
        try {
          val element = json.decodeFromJsonElement(UIElementInfo.serializer(), nodeElement)
          !element.text.isNullOrBlank() || hasTextInNode(element.node)
        } catch (e: Exception) {
          false
        }
      }
      is JsonArray -> {
        nodeElement.jsonArray.any { hasTextInNode(it) }
      }
      else -> false
    }
  }

  /** Count text nodes recursively in hierarchy */
  private fun countTextNodes(element: UIElementInfo): Int {
    val hasText = if (!element.text.isNullOrBlank()) 1 else 0
    val childrenCount = element.node?.let { node ->
      when (node) {
        is JsonObject -> {
          try {
            val child = json.decodeFromJsonElement(UIElementInfo.serializer(), node)
            countTextNodes(child)
          } catch (e: Exception) {
            0
          }
        }
        is JsonArray -> {
          node.jsonArray.sumOf { childJson ->
            try {
              val child = json.decodeFromJsonElement(UIElementInfo.serializer(), childJson)
              countTextNodes(child)
            } catch (e: Exception) {
              0
            }
          }
        }
        else -> 0
      }
    } ?: 0
    return hasText + childrenCount
  }

  /** Recursively optimize node children (handles both single element and array). */
  private fun optimizeNode(nodeElement: JsonElement): JsonElement? {
    fun optimizeChild(childJson: JsonElement): List<JsonElement> {
      return try {
        val child = json.decodeFromJsonElement(UIElementInfo.serializer(), childJson)
        val optimizedChildren = optimizeHierarchy(child)
        optimizedChildren.map { json.encodeToJsonElement(UIElementInfo.serializer(), it) }
      } catch (e: Exception) {
        listOf(childJson)
      }
    }

    return when {
      nodeElement is JsonObject -> {
        val optimizedChildren = optimizeChild(nodeElement)
        Log.d(TAG, "[OPT-NODE] JsonObject: 1 child -> ${optimizedChildren.size} optimized")
        when {
          optimizedChildren.isEmpty() -> null
          optimizedChildren.size == 1 -> optimizedChildren[0]
          else -> JsonArray(optimizedChildren)
        }
      }
      nodeElement is JsonArray -> {
        val inputCount = nodeElement.jsonArray.size
        val optimizedChildren =
            nodeElement.jsonArray.flatMap { childJson -> optimizeChild(childJson) }
        Log.d(TAG, "[OPT-NODE] JsonArray: $inputCount children -> ${optimizedChildren.size} optimized")
        when {
          optimizedChildren.isEmpty() -> null
          optimizedChildren.size == 1 -> optimizedChildren[0]
          else -> JsonArray(optimizedChildren)
        }
      }
      else -> nodeElement
    }
  }

  private data class WindowEntry(
      val windowId: Int,
      val windowType: String,
      val windowLayer: Int,
      val packageName: String?,
      val isActive: Boolean,
      val isFocused: Boolean,
      val hierarchy: UIElementInfo,
  )

  private data class OrderCounter(var value: Int = 0)

  private data class NodeKey(val windowKey: Int, val path: String)

  private data class OcclusionNode(
      val key: NodeKey,
      val element: UIElementInfo,
      val bounds: ElementBounds,
      val windowLayer: Int,
      val windowKey: Int,
      val order: Int,
      val subtreeEnd: Int,
  )

  private data class OcclusionInfo(val coverage: Double, val occludedBy: String?)

  /**
   * Represents the relationship between two nodes in a tree hierarchy.
   */
  enum class NodeRelationship {
    /** Nodes share the same direct parent */
    SIBLING,
    /** Occluder is a sibling of one of the node's ancestors */
    UNCLE,
    /** Occluder is a descendant (child/grandchild) of the node */
    DESCENDANT,
    /** No special relationship */
    UNRELATED
  }

  /**
   * Determines the relationship between a node and a potential occluder based on their paths
   * and traversal order.
   *
   * @param nodePath The path of the node being checked (e.g., "0.0.0.1.0")
   * @param occluderPath The path of the potential occluder (e.g., "0.0.0.1.1")
   * @param nodeOrder The traversal order of the node
   * @param nodeSubtreeEnd The end of the node's subtree in traversal order
   * @param occluderOrder The traversal order of the occluder
   * @return The relationship between the two nodes
   */
  internal fun determineNodeRelationship(
      nodePath: String,
      occluderPath: String,
      nodeOrder: Int,
      nodeSubtreeEnd: Int,
      occluderOrder: Int,
  ): NodeRelationship {
    // Check if occluder is a descendant (child/grandchild) using traversal order
    val isDescendant = occluderOrder > nodeOrder && occluderOrder <= nodeSubtreeEnd
    if (isDescendant) {
      return NodeRelationship.DESCENDANT
    }

    // Extract parent paths
    val nodeParentPath = nodePath.substringBeforeLast('.', "")
    val occluderParentPath = occluderPath.substringBeforeLast('.', "")

    // Check if they're direct siblings (same parent). Root-level siblings have empty parent paths.
    if (nodeParentPath == occluderParentPath) {
      return NodeRelationship.SIBLING
    }

    // Check if occluder is a sibling of any ancestor (uncle/cousin)
    // If occluder's parent is a prefix of node's path, they share a common ancestor
    val isUncle = occluderParentPath.isNotEmpty() &&
                  nodePath.startsWith(occluderParentPath + ".") &&
                  occluderParentPath != nodeParentPath
    if (isUncle) {
      return NodeRelationship.UNCLE
    }

    return NodeRelationship.UNRELATED
  }

  private fun applyOcclusionFilteringSingleWindow(element: UIElementInfo): UIElementInfo? {
    val windowEntry =
        WindowEntry(
            windowId = DEFAULT_WINDOW_KEY,
            windowType = "application",
            windowLayer = 0,
            packageName = null,
            isActive = true,
            isFocused = true,
            hierarchy = element,
        )
    val occlusionInfo = buildOcclusionInfo(listOf(windowEntry))
    return filterOccludedHierarchy(
        element,
        occlusionInfo,
        DEFAULT_WINDOW_KEY,
        path = "",
        isRoot = false,
    )
  }

  private fun buildOcclusionInfo(
      windowEntries: List<WindowEntry>,
  ): Map<NodeKey, OcclusionInfo> {
    val nodes = mutableListOf<OcclusionNode>()
    for (windowEntry in windowEntries) {
      val hierarchy = windowEntry.hierarchy
      val windowKey = windowEntry.windowId
      val windowLayer = windowEntry.windowLayer
      collectOcclusionNodes(
          hierarchy,
          windowKey,
          windowLayer,
          path = "",
          orderCounter = OrderCounter(),
          nodes = nodes,
      )
    }

    if (nodes.isEmpty()) {
      return emptyMap()
    }

    val sortedNodes =
        nodes.sortedWith(compareBy<OcclusionNode> { it.windowLayer }.thenBy { it.order })
    val occlusionInfo = mutableMapOf<NodeKey, OcclusionInfo>()

    for (i in sortedNodes.indices) {
      val node = sortedNodes[i]
      val totalArea = node.bounds.width * node.bounds.height
      if (totalArea <= 0) continue

      val intersections = mutableListOf<ElementBounds>()
      var maxOverlap = 0
      var occludedBy: String? = null

      // Debug: Track occlusion for text nodes
      val isDebugNode = node.element.text == "Tap" || node.element.text == "Discover"
      if (isDebugNode) {
        Log.d(TAG, "[OCCLUSION] Node text='${node.element.text}', bounds=${node.bounds}, path='${node.key.path}', order=${node.order}, subtreeEnd=${node.subtreeEnd}")
      }

      for (j in i + 1 until sortedNodes.size) {
        val occluder = sortedNodes[j]
        if (occluder.windowKey == node.windowKey) {
          // Determine relationship between node and occluder
          val relationship = determineNodeRelationship(
              nodePath = node.key.path,
              occluderPath = occluder.key.path,
              nodeOrder = node.order,
              nodeSubtreeEnd = node.subtreeEnd,
              occluderOrder = occluder.order,
          )

          if (isDebugNode) {
            Log.d(TAG, "[OCCLUSION]   Check relation: occluderPath='${occluder.key.path}', relationship=$relationship")
          }

          // Skip descendants, siblings, and uncles - they should not occlude each other
          if (relationship != NodeRelationship.UNRELATED) {
            if (isDebugNode) {
              Log.d(TAG, "[OCCLUSION]   Skip $relationship: text='${occluder.element.text}', bounds=${occluder.bounds}, order=${occluder.order}")
            }
            continue
          }
        }

        val intersection = intersectBounds(node.bounds, occluder.bounds) ?: continue
        val overlapArea = intersection.width * intersection.height
        if (overlapArea <= 0) continue

        if (isDebugNode) {
          Log.d(TAG, "[OCCLUSION]   Occluder: text='${occluder.element.text}', bounds=${occluder.bounds}, overlap=$overlapArea, order=${occluder.order}")
        }

        intersections.add(intersection)

        if (overlapArea > maxOverlap) {
          maxOverlap = overlapArea
          occludedBy = resolveOccluderLabel(occluder)
        }
      }

      if (intersections.isNotEmpty()) {
        val coveredArea =
            calculateUnionArea(intersections, maxArea = (totalArea * OCCLUSION_THRESHOLD).toInt())
        val coverage = coveredArea.toDouble() / totalArea.toDouble()
        if (isDebugNode) {
          Log.d(TAG, "[OCCLUSION]   Result: coverage=$coverage (${(coverage*100).toInt()}%), threshold=$OCCLUSION_THRESHOLD, coveredArea=$coveredArea, totalArea=$totalArea")
        }
        if (coverage > 0.0) {
          occlusionInfo[node.key] = OcclusionInfo(coverage = coverage, occludedBy = occludedBy)
        }
      }
    }

    return occlusionInfo
  }

  private fun collectOcclusionNodes(
      element: UIElementInfo,
      windowKey: Int,
      windowLayer: Int,
      path: String,
      orderCounter: OrderCounter,
      nodes: MutableList<OcclusionNode>,
  ): Int {
    val start = orderCounter.value++
    var end = start
    val children = decodeChildrenFromNode(element.node)

    for ((index, child) in children.withIndex()) {
      val childPath = if (path.isBlank()) index.toString() else "$path.$index"
      val childEnd =
          collectOcclusionNodes(child, windowKey, windowLayer, childPath, orderCounter, nodes)
      end = max(end, childEnd)
    }

    val bounds = element.bounds
    if (bounds != null && !bounds.hasZeroArea()) {
      nodes.add(
          OcclusionNode(
              key = NodeKey(windowKey, path),
              element = element,
              bounds = bounds,
              windowLayer = windowLayer,
              windowKey = windowKey,
              order = start,
              subtreeEnd = end,
          )
      )
    }

    return end
  }

  private fun filterOccludedHierarchy(
      element: UIElementInfo,
      occlusionInfo: Map<NodeKey, OcclusionInfo>,
      windowKey: Int,
      path: String,
      isRoot: Boolean,
  ): UIElementInfo? {
    val key = NodeKey(windowKey, path)
    val info = occlusionInfo[key]
    val occlusionState =
        when {
          info == null -> null
          info.coverage >= OCCLUSION_THRESHOLD -> "hidden"
          info.coverage > 0.0 -> "partial"
          else -> null
        }

    // Debug logging for Tab text nodes
    if (element.text == "Tap" || element.text == "Discover") {
      Log.d(TAG, "[FILTER] text='${element.text}', path='$path', state=$occlusionState, coverage=${info?.coverage}, occludedBy='${info?.occludedBy}'")
    }

    val children = decodeChildrenFromNode(element.node)
    val filteredChildren =
        children.mapIndexedNotNull { index, child ->
          val childPath = if (path.isBlank()) index.toString() else "$path.$index"
          filterOccludedHierarchy(child, occlusionInfo, windowKey, childPath, isRoot = false)
        }

    val filteredNodeElement = encodeChildrenToNodeElement(filteredChildren)

    if (occlusionState == "hidden" && !isRoot) {
      if (element.text == "Tap" || element.text == "Discover") {
        Log.d(TAG, "[FILTER] -> REMOVED text='${element.text}'")
      }
      return null
    }

    val nodeToUse = filteredNodeElement

    return element.copy(
        node = nodeToUse,
        occlusionState = occlusionState,
        occludedBy = info?.occludedBy,
    )
  }

  private fun decodeChildrenFromNode(nodeElement: JsonElement?): List<UIElementInfo> {
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

  private fun encodeChildrenToNodeElement(children: List<UIElementInfo>): JsonElement? {
    return when {
      children.isEmpty() -> null
      children.size == 1 -> json.encodeToJsonElement(UIElementInfo.serializer(), children[0])
      else -> json.encodeToJsonElement(ListSerializer(UIElementInfo.serializer()), children)
    }
  }

  private fun intersectBounds(bounds: ElementBounds, other: ElementBounds): ElementBounds? {
    val left = max(bounds.left, other.left)
    val top = max(bounds.top, other.top)
    val right = min(bounds.right, other.right)
    val bottom = min(bounds.bottom, other.bottom)

    if (left >= right || top >= bottom) {
      return null
    }

    return ElementBounds(left, top, right, bottom)
  }

  private fun calculateUnionArea(rectangles: List<ElementBounds>, maxArea: Int? = null): Int {
    data class Event(val x: Int, val y1: Int, val y2: Int, val delta: Int)

    val events =
        rectangles
            .flatMap { rect ->
              listOf(
                  Event(rect.left, rect.top, rect.bottom, 1),
                  Event(rect.right, rect.top, rect.bottom, -1),
              )
            }
            .sortedBy { it.x }

    if (events.isEmpty()) return 0

    val activeIntervals = mutableListOf<Pair<Int, Int>>()
    var previousX = events.first().x
    var area = 0

    fun activeUnionLength(): Int {
      if (activeIntervals.isEmpty()) return 0
      val sorted = activeIntervals.sortedBy { it.first }
      var total = 0
      var currentStart = sorted[0].first
      var currentEnd = sorted[0].second

      for (i in 1 until sorted.size) {
        val (start, end) = sorted[i]
        if (start > currentEnd) {
          total += currentEnd - currentStart
          currentStart = start
          currentEnd = end
        } else {
          currentEnd = max(currentEnd, end)
        }
      }
      total += currentEnd - currentStart
      return total
    }

    for (event in events) {
      val dx = event.x - previousX
      if (dx > 0 && activeIntervals.isNotEmpty()) {
        val unionLength = activeUnionLength()
        area += unionLength * dx
        if (maxArea != null && area >= maxArea) {
          return area
        }
      }

      if (event.delta > 0) {
        activeIntervals.add(event.y1 to event.y2)
      } else {
        val index = activeIntervals.indexOfFirst { it.first == event.y1 && it.second == event.y2 }
        if (index >= 0) {
          activeIntervals.removeAt(index)
        }
      }

      previousX = event.x
    }

    return area
  }

  private fun resolveOccluderLabel(occluder: OcclusionNode): String {
    val element = occluder.element
    return element.resourceId?.takeIf { it.isNotBlank() }
        ?: element.contentDesc?.takeIf { it.isNotBlank() }
        ?: element.text?.takeIf { it.isNotBlank() }
        ?: element.className?.takeIf { it.isNotBlank() }
        ?: "unlabeled view"
  }

  /**
   * Extract information about a single focused element.
   * Used for getCurrentFocus command.
   */
  fun extractFocusedElementInfo(focusedNode: AccessibilityNodeInfo): UIElementInfo? {
    return try {
      val bounds = Rect()
      focusedNode.getBoundsInScreen(bounds)
      val elementBounds = ElementBounds(bounds)

      // Extract basic info about the focused element
      val extrasMap = extractExtras(focusedNode)
      val testTag = extractTestTag(extrasMap)

      var stateDescription: String? = null
      if (Build.VERSION.SDK_INT >= 30) {
        stateDescription = focusedNode.stateDescription?.toString()
      }
      val hintText: String? = focusedNode.hintText?.toString()
      val errorMessage: String? = focusedNode.error?.toString()
      var tooltipText: String? = null
      var paneTitle: String? = null
      if (Build.VERSION.SDK_INT >= 28) {
        tooltipText = focusedNode.tooltipText?.toString()
        paneTitle = focusedNode.paneTitle?.toString()
      }

      UIElementInfo(
          className = focusedNode.className?.toString(),
          resourceId = focusedNode.viewIdResourceName,
          text = focusedNode.text?.toString(),
          contentDesc = focusedNode.contentDescription?.toString(),
          clickable = focusedNode.isClickable.toString(),
          longClickable = focusedNode.isLongClickable.toString(),
          enabled = focusedNode.isEnabled.toString(),
          focusable = focusedNode.isFocusable.toString(),
          focused = focusedNode.isFocused.toString(),
          accessibilityFocused = focusedNode.isAccessibilityFocused.toString(),
          checkable = focusedNode.isCheckable.toString(),
          checked = focusedNode.isChecked.toString(),
          scrollable = focusedNode.isScrollable.toString(),
          password = focusedNode.isPassword.toString(),
          selected = focusedNode.isSelected.toString(),
          bounds = elementBounds,
          testTag = testTag,
          stateDescription = stateDescription,
          hintText = hintText,
          errorMessage = errorMessage,
          tooltipText = tooltipText,
          paneTitle = paneTitle,
      )
    } catch (e: Exception) {
      Log.e(TAG, "Error extracting focused element info", e)
      null
    }
  }

  /**
   * Extract traversal order from the active window.
   * Returns an ordered list of accessibility-focusable elements in TalkBack traversal order.
   */
  fun extractTraversalOrderFromActiveWindow(
      rootNode: AccessibilityNodeInfo?,
      screenDimensions: ScreenDimensions? = null,
  ): TraversalOrderResult {
    if (rootNode == null) {
      Log.w(TAG, "Root node is null for traversal order extraction")
      return TraversalOrderResult(elements = emptyList(), focusedIndex = null)
    }

    // Find accessibility-focused node
    val accessibilityFocusedNode = rootNode.findFocus(AccessibilityNodeInfo.FOCUS_ACCESSIBILITY)

    // Collect focusable elements in traversal order
    val focusableElements = mutableListOf<UIElementInfo>()
    var focusedIndex: Int? = null

    collectFocusableElements(
        rootNode,
        0,
        screenDimensions,
        accessibilityFocusedNode,
        focusableElements,
    )

    // Find the focused element index
    if (accessibilityFocusedNode != null) {
      focusedIndex = findFocusedElementIndex(focusableElements, accessibilityFocusedNode)
    }

    return TraversalOrderResult(
        elements = focusableElements,
        focusedIndex = focusedIndex,
    )
  }

  /**
   * Extract traversal order from all windows.
   * Returns an ordered list of accessibility-focusable elements across all windows.
   */
  fun extractTraversalOrderFromAllWindows(
      windows: List<AccessibilityWindowInfo>,
      activeWindowRoot: AccessibilityNodeInfo?,
      screenDimensions: ScreenDimensions? = null,
  ): TraversalOrderResult {
    if (windows.isEmpty() && activeWindowRoot == null) {
      Log.w(TAG, "No windows available for traversal order extraction")
      return TraversalOrderResult(elements = emptyList(), focusedIndex = null)
    }

    // Find accessibility-focused node across all windows
    var accessibilityFocusedNode: AccessibilityNodeInfo? = null
    for (window in windows) {
      val rootNode = window.root ?: continue
      val focusedInWindow = rootNode.findFocus(AccessibilityNodeInfo.FOCUS_ACCESSIBILITY)
      if (focusedInWindow != null) {
        accessibilityFocusedNode = focusedInWindow
        break
      }
    }
    // Fallback to activeWindowRoot
    if (accessibilityFocusedNode == null && activeWindowRoot != null) {
      accessibilityFocusedNode =
          activeWindowRoot.findFocus(AccessibilityNodeInfo.FOCUS_ACCESSIBILITY)
    }

    val focusableElements = mutableListOf<UIElementInfo>()
    var focusedIndex: Int? = null

    // Collect from each window, sorted by layer
    val sortedWindows = windows.sortedBy { it.layer }
    for (window in sortedWindows) {
      val rootNode = window.root ?: continue
      collectFocusableElements(
          rootNode,
          0,
          screenDimensions,
          accessibilityFocusedNode,
          focusableElements,
      )
    }

    // Find the focused element index
    if (accessibilityFocusedNode != null) {
      focusedIndex = findFocusedElementIndex(focusableElements, accessibilityFocusedNode)
    }

    return TraversalOrderResult(
        elements = focusableElements,
        focusedIndex = focusedIndex,
    )
  }

  /**
   * Collect accessibility-focusable elements in depth-first traversal order.
   * This matches TalkBack's default traversal behavior.
   */
  private fun collectFocusableElements(
      node: AccessibilityNodeInfo,
      depth: Int,
      screenDimensions: ScreenDimensions?,
      accessibilityFocusedNode: AccessibilityNodeInfo?,
      result: MutableList<UIElementInfo>,
  ) {
    if (depth > MAX_DEPTH) {
      return
    }

    try {
      val bounds = Rect()
      node.getBoundsInScreen(bounds)
      val elementBounds = ElementBounds(bounds)

      // Filter zero-area and offscreen nodes
      if (elementBounds.hasZeroArea()) {
        return
      }

      if (screenDimensions != null && screenDimensions.isValid()) {
        if (elementBounds.isCompletelyOffscreen(screenDimensions.width, screenDimensions.height)) {
          return
        }
      }

      // Check if this node is accessibility-focusable
      // A node is focusable if it supports ACTION_ACCESSIBILITY_FOCUS or ACTION_CLEAR_ACCESSIBILITY_FOCUS
      // The currently focused node typically has ACTION_CLEAR_ACCESSIBILITY_FOCUS instead
      val isFocusable = node.actionList?.any {
        it.id == AccessibilityNodeInfo.ACTION_ACCESSIBILITY_FOCUS ||
        it.id == AccessibilityNodeInfo.ACTION_CLEAR_ACCESSIBILITY_FOCUS
      } ?: false

      // Also include nodes that are currently accessibility focused
      val isCurrentlyFocused = node.isAccessibilityFocused

      if (isFocusable || isCurrentlyFocused) {
        // Extract element info for focusable elements
        val elementInfo = extractSimpleElementInfo(node, accessibilityFocusedNode)
        if (elementInfo != null) {
          result.add(elementInfo)
        }
      }

      // Recursively collect from children (depth-first traversal)
      val childCount = min(node.childCount, MAX_CHILDREN)
      for (i in 0 until childCount) {
        val child = node.getChild(i)
        if (child != null) {
          collectFocusableElements(
              child,
              depth + 1,
              screenDimensions,
              accessibilityFocusedNode,
              result,
          )
          child.recycle()
        }
      }
    } catch (e: Exception) {
      Log.w(TAG, "Error collecting focusable element at depth $depth", e)
    }
  }

  /**
   * Extract simplified element info for traversal order.
   * Only includes essential fields to reduce payload size.
   */
  private fun extractSimpleElementInfo(
      node: AccessibilityNodeInfo,
      accessibilityFocusedNode: AccessibilityNodeInfo?,
  ): UIElementInfo? {
    return try {
      val bounds = Rect()
      node.getBoundsInScreen(bounds)
      val elementBounds = ElementBounds(bounds)

      val extrasMap = extractExtras(node)
      val testTag = extractTestTag(extrasMap)

      // Check if this node is the focused one
      val isAccessibilityFocusedBool = accessibilityFocusedNode != null &&
          isSameNode(node, accessibilityFocusedNode)

      UIElementInfo(
          className = node.className?.toString(),
          resourceId = node.viewIdResourceName,
          text = node.text?.toString(),
          contentDesc = node.contentDescription?.toString(),
          clickable = node.isClickable.toString(),
          enabled = node.isEnabled.toString(),
          focusable = node.isFocusable.toString(),
          accessibilityFocused = isAccessibilityFocusedBool.toString(),
          bounds = elementBounds,
          testTag = testTag,
      )
    } catch (e: Exception) {
      Log.w(TAG, "Error extracting simple element info", e)
      null
    }
  }

  /**
   * Check if two AccessibilityNodeInfo objects refer to the same node.
   * Compares bounds, resource ID, and text.
   */
  private fun isSameNode(
      node1: AccessibilityNodeInfo,
      node2: AccessibilityNodeInfo,
  ): Boolean {
    try {
      val bounds1 = Rect()
      val bounds2 = Rect()
      node1.getBoundsInScreen(bounds1)
      node2.getBoundsInScreen(bounds2)

      return bounds1 == bounds2 &&
          node1.viewIdResourceName == node2.viewIdResourceName &&
          node1.text?.toString() == node2.text?.toString()
    } catch (e: Exception) {
      return false
    }
  }

  /**
   * Find the index of the focused element in the focusable elements list.
   */
  private fun findFocusedElementIndex(
      focusableElements: List<UIElementInfo>,
      accessibilityFocusedNode: AccessibilityNodeInfo,
  ): Int? {
    val focusedBounds = Rect()
    accessibilityFocusedNode.getBoundsInScreen(focusedBounds)
    val focusedResourceId = accessibilityFocusedNode.viewIdResourceName
    val focusedText = accessibilityFocusedNode.text?.toString()

    return focusableElements.indexOfFirst { element ->
      val bounds = element.bounds
      bounds != null &&
          bounds.left == focusedBounds.left &&
          bounds.top == focusedBounds.top &&
          bounds.right == focusedBounds.right &&
          bounds.bottom == focusedBounds.bottom &&
          element.resourceId == focusedResourceId &&
          element.text == focusedText
    }.takeIf { it >= 0 }
  }
}
