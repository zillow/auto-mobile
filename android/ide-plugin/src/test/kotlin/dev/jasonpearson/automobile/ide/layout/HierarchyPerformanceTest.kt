package dev.jasonpearson.automobile.ide.layout

import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue
import org.junit.Test

class HierarchyPerformanceTest {

    // Helper to build a tree of given depth and branching factor
    private fun buildTree(depth: Int, branching: Int, prefix: String = "node"): UIElementInfo {
        var counter = 0
        fun build(d: Int): UIElementInfo {
            val id = "$prefix-${counter++}"
            val children = if (d < depth) {
                (0 until branching).map { build(d + 1) }
            } else {
                emptyList()
            }
            return UIElementInfo(
                id = id,
                className = "android.view.View",
                resourceId = null,
                text = null,
                contentDescription = null,
                bounds = ElementBounds(0, 0, 100, 100),
                isClickable = false,
                isEnabled = true,
                isFocused = false,
                isSelected = false,
                isScrollable = false,
                isCheckable = false,
                isChecked = false,
                depth = d,
                children = children,
            )
        }
        return build(0)
    }

    @Test
    fun `buildParsedHierarchy creates correct element map`() {
        val root = LayoutInspectorMockData.mockHierarchy
        val parsed = buildParsedHierarchy(root)

        // Every element in tree should be in the map
        val allIds = mutableListOf<String>()
        fun collect(e: UIElementInfo) {
            allIds.add(e.id)
            e.children.forEach { collect(it) }
        }
        collect(root)

        assertEquals(allIds.size, parsed.elementMap.size)
        for (id in allIds) {
            assertNotNull(parsed.elementMap[id], "Missing element for id=$id")
        }
    }

    @Test
    fun `buildParsedHierarchy creates correct parent map`() {
        val root = LayoutInspectorMockData.mockHierarchy
        val parsed = buildParsedHierarchy(root)

        // Root should not be in parent map
        assertNull(parsed.parentMap[root.id])

        // Every non-root element should have a parent
        fun verify(parent: UIElementInfo) {
            for (child in parent.children) {
                assertEquals(parent.id, parsed.parentMap[child.id])
                verify(child)
            }
        }
        verify(root)
    }

    @Test
    fun `getPathFromParentMap returns correct path for leaf element`() {
        val root = LayoutInspectorMockData.mockHierarchy
        val parsed = buildParsedHierarchy(root)

        // Find a leaf node (msg_1_text is at depth 3)
        val leaf = parsed.elementMap.values.first { it.id == "msg_1_text" }
        val path = getPathFromParentMap(parsed.parentMap, leaf.id)

        // Path should go from root to leaf
        assertEquals(root.id, path.first())
        assertEquals(leaf.id, path.last())
        assertTrue(path.size >= 3, "Path should have at least 3 elements for a depth-3 node")
    }

    @Test
    fun `getPathFromParentMap returns single element for root`() {
        val root = LayoutInspectorMockData.mockHierarchy
        val parsed = buildParsedHierarchy(root)

        val path = getPathFromParentMap(parsed.parentMap, root.id)
        assertEquals(listOf(root.id), path)
    }

    @Test
    fun `getPathFromParentMap returns single element for unknown id`() {
        val parsed = buildParsedHierarchy(LayoutInspectorMockData.mockHierarchy)
        val path = getPathFromParentMap(parsed.parentMap, "nonexistent")
        assertEquals(listOf("nonexistent"), path)
    }

    @Test
    fun `computeChangedElements detects new elements`() {
        val state = LayoutInspectorState()
        val root1 = buildTree(depth = 2, branching = 2)
        val parsed1 = buildParsedHierarchy(root1)

        // Add a new child to root
        val newChild = UIElementInfo(
            id = "new-child",
            className = "android.widget.Button",
            resourceId = null,
            text = "New",
            contentDescription = null,
            bounds = ElementBounds(0, 0, 50, 50),
            isClickable = true,
            isEnabled = true,
            isFocused = false,
            isSelected = false,
            isScrollable = false,
            isCheckable = false,
            isChecked = false,
            depth = 1,
            children = emptyList(),
        )
        val root2 = root1.copy(children = root1.children + newChild)
        val parsed2 = buildParsedHierarchy(root2)

        val changed = state.computeChangedElements(parsed1.elementMap, parsed2.elementMap)
        assertTrue("new-child" in changed)
    }

    @Test
    fun `computeChangedElements detects property changes`() {
        val state = LayoutInspectorState()
        val root1 = buildTree(depth = 1, branching = 2)
        val parsed1 = buildParsedHierarchy(root1)

        // Modify a child's text
        val modifiedChild = root1.children[0].copy(text = "changed text")
        val root2 = root1.copy(children = listOf(modifiedChild) + root1.children.drop(1))
        val parsed2 = buildParsedHierarchy(root2)

        val changed = state.computeChangedElements(parsed1.elementMap, parsed2.elementMap)
        assertTrue(modifiedChild.id in changed)
    }

    @Test
    fun `computeChangedElements returns empty for identical hierarchies`() {
        val state = LayoutInspectorState()
        val root = buildTree(depth = 2, branching = 2)
        val parsed = buildParsedHierarchy(root)

        val changed = state.computeChangedElements(parsed.elementMap, parsed.elementMap)
        assertTrue(changed.isEmpty())
    }

    @Test
    fun `computeMatchingIds returns empty for empty query`() {
        val root = LayoutInspectorMockData.mockHierarchy
        val result = computeMatchingIds(root, "")
        assertTrue(result.isEmpty())
    }

    @Test
    fun `computeMatchingIds finds matching elements and their ancestors`() {
        val root = LayoutInspectorMockData.mockHierarchy
        val result = computeMatchingIds(root, "Chat")

        // "Chat" text appears in title element — its ancestors should be included
        assertTrue(result.isNotEmpty())
        // The title element itself should be in the set
        val titleElement = LayoutInspectorMockData.findElementById(root, "title")
        assertNotNull(titleElement)
        assertTrue(titleElement.id in result)
    }

    @Test
    fun `computeMatchingIds includes parent of matching element`() {
        val root = LayoutInspectorMockData.mockHierarchy
        val result = computeMatchingIds(root, "ImageButton")

        // Root should be included because it has matching descendants
        assertTrue(root.id in result)
    }

    @Test
    fun `large tree buildParsedHierarchy is fast`() {
        // 3-branching tree of depth 8 = ~9841 nodes
        val root = buildTree(depth = 8, branching = 3)
        val start = System.nanoTime()
        val parsed = buildParsedHierarchy(root)
        val durationMs = (System.nanoTime() - start) / 1_000_000

        assertTrue(parsed.elementMap.size > 1000, "Tree should have >1000 nodes")
        assertTrue(durationMs < 100, "buildParsedHierarchy should complete in <100ms, took ${durationMs}ms")
    }

    @Test
    fun `large tree getPathFromParentMap is fast`() {
        val root = buildTree(depth = 10, branching = 2)
        val parsed = buildParsedHierarchy(root)

        // Find a deep leaf
        val deepLeaf = parsed.elementMap.values.maxByOrNull { it.depth }!!

        val start = System.nanoTime()
        repeat(10_000) {
            getPathFromParentMap(parsed.parentMap, deepLeaf.id)
        }
        val durationMs = (System.nanoTime() - start) / 1_000_000

        assertTrue(durationMs < 100, "10k path lookups should complete in <100ms, took ${durationMs}ms")
    }

    @Test
    fun `large tree computeMatchingIds is fast`() {
        val root = buildTree(depth = 8, branching = 3)
        val start = System.nanoTime()
        computeMatchingIds(root, "View")
        val durationMs = (System.nanoTime() - start) / 1_000_000

        assertTrue(durationMs < 100, "computeMatchingIds should complete in <100ms, took ${durationMs}ms")
    }
}
