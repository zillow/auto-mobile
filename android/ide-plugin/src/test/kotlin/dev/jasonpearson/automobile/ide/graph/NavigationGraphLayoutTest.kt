package dev.jasonpearson.automobile.ide.graph

import androidx.compose.ui.unit.IntSize
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertTrue
import org.junit.Test

class NavigationGraphLayoutTest {

    @Test
    fun `empty node list returns empty layout`() {
        val layout = computeGraphLayout(
            summary = NavigationGraphSummary(nodes = emptyList(), edges = emptyList()),
            size = IntSize(500, 500),
            baseRadiusPx = 20f,
            paddingPx = 10f,
        )
        assertTrue(layout.nodeLayouts.isEmpty())
        assertEquals(IntSize(500, 500), layout.size)
    }

    @Test
    fun `zero canvas size returns empty layout`() {
        val summary = NavigationGraphSummary(
            nodes = listOf(NavigationGraphSummaryNode(1, "Home", 5)),
        )
        val layout = computeGraphLayout(summary, IntSize(0, 0), 20f, 10f)
        assertTrue(layout.nodeLayouts.isEmpty())
    }

    @Test
    fun `single node is placed at canvas center`() {
        val layout = computeGraphLayout(
            summary = NavigationGraphSummary(
                nodes = listOf(NavigationGraphSummaryNode(1, "Home", 5)),
            ),
            size = IntSize(400, 400),
            baseRadiusPx = 20f,
            paddingPx = 10f,
        )
        assertEquals(1, layout.nodeLayouts.size)
        val node = layout.nodeLayouts["Home"]!!
        assertEquals(200.0, node.center.x.toDouble(), 0.01)
        assertEquals(200.0, node.center.y.toDouble(), 0.01)
        assertEquals(0, node.ring)
    }

    @Test
    fun `currentScreen node is placed at ring 0`() {
        val layout = computeGraphLayout(
            summary = NavigationGraphSummary(
                currentScreen = "Home",
                nodes = listOf(
                    NavigationGraphSummaryNode(1, "Home", 5),
                    NavigationGraphSummaryNode(2, "Profile", 3),
                ),
                edges = listOf(NavigationGraphSummaryEdge(1, "Home", "Profile")),
            ),
            size = IntSize(400, 400),
            baseRadiusPx = 20f,
            paddingPx = 10f,
        )
        assertEquals(0, layout.nodeLayouts["Home"]!!.ring)
        assertEquals(1, layout.nodeLayouts["Profile"]!!.ring)
    }

    @Test
    fun `BFS distance determines ring placement`() {
        // A --(1)--> B --(2)--> C
        val layout = computeGraphLayout(
            summary = NavigationGraphSummary(
                currentScreen = "A",
                nodes = listOf(
                    NavigationGraphSummaryNode(1, "A", 5),
                    NavigationGraphSummaryNode(2, "B", 3),
                    NavigationGraphSummaryNode(3, "C", 2),
                ),
                edges = listOf(
                    NavigationGraphSummaryEdge(1, "A", "B"),
                    NavigationGraphSummaryEdge(2, "B", "C"),
                ),
            ),
            size = IntSize(600, 600),
            baseRadiusPx = 20f,
            paddingPx = 10f,
        )
        val ringA = layout.nodeLayouts["A"]!!.ring
        val ringB = layout.nodeLayouts["B"]!!.ring
        val ringC = layout.nodeLayouts["C"]!!.ring
        assertTrue(ringA < ringB, "B should be one hop from root")
        assertTrue(ringB < ringC, "C should be two hops from root")
    }

    @Test
    fun `unreachable nodes are placed at a higher ring than connected nodes`() {
        val layout = computeGraphLayout(
            summary = NavigationGraphSummary(
                currentScreen = "A",
                nodes = listOf(
                    NavigationGraphSummaryNode(1, "A", 5),
                    NavigationGraphSummaryNode(2, "B", 3),
                    NavigationGraphSummaryNode(3, "Orphan", 1),
                ),
                edges = listOf(NavigationGraphSummaryEdge(1, "A", "B")),
            ),
            size = IntSize(600, 600),
            baseRadiusPx = 20f,
            paddingPx = 10f,
        )
        val ringB = layout.nodeLayouts["B"]!!.ring
        val ringOrphan = layout.nodeLayouts["Orphan"]!!.ring
        assertTrue(ringOrphan > ringB, "Orphan (unreachable) should sit outside connected nodes")
    }

    @Test
    fun `higher visit count yields larger node radius`() {
        val layout = computeGraphLayout(
            summary = NavigationGraphSummary(
                nodes = listOf(
                    NavigationGraphSummaryNode(1, "Heavy", 100),
                    NavigationGraphSummaryNode(2, "Light", 1),
                ),
            ),
            size = IntSize(400, 400),
            baseRadiusPx = 20f,
            paddingPx = 10f,
        )
        val heavyRadius = layout.nodeLayouts["Heavy"]!!.radius
        val lightRadius = layout.nodeLayouts["Light"]!!.radius
        assertTrue(heavyRadius > lightRadius, "Node with more visits should be larger")
    }

    @Test
    fun `equal visit counts produce equal radii`() {
        val layout = computeGraphLayout(
            summary = NavigationGraphSummary(
                nodes = listOf(
                    NavigationGraphSummaryNode(1, "A", 5),
                    NavigationGraphSummaryNode(2, "B", 5),
                ),
            ),
            size = IntSize(400, 400),
            baseRadiusPx = 20f,
            paddingPx = 10f,
        )
        assertEquals(
            layout.nodeLayouts["A"]!!.radius.toDouble(),
            layout.nodeLayouts["B"]!!.radius.toDouble(),
            0.001,
        )
    }

    @Test
    fun `all nodes in summary appear in layout`() {
        val nodes = (1..10).map { NavigationGraphSummaryNode(it, "Screen$it", it) }
        val layout = computeGraphLayout(
            summary = NavigationGraphSummary(nodes = nodes),
            size = IntSize(800, 800),
            baseRadiusPx = 20f,
            paddingPx = 10f,
        )
        assertEquals(10, layout.nodeLayouts.size)
        nodes.forEach { node ->
            assertNotNull(layout.nodeLayouts[node.screenName], "${node.screenName} missing from layout")
        }
    }

    @Test
    fun `node layout carries original node reference`() {
        val node = NavigationGraphSummaryNode(42, "Target", 7)
        val layout = computeGraphLayout(
            summary = NavigationGraphSummary(nodes = listOf(node)),
            size = IntSize(400, 400),
            baseRadiusPx = 20f,
            paddingPx = 10f,
        )
        assertEquals(node, layout.nodeLayouts["Target"]!!.node)
    }
}
