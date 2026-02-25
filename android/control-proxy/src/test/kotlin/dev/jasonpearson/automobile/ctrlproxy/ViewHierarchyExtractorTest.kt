package dev.jasonpearson.automobile.ctrlproxy

import android.graphics.Rect
import dev.jasonpearson.automobile.ctrlproxy.models.ElementBounds
import dev.jasonpearson.automobile.ctrlproxy.models.UIElementInfo
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.json.Json
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class ViewHierarchyExtractorTest {

  private lateinit var extractor: ViewHierarchyExtractor
  private val json = Json { ignoreUnknownKeys = true }

  @Before
  fun setUp() {
    extractor = ViewHierarchyExtractor()
  }

  @Test
  fun `extractFromActiveWindow returns error when rootNode is null`() = runTest {
    val result = extractor.extractFromActiveWindow(null)
    assertNotNull(result)
    assertEquals("Root node is null", result!!.error)
  }

  @Test
  fun `filterViewHierarchy removes non-interactive elements without content`() = runTest {
    val emptyElement =
        UIElementInfo(
            text = null,
            contentDesc = null,
            resourceId = null,
            clickable = "false",
            focusable = "false",
            scrollable = "false",
        )

    val interactiveElement = UIElementInfo(text = "Button", clickable = "true")

    val elementWithContent = UIElementInfo(text = "Some text", clickable = "false")

    val children = listOf(emptyElement, interactiveElement, elementWithContent)
    val childrenJson =
        json.encodeToJsonElement(ListSerializer(UIElementInfo.serializer()), children)

    val rootElement = UIElementInfo(className = "android.widget.LinearLayout", node = childrenJson)

    // Extract children from filtered hierarchy
    val filteredChildren = extractor.extractChildrenFromHierarchy(rootElement)
    assertEquals(2, filteredChildren.size)

    // Should keep interactive element and element with content
    assertTrue(filteredChildren.any { it.text == "Button" && it.isClickable })
    assertTrue(filteredChildren.any { it.text == "Some text" })
  }

  @Test
  fun `ElementBounds calculates width and height correctly`() {
    val bounds = ElementBounds(10, 20, 100, 80)

    assertEquals(90, bounds.width)
    assertEquals(60, bounds.height)
    assertEquals(55, bounds.centerX)
    assertEquals(50, bounds.centerY)
  }

  @Test
  fun `ElementBounds constructor from Rect works correctly`() {
    val rect = Rect(5, 10, 50, 60)
    val bounds = ElementBounds(rect)

    assertEquals(5, bounds.left)
    assertEquals(10, bounds.top)
    assertEquals(50, bounds.right)
    assertEquals(60, bounds.bottom)
  }

  @Test
  fun `ElementBounds fromString parses bounds correctly`() {
    val boundsString = "[10,20][100,80]"
    val bounds = ElementBounds.fromString(boundsString)

    assertNotNull(bounds)
    assertEquals(10, bounds!!.left)
    assertEquals(20, bounds.top)
    assertEquals(100, bounds.right)
    assertEquals(80, bounds.bottom)
  }

  @Test
  fun `ElementBounds fromString returns null for invalid format`() {
    val invalidBounds = "invalid-format"
    val bounds = ElementBounds.fromString(invalidBounds)
    assertNull(bounds)
  }

  @Test
  fun `ElementBounds toString produces correct format`() {
    val bounds = ElementBounds(10, 20, 100, 80)
    val result = bounds.toString()
    assertEquals("[10,20][100,80]", result)
  }

  @Test
  fun `UIElementInfo boolean helpers work correctly`() {
    val element =
        UIElementInfo(
            clickable = "true",
            enabled = "false",
            focusable = "true",
            focused = "false",
            scrollable = "true",
        )

    assertTrue(element.isClickable)
    assertFalse(element.isEnabled)
    assertTrue(element.isFocusable)
    assertFalse(element.isFocused)
    assertTrue(element.isScrollable)
  }

  @Test
  fun `UIElementInfo enabled defaults to true when not specified`() {
    val element =
        UIElementInfo(
            clickable = "false",
            enabled = null, // Not specified
        )

    assertFalse(element.isClickable)
    assertTrue(element.isEnabled) // Should default to true
  }

  @Test
  fun `detectIntentChooserIndicators returns true for text indicator`() {
    val child = UIElementInfo(text = "Choose an app")
    val childJson = json.encodeToJsonElement(UIElementInfo.serializer(), child)
    val root = UIElementInfo(className = "android.widget.LinearLayout", node = childJson)

    assertTrue(extractor.detectIntentChooserIndicatorsForTest(root))
  }

  @Test
  fun `detectIntentChooserIndicators returns true for resource id indicator`() {
    val child =
        UIElementInfo(resourceId = "android:id/button_once", className = "android.widget.Button")
    val childJson = json.encodeToJsonElement(UIElementInfo.serializer(), child)
    val root = UIElementInfo(className = "android.widget.LinearLayout", node = childJson)

    assertTrue(extractor.detectIntentChooserIndicatorsForTest(root))
  }

  @Test
  fun `detectIntentChooserIndicators returns false when no indicators present`() {
    val child = UIElementInfo(text = "Normal content", className = "android.widget.TextView")
    val childJson = json.encodeToJsonElement(UIElementInfo.serializer(), child)
    val root = UIElementInfo(className = "android.widget.LinearLayout", node = childJson)

    assertFalse(extractor.detectIntentChooserIndicatorsForTest(root))
  }

  @Test
  fun `detectNotificationPermissionDialog returns true when notification dialog markers present`() {
    val title = UIElementInfo(text = "Allow Example to send notifications?")
    val allowButton =
        UIElementInfo(resourceId = "com.android.permissioncontroller:id/permission_allow_button")
    val childrenJson =
        json.encodeToJsonElement(
            ListSerializer(UIElementInfo.serializer()),
            listOf(title, allowButton),
        )
    val root = UIElementInfo(className = "android.widget.LinearLayout", node = childrenJson)

    assertTrue(
        extractor.detectNotificationPermissionDialogForTest(
            root,
            "com.android.permissioncontroller",
        ),
    )
  }

  @Test
  fun `detectNotificationPermissionDialog returns false for non-permission controller package`() {
    val title = UIElementInfo(text = "Allow Example to send notifications?")
    val allowButton =
        UIElementInfo(resourceId = "com.android.permissioncontroller:id/permission_allow_button")
    val childrenJson =
        json.encodeToJsonElement(
            ListSerializer(UIElementInfo.serializer()),
            listOf(title, allowButton),
        )
    val root = UIElementInfo(className = "android.widget.LinearLayout", node = childrenJson)

    assertFalse(
        extractor.detectNotificationPermissionDialogForTest(
            root,
            "com.example.app",
        ),
    )
  }

  @Test
  fun `meetsFilterCriteria excludes UIElementInfo with no values`() = runTest {
    val plainElement = UIElementInfo()

    val children = listOf(plainElement)
    val childrenJson =
        json.encodeToJsonElement(ListSerializer(UIElementInfo.serializer()), children)

    val rootElement = UIElementInfo(node = childrenJson)
    val filteredChildren = extractor.extractChildrenFromHierarchy(rootElement)

    // Should keep all elements with semantic properties but not the plain element
    assertEquals(0, filteredChildren.size)
  }

  @Test
  fun `meetsFilterCriteria includes elements with semantic properties`() = runTest {
    val elementWithTestTag =
        UIElementInfo(text = "", testTag = "submit-button", clickable = "false")
    val elementWithRole = UIElementInfo(text = "", role = "button", clickable = "false")
    val elementWithState =
        UIElementInfo(text = "", stateDescription = "Expanded", clickable = "false")
    val elementWithHint = UIElementInfo(text = "", hintText = "Enter name", clickable = "false")
    val elementWithError = UIElementInfo(text = "", errorMessage = "Required", clickable = "false")
    val elementWithActions =
        UIElementInfo(text = "", actions = listOf("click", "focus"), clickable = "false")
    val elementWithRange =
        UIElementInfo(text = "", rangeInfo = "current:50,min:0,max:100", clickable = "false")

    val children =
        listOf(
            elementWithTestTag,
            elementWithRole,
            elementWithState,
            elementWithHint,
            elementWithError,
            elementWithActions,
            elementWithRange,
        )
    val childrenJson =
        json.encodeToJsonElement(ListSerializer(UIElementInfo.serializer()), children)

    val rootElement = UIElementInfo(node = childrenJson)
    val filteredChildren = extractor.extractChildrenFromHierarchy(rootElement)

    // Should keep all elements with semantic properties but not the plain element
    assertEquals(7, filteredChildren.size)
    assertTrue(filteredChildren.any { it.testTag == "submit-button" })
    assertTrue(filteredChildren.any { it.role == "button" })
    assertTrue(filteredChildren.any { it.stateDescription == "Expanded" })
    assertTrue(filteredChildren.any { it.hintText == "Enter name" })
    assertTrue(filteredChildren.any { it.errorMessage == "Required" })
    assertTrue(filteredChildren.any { it.actions?.contains("click") == true })
    assertTrue(filteredChildren.any { it.rangeInfo == "current:50,min:0,max:100" })

    // Plain element should be filtered out
    assertFalse(
        filteredChildren.any {
          it.text == "" &&
              it.testTag == null &&
              it.role == null &&
              it.stateDescription == null &&
              it.hintText == null &&
              it.errorMessage == null &&
              it.actions == null &&
              it.rangeInfo == null
        }
    )
  }

  @Test
  fun `UIElementInfo semantic properties are properly handled`() {
    val element =
        UIElementInfo(
            text = "Button",
            testTag = "submit-button",
            role = "button",
            stateDescription = "Enabled",
            errorMessage = null,
            hintText = "Click to submit",
            tooltipText = "Submit form",
            paneTitle = "Main Form",
            liveRegion = "polite",
            collectionInfo = "rows:5,cols:3",
            collectionItemInfo = "row:1,col:2",
            rangeInfo = "current:50,min:0,max:100",
            inputType = "text",
            actions = listOf("click", "focus"),
            extras = mapOf("custom-property" to "custom-value"),
        )

    assertEquals("submit-button", element.testTag)
    assertEquals("button", element.role)
    assertEquals("Enabled", element.stateDescription)
    assertNull(element.errorMessage)
    assertEquals("Click to submit", element.hintText)
    assertEquals("Submit form", element.tooltipText)
    assertEquals("Main Form", element.paneTitle)
    assertEquals("polite", element.liveRegion)
    assertEquals("rows:5,cols:3", element.collectionInfo)
    assertEquals("row:1,col:2", element.collectionItemInfo)
    assertEquals("current:50,min:0,max:100", element.rangeInfo)
    assertEquals("text", element.inputType)
    assertEquals(listOf("click", "focus"), element.actions)
    assertEquals(mapOf("custom-property" to "custom-value"), element.extras)
  }

  @Test
  fun `semantic fields are serialized to JSON correctly`() {
    val element =
        UIElementInfo(
            text = "Button",
            testTag = "submit-button",
            role = "button",
            stateDescription = "Enabled",
            actions = listOf("click"),
            extras = mapOf("custom" to "value"),
        )

    val json = Json { prettyPrint = true }
    val jsonString = json.encodeToString(UIElementInfo.serializer(), element)

    // Verify semantic fields appear in JSON with correct serialization names
    assertTrue("JSON should contain test-tag field", jsonString.contains("test-tag"))
    assertTrue("JSON should contain role field", jsonString.contains("\"role\""))
    assertTrue(
        "JSON should contain state-description field",
        jsonString.contains("state-description"),
    )
    assertTrue("JSON should contain actions field", jsonString.contains("\"actions\""))
    assertTrue("JSON should contain extras field", jsonString.contains("\"extras\""))
  }

  // MARK: - Occlusion Filtering Tests

  @Test
  fun `occlusion filter keeps overlapping root-level siblings`() {
    val siblingOne = elementWithBounds(resourceId = "sibling-one", bounds = bounds(0, 0, 100, 100))
    val siblingTwo =
        elementWithBounds(resourceId = "sibling-two", bounds = bounds(50, 50, 150, 150))
    val root =
        elementWithBounds(
            resourceId = "root",
            bounds = bounds(0, 0, 200, 200),
            children = listOf(siblingOne, siblingTwo),
        )

    val filtered = extractor.applyOcclusionFilteringSingleWindowForTest(root)

    assertNotNull(filtered)
    val siblingOneResult = findElementByResourceId(filtered!!, "sibling-one")
    val siblingTwoResult = findElementByResourceId(filtered, "sibling-two")
    assertNotNull(siblingOneResult)
    assertNotNull(siblingTwoResult)
    assertNull(siblingOneResult!!.occlusionState)
    assertNull(siblingOneResult.occludedBy)
    assertNull(siblingTwoResult!!.occlusionState)
    assertNull(siblingTwoResult.occludedBy)
  }

  @Test
  fun `occlusion filter ignores descendant overlaps`() {
    val child = elementWithBounds(resourceId = "child", bounds = bounds(0, 0, 100, 100))
    val parent =
        elementWithBounds(
            resourceId = "parent",
            bounds = bounds(0, 0, 100, 100),
            children = listOf(child),
        )
    val root =
        elementWithBounds(
            resourceId = "root",
            bounds = bounds(0, 0, 120, 120),
            children = listOf(parent),
        )

    val filtered = extractor.applyOcclusionFilteringSingleWindowForTest(root)

    assertNotNull(filtered)
    val parentResult = findElementByResourceId(filtered!!, "parent")
    val childResult = findElementByResourceId(filtered, "child")
    assertNotNull(parentResult)
    assertNotNull(childResult)
    assertNull(parentResult!!.occlusionState)
    assertNull(childResult!!.occlusionState)
  }

  @Test
  fun `occlusion filter removes unrelated nodes when fully occluded`() {
    val target = elementWithBounds(resourceId = "hidden-target", bounds = bounds(0, 0, 100, 100))
    val targetParent = elementWithBounds(resourceId = "target-parent", children = listOf(target))
    val occluder = elementWithBounds(resourceId = "occluding-node", bounds = bounds(0, 0, 100, 100))
    val occluderParent =
        elementWithBounds(resourceId = "occluder-parent", children = listOf(occluder))
    val root = elementWithBounds(children = listOf(targetParent, occluderParent))

    val filtered = extractor.applyOcclusionFilteringSingleWindowForTest(root)

    assertNotNull(filtered)
    assertNull(findElementByResourceId(filtered!!, "hidden-target"))
    assertNotNull(findElementByResourceId(filtered, "occluding-node"))
  }

  @Test
  fun `occlusion filter keeps partial overlap and annotates metadata`() {
    val target = elementWithBounds(resourceId = "partial-target", bounds = bounds(0, 0, 100, 100))
    val targetParent = elementWithBounds(resourceId = "partial-parent", children = listOf(target))
    val occluder = elementWithBounds(resourceId = "partial-occluder", bounds = bounds(0, 0, 50, 50))
    val occluderParent =
        elementWithBounds(resourceId = "occluder-parent", children = listOf(occluder))
    val root = elementWithBounds(children = listOf(targetParent, occluderParent))

    val filtered = extractor.applyOcclusionFilteringSingleWindowForTest(root)

    assertNotNull(filtered)
    val targetResult = findElementByResourceId(filtered!!, "partial-target")
    assertNotNull(targetResult)
    assertEquals("partial", targetResult!!.occlusionState)
    assertEquals("partial-occluder", targetResult.occludedBy)
  }

  @Test
  fun `hidden root occlusion retains children`() {
    val child = elementWithBounds(resourceId = "root-child", bounds = bounds(98, 98, 100, 100))
    val root =
        elementWithBounds(
            resourceId = "root-window",
            bounds = bounds(0, 0, 100, 100),
            children = listOf(child),
        )
    val occluderRoot =
        elementWithBounds(resourceId = "occluding-root", bounds = bounds(0, 0, 98, 98))

    val windowEntry = extractor.createWindowEntry(windowId = 1, windowLayer = 0, hierarchy = root)
    val occluderEntry =
        extractor.createWindowEntry(windowId = 2, windowLayer = 1, hierarchy = occluderRoot)
    val occlusionInfo = extractor.buildOcclusionInfoForTest(listOf(windowEntry, occluderEntry))
    val filtered =
        extractor.filterOccludedHierarchyForTest(
            element = root,
            occlusionInfo = occlusionInfo,
            windowKey = 1,
            path = "",
            isRoot = true,
        )

    assertNotNull(filtered)
    assertEquals("hidden", filtered!!.occlusionState)
    assertEquals("occluding-root", filtered.occludedBy)
    assertNotNull(findElementByResourceId(filtered, "root-child"))
  }

  // MARK: - Node Relationship Tests

  @Test
  fun `determineNodeRelationship detects direct siblings`() {
    // Two nodes with same parent "0.0.0" - they are siblings
    val nodePath = "0.0.0.0"
    val occluderPath = "0.0.0.1"

    val relationship =
        extractor.determineNodeRelationship(
            nodePath = nodePath,
            occluderPath = occluderPath,
            nodeOrder = 5,
            nodeSubtreeEnd = 5,
            occluderOrder = 6,
        )

    assertEquals(ViewHierarchyExtractor.NodeRelationship.SIBLING, relationship)
  }

  @Test
  fun `determineNodeRelationship detects uncles - sibling of parent`() {
    // Node at "0.0.0.1.0" (child of "0.0.0.1")
    // Occluder at "0.0.0.2" (sibling of "0.0.0.1", which is the node's parent)
    // This is the NavigationBar case - occluder is uncle of node
    val nodePath = "0.0.0.1.0"
    val occluderPath = "0.0.0.2"

    val relationship =
        extractor.determineNodeRelationship(
            nodePath = nodePath,
            occluderPath = occluderPath,
            nodeOrder = 10,
            nodeSubtreeEnd = 10,
            occluderOrder = 11,
        )

    assertEquals(ViewHierarchyExtractor.NodeRelationship.UNCLE, relationship)
  }

  @Test
  fun `determineNodeRelationship detects uncles - sibling of grandparent`() {
    // Node deeply nested at "0.0.0.1.0.0"
    // Occluder at "0.0.0.2" (sibling of grandparent)
    val nodePath = "0.0.0.1.0.0"
    val occluderPath = "0.0.0.2"

    val relationship =
        extractor.determineNodeRelationship(
            nodePath = nodePath,
            occluderPath = occluderPath,
            nodeOrder = 15,
            nodeSubtreeEnd = 15,
            occluderOrder = 16,
        )

    assertEquals(ViewHierarchyExtractor.NodeRelationship.UNCLE, relationship)
  }

  @Test
  fun `determineNodeRelationship detects descendants using traversal order`() {
    // Occluder is a child of the node (traversal order within subtree)
    val nodePath = "0.0.0.1"
    val occluderPath = "0.0.0.1.0"

    val relationship =
        extractor.determineNodeRelationship(
            nodePath = nodePath,
            occluderPath = occluderPath,
            nodeOrder = 10,
            nodeSubtreeEnd = 15, // Subtree ends at 15
            occluderOrder = 11, // Child is at 11, within [10, 15]
        )

    assertEquals(ViewHierarchyExtractor.NodeRelationship.DESCENDANT, relationship)
  }

  @Test
  fun `determineNodeRelationship detects descendants with multiple children`() {
    // Node has multiple descendants
    val nodePath = "0.0.0.1"
    val occluderPath = "0.0.0.1.2.0"

    val relationship =
        extractor.determineNodeRelationship(
            nodePath = nodePath,
            occluderPath = occluderPath,
            nodeOrder = 10,
            nodeSubtreeEnd = 20,
            occluderOrder = 18, // Deep descendant within subtree
        )

    assertEquals(ViewHierarchyExtractor.NodeRelationship.DESCENDANT, relationship)
  }

  @Test
  fun `determineNodeRelationship detects unrelated nodes - different branches`() {
    // Nodes in completely different branches
    val nodePath = "0.0.0.1.0"
    val occluderPath = "0.0.1.0.0"

    val relationship =
        extractor.determineNodeRelationship(
            nodePath = nodePath,
            occluderPath = occluderPath,
            nodeOrder = 10,
            nodeSubtreeEnd = 12,
            occluderOrder = 20,
        )

    assertEquals(ViewHierarchyExtractor.NodeRelationship.UNRELATED, relationship)
  }

  @Test
  fun `determineNodeRelationship detects unrelated nodes - cousin relationship`() {
    // Cousins: share grandparent but different parents
    val nodePath = "0.0.0.1.0"
    val occluderPath = "0.0.0.2.0"

    val relationship =
        extractor.determineNodeRelationship(
            nodePath = nodePath,
            occluderPath = occluderPath,
            nodeOrder = 10,
            nodeSubtreeEnd = 10,
            occluderOrder = 15,
        )

    assertEquals(ViewHierarchyExtractor.NodeRelationship.UNRELATED, relationship)
  }

  @Test
  fun `determineNodeRelationship handles root node edge case`() {
    // Root-level siblings (empty parent path)
    val nodePath = "0"
    val occluderPath = "1"

    val relationship =
        extractor.determineNodeRelationship(
            nodePath = nodePath,
            occluderPath = occluderPath,
            nodeOrder = 0,
            nodeSubtreeEnd = 100,
            occluderOrder = 101,
        )

    assertEquals(ViewHierarchyExtractor.NodeRelationship.SIBLING, relationship)
  }

  @Test
  fun `determineNodeRelationship TabRow structure - text and role description as siblings`() {
    // Real TabRow case: Text "Tap" and role description are siblings
    val textPath = "0.0.0.0.0.0.1.0.0.0.0"
    val roleDescPath = "0.0.0.0.0.0.1.0.0.0.1"

    val relationship =
        extractor.determineNodeRelationship(
            nodePath = textPath,
            occluderPath = roleDescPath,
            nodeOrder = 10,
            nodeSubtreeEnd = 10,
            occluderOrder = 11,
        )

    assertEquals(ViewHierarchyExtractor.NodeRelationship.SIBLING, relationship)
  }

  @Test
  fun `determineNodeRelationship NavigationBar structure - text nested with uncle`() {
    // Real NavigationBar case: Text is nested, occluder is uncle
    // Text: "0.0.0.0.0.0.1.0.0.1.0" (in wrapper "0.0.0.0.0.0.1.0.0.1")
    // Occluder: "0.0.0.0.0.0.1.0.0.2" (sibling of wrapper's parent)
    val textPath = "0.0.0.0.0.0.1.0.0.1.0"
    val occluderPath = "0.0.0.0.0.0.1.0.0.2"

    val relationship =
        extractor.determineNodeRelationship(
            nodePath = textPath,
            occluderPath = occluderPath,
            nodeOrder = 10,
            nodeSubtreeEnd = 10,
            occluderOrder = 11,
        )

    assertEquals(ViewHierarchyExtractor.NodeRelationship.UNCLE, relationship)
  }

  // Helper method to extract children from hierarchy (this would be made public in the actual
  // extractor for testing)
  private fun ViewHierarchyExtractor.extractChildrenFromHierarchy(
      element: UIElementInfo
  ): List<UIElementInfo> {
    return this.javaClass
        .getDeclaredMethod(
            "extractChildrenFromNode",
            kotlinx.serialization.json.JsonElement::class.java,
        )
        .let { method ->
          method.isAccessible = true
          @Suppress("UNCHECKED_CAST")
          method.invoke(this, element.node) as List<UIElementInfo>
        }
  }

  private fun elementWithBounds(
      resourceId: String? = null,
      bounds: ElementBounds? = null,
      children: List<UIElementInfo> = emptyList(),
  ): UIElementInfo {
    val node =
        when {
          children.isEmpty() -> null
          children.size == 1 -> json.encodeToJsonElement(UIElementInfo.serializer(), children[0])
          else -> json.encodeToJsonElement(ListSerializer(UIElementInfo.serializer()), children)
        }
    return UIElementInfo(resourceId = resourceId, bounds = bounds, node = node)
  }

  private fun bounds(left: Int, top: Int, right: Int, bottom: Int): ElementBounds {
    return ElementBounds(left, top, right, bottom)
  }

  private fun findElementByResourceId(
      element: UIElementInfo,
      resourceId: String,
  ): UIElementInfo? {
    if (element.resourceId == resourceId) {
      return element
    }
    for (child in extractor.extractChildrenFromHierarchy(element)) {
      val found = findElementByResourceId(child, resourceId)
      if (found != null) {
        return found
      }
    }
    return null
  }

  private fun ViewHierarchyExtractor.applyOcclusionFilteringSingleWindowForTest(
      element: UIElementInfo
  ): UIElementInfo? {
    return this.javaClass
        .getDeclaredMethod("applyOcclusionFilteringSingleWindow", UIElementInfo::class.java)
        .let { method ->
          method.isAccessible = true
          @Suppress("UNCHECKED_CAST")
          method.invoke(this, element) as UIElementInfo?
        }
  }

  private fun ViewHierarchyExtractor.createWindowEntry(
      windowId: Int,
      windowLayer: Int,
      hierarchy: UIElementInfo,
      windowType: String = "application",
      packageName: String? = null,
      isActive: Boolean = true,
      isFocused: Boolean = true,
  ): Any {
    val windowEntryClass = this.javaClass.declaredClasses.first { it.simpleName == "WindowEntry" }
    val constructor =
        windowEntryClass.getDeclaredConstructor(
            Int::class.javaPrimitiveType,
            String::class.java,
            Int::class.javaPrimitiveType,
            String::class.java,
            Boolean::class.javaPrimitiveType,
            Boolean::class.javaPrimitiveType,
            UIElementInfo::class.java,
        )
    constructor.isAccessible = true
    return constructor.newInstance(
        windowId,
        windowType,
        windowLayer,
        packageName,
        isActive,
        isFocused,
        hierarchy,
    )
  }

  private fun ViewHierarchyExtractor.buildOcclusionInfoForTest(
      windowEntries: List<Any>
  ): Map<*, *> {
    val method = this.javaClass.getDeclaredMethod("buildOcclusionInfo", List::class.java)
    method.isAccessible = true
    @Suppress("UNCHECKED_CAST")
    return method.invoke(this, windowEntries) as Map<*, *>
  }

  private fun ViewHierarchyExtractor.filterOccludedHierarchyForTest(
      element: UIElementInfo,
      occlusionInfo: Map<*, *>,
      windowKey: Int,
      path: String,
      isRoot: Boolean,
  ): UIElementInfo? {
    val method =
        this.javaClass.getDeclaredMethod(
            "filterOccludedHierarchy",
            UIElementInfo::class.java,
            Map::class.java,
            Int::class.javaPrimitiveType,
            String::class.java,
            Boolean::class.javaPrimitiveType,
        )
    method.isAccessible = true
    @Suppress("UNCHECKED_CAST")
    return method.invoke(this, element, occlusionInfo, windowKey, path, isRoot) as UIElementInfo?
  }
}
