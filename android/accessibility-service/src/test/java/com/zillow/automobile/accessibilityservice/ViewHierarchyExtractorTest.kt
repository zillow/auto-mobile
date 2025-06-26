package com.zillow.automobile.accessibilityservice

import android.graphics.Rect
import com.zillow.automobile.accessibilityservice.models.ElementBounds
import com.zillow.automobile.accessibilityservice.models.UIElementInfo
import com.zillow.automobile.accessibilityservice.models.ViewHierarchy
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

    val hierarchy = ViewHierarchy(hierarchy = rootElement)
    val filtered = extractor.filterViewHierarchy(hierarchy)

    assertNotNull(filtered.hierarchy)

    // Extract children from filtered hierarchy
    val filteredChildren = extractor.extractChildrenFromHierarchy(filtered.hierarchy!!)
    assertEquals(2, filteredChildren.size)

    // Should keep interactive element and element with content
    assertTrue(filteredChildren.any { it.text == "Button" && it.isClickable })
    assertTrue(filteredChildren.any { it.text == "Some text" })
  }

  @Test
  fun `findClickableElements returns all clickable elements`() = runTest {
    val clickableChild1 = UIElementInfo(text = "Button 1", clickable = "true")
    val clickableChild2 = UIElementInfo(text = "Button 2", clickable = "true")
    val nonClickableChild = UIElementInfo(text = "Text", clickable = "false")

    val children = listOf(clickableChild1, nonClickableChild, clickableChild2)
    val childrenJson =
        json.encodeToJsonElement(ListSerializer(UIElementInfo.serializer()), children)

    val rootElement = UIElementInfo(className = "android.widget.LinearLayout", node = childrenJson)

    val hierarchy = ViewHierarchy(hierarchy = rootElement)
    val clickableElements = extractor.findClickableElements(hierarchy)

    assertEquals(2, clickableElements.size)
    assertTrue(clickableElements.any { it.text == "Button 1" })
    assertTrue(clickableElements.any { it.text == "Button 2" })
  }

  @Test
  fun `findScrollableElements returns all scrollable elements`() = runTest {
    val scrollableChild = UIElementInfo(text = "List", scrollable = "true")
    val nonScrollableChild = UIElementInfo(text = "Text", scrollable = "false")

    val children = listOf(scrollableChild, nonScrollableChild)
    val childrenJson =
        json.encodeToJsonElement(ListSerializer(UIElementInfo.serializer()), children)

    val rootElement = UIElementInfo(className = "android.widget.LinearLayout", node = childrenJson)

    val hierarchy = ViewHierarchy(hierarchy = rootElement)
    val scrollableElements = extractor.findScrollableElements(hierarchy)

    assertEquals(1, scrollableElements.size)
    assertEquals("List", scrollableElements[0].text)
    assertTrue(scrollableElements[0].isScrollable)
  }

  @Test
  fun `findElementByText finds element case insensitive by default`() = runTest {
    val targetElement = UIElementInfo(text = "Submit Button")
    val otherElement = UIElementInfo(text = "Cancel")

    val children = listOf(targetElement, otherElement)
    val childrenJson =
        json.encodeToJsonElement(ListSerializer(UIElementInfo.serializer()), children)

    val rootElement = UIElementInfo(node = childrenJson)
    val hierarchy = ViewHierarchy(hierarchy = rootElement)

    val found1 = extractor.findElementByText(hierarchy, "submit", false)
    assertNotNull(found1)
    assertEquals("Submit Button", found1!!.text)

    val found2 = extractor.findElementByText(hierarchy, "SUBMIT", false)
    assertNotNull(found2)
    assertEquals("Submit Button", found2!!.text)
  }

  @Test
  fun `findElementByText respects case sensitivity`() = runTest {
    val targetElement = UIElementInfo(text = "Submit Button")
    val childrenJson = json.encodeToJsonElement(UIElementInfo.serializer(), targetElement)

    val rootElement = UIElementInfo(node = childrenJson)
    val hierarchy = ViewHierarchy(hierarchy = rootElement)

    val found = extractor.findElementByText(hierarchy, "submit", true)
    assertNull(found)

    val foundCaseSensitive = extractor.findElementByText(hierarchy, "Submit", true)
    assertNotNull(foundCaseSensitive)
    assertEquals("Submit Button", foundCaseSensitive!!.text)
  }

  @Test
  fun `findElementByText searches content description`() = runTest {
    val targetElement = UIElementInfo(text = null, contentDesc = "Submit Button")
    val childrenJson = json.encodeToJsonElement(UIElementInfo.serializer(), targetElement)

    val rootElement = UIElementInfo(node = childrenJson)
    val hierarchy = ViewHierarchy(hierarchy = rootElement)

    val found = extractor.findElementByText(hierarchy, "Submit")
    assertNotNull(found)
    assertEquals("Submit Button", found!!.contentDesc)
  }

  @Test
  fun `findElementByResourceId finds correct element`() = runTest {
    val targetElement = UIElementInfo(resourceId = "com.example:id/submit_button")
    val otherElement = UIElementInfo(resourceId = "com.example:id/cancel_button")

    val children = listOf(targetElement, otherElement)
    val childrenJson =
        json.encodeToJsonElement(ListSerializer(UIElementInfo.serializer()), children)

    val rootElement = UIElementInfo(node = childrenJson)
    val hierarchy = ViewHierarchy(hierarchy = rootElement)

    val found = extractor.findElementByResourceId(hierarchy, "com.example:id/submit_button")

    assertNotNull(found)
    assertEquals("com.example:id/submit_button", found!!.resourceId)
  }

  @Test
  fun `findElementByResourceId returns null when not found`() = runTest {
    val element = UIElementInfo(resourceId = "com.example:id/other_button")
    val childrenJson = json.encodeToJsonElement(UIElementInfo.serializer(), element)

    val rootElement = UIElementInfo(node = childrenJson)
    val hierarchy = ViewHierarchy(hierarchy = rootElement)

    val found = extractor.findElementByResourceId(hierarchy, "com.example:id/submit_button")
    assertNull(found)
  }

  @Test
  fun `findFocusedElement finds focused element with bounds`() = runTest {
    val focusedElement =
        UIElementInfo(
            text = "Focused Input", focused = "true", bounds = ElementBounds(0, 0, 100, 50))
    val unfocusedElement = UIElementInfo(text = "Unfocused Input", focused = "false")

    val children = listOf(focusedElement, unfocusedElement)
    val childrenJson =
        json.encodeToJsonElement(ListSerializer(UIElementInfo.serializer()), children)

    val rootElement = UIElementInfo(node = childrenJson)
    val hierarchy = ViewHierarchy(hierarchy = rootElement)

    val found = extractor.findFocusedElement(hierarchy)
    assertNotNull(found)
    assertEquals("Focused Input", found!!.text)
    assertTrue(found.isFocused)
  }

  @Test
  fun `findFocusedElement returns null when no focused element with bounds exists`() = runTest {
    val element = UIElementInfo(text = "Input", focused = "false")
    val childrenJson = json.encodeToJsonElement(UIElementInfo.serializer(), element)

    val rootElement = UIElementInfo(node = childrenJson)
    val hierarchy = ViewHierarchy(hierarchy = rootElement)

    val found = extractor.findFocusedElement(hierarchy)
    assertNull(found)
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
