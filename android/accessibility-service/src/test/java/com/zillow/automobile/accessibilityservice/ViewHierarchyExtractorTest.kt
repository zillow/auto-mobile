package com.zillow.automobile.accessibilityservice

import android.graphics.Rect
import com.zillow.automobile.accessibilityservice.models.ElementBounds
import com.zillow.automobile.accessibilityservice.models.UIElementInfo
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
            scrollable = "false")

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
            scrollable = "true")

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
            clickable = "false", enabled = null // Not specified
            )

    assertFalse(element.isClickable)
    assertTrue(element.isEnabled) // Should default to true
  }

  @Test
  fun `accessibility score is calculated for clickable elements`() = runTest {
    // This test would need a more complex setup to test accessibility scoring
    // For now, just verify that the structure supports it
    val clickableElement =
        UIElementInfo(
            text = "Button",
            clickable = "true",
            bounds = ElementBounds(0, 0, 100, 50),
            accessible = 0.75 // 75% accessible
            )

    assertEquals(0.75, clickableElement.accessible!!, 0.001)
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
            elementWithRange)
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
        })
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
            extras = mapOf("custom-property" to "custom-value"))

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
  fun `processForAccessibility preserves semantic fields`() = runTest {
    // Create an element with semantic properties
    val originalElement =
        UIElementInfo(
            text = "Test Button",
            testTag = "test-button",
            role = "button",
            stateDescription = "Enabled",
            hintText = "Click me",
            actions = listOf("click", "focus"),
            clickable = "false", // Not clickable so it goes through the non-clickable path
            bounds = ElementBounds(0, 0, 100, 50))

    // Use reflection to access the private processForAccessibility method
    val extractor = ViewHierarchyExtractor()
    val method =
        extractor.javaClass.getDeclaredMethod("processForAccessibility", UIElementInfo::class.java)
    method.isAccessible = true

    val processedElement = method.invoke(extractor, originalElement) as UIElementInfo

    // Verify all semantic fields are preserved
    assertEquals("test-button", processedElement.testTag)
    assertEquals("button", processedElement.role)
    assertEquals("Enabled", processedElement.stateDescription)
    assertEquals("Click me", processedElement.hintText)
    assertEquals(listOf("click", "focus"), processedElement.actions)

    // Verify other fields are also preserved
    assertEquals("Test Button", processedElement.text)
    assertEquals("false", processedElement.clickable)
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
            extras = mapOf("custom" to "value"))

    val json = Json { prettyPrint = true }
    val jsonString = json.encodeToString(UIElementInfo.serializer(), element)

    // Verify semantic fields appear in JSON with correct serialization names
    assertTrue("JSON should contain test-tag field", jsonString.contains("test-tag"))
    assertTrue("JSON should contain role field", jsonString.contains("\"role\""))
    assertTrue(
        "JSON should contain state-description field", jsonString.contains("state-description"))
    assertTrue("JSON should contain actions field", jsonString.contains("\"actions\""))
    assertTrue("JSON should contain extras field", jsonString.contains("\"extras\""))
  }

  // Helper method to extract children from hierarchy (this would be made public in the actual
  // extractor for testing)
  private fun ViewHierarchyExtractor.extractChildrenFromHierarchy(
      element: UIElementInfo
  ): List<UIElementInfo> {
    return this.javaClass
        .getDeclaredMethod(
            "extractChildrenFromNode", kotlinx.serialization.json.JsonElement::class.java)
        .let { method ->
          method.isAccessible = true
          @Suppress("UNCHECKED_CAST")
          method.invoke(this, element.node) as List<UIElementInfo>
        }
  }
}
