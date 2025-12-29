package dev.jasonpearson.automobile.sdk

import org.junit.Assert.*
import org.junit.Test

class NavigationSourceTest {

    @Test
    fun `all NavigationSource values should be accessible`() {
        val sources = NavigationSource.values()

        assertEquals(6, sources.size)
        assertTrue(sources.contains(NavigationSource.NAVIGATION_COMPONENT))
        assertTrue(sources.contains(NavigationSource.COMPOSE_NAVIGATION))
        assertTrue(sources.contains(NavigationSource.CIRCUIT))
        assertTrue(sources.contains(NavigationSource.CUSTOM))
        assertTrue(sources.contains(NavigationSource.DEEP_LINK))
        assertTrue(sources.contains(NavigationSource.ACTIVITY))
    }

    @Test
    fun `NavigationSource valueOf should work correctly`() {
        assertEquals(NavigationSource.COMPOSE_NAVIGATION, NavigationSource.valueOf("COMPOSE_NAVIGATION"))
        assertEquals(NavigationSource.CIRCUIT, NavigationSource.valueOf("CIRCUIT"))
        assertEquals(NavigationSource.NAVIGATION_COMPONENT, NavigationSource.valueOf("NAVIGATION_COMPONENT"))
    }

    @Test
    fun `NavigationSource should have correct string representation`() {
        assertEquals("COMPOSE_NAVIGATION", NavigationSource.COMPOSE_NAVIGATION.toString())
        assertEquals("CIRCUIT", NavigationSource.CIRCUIT.toString())
        assertEquals("NAVIGATION_COMPONENT", NavigationSource.NAVIGATION_COMPONENT.toString())
        assertEquals("CUSTOM", NavigationSource.CUSTOM.toString())
        assertEquals("DEEP_LINK", NavigationSource.DEEP_LINK.toString())
        assertEquals("ACTIVITY", NavigationSource.ACTIVITY.toString())
    }

    @Test
    fun `NavigationSource should support equality comparison`() {
        val source1 = NavigationSource.COMPOSE_NAVIGATION
        val source2 = NavigationSource.COMPOSE_NAVIGATION
        val source3 = NavigationSource.CIRCUIT

        assertEquals(source1, source2)
        assertNotEquals(source1, source3)
    }
}
