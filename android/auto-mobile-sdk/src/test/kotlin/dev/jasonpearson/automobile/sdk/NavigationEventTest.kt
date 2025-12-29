package dev.jasonpearson.automobile.sdk

import org.junit.Assert.*
import org.junit.Test

class NavigationEventTest {

    @Test
    fun `NavigationEvent should have default values`() {
        val event = NavigationEvent(
            destination = "TestScreen",
            source = NavigationSource.COMPOSE_NAVIGATION
        )

        assertEquals("TestScreen", event.destination)
        assertEquals(NavigationSource.COMPOSE_NAVIGATION, event.source)
        assertTrue(event.arguments.isEmpty())
        assertTrue(event.metadata.isEmpty())
        assertTrue(event.timestamp > 0)
    }

    @Test
    fun `NavigationEvent should accept custom arguments`() {
        val arguments = mapOf("key1" to "value1", "key2" to 123)
        val event = NavigationEvent(
            destination = "TestScreen",
            source = NavigationSource.COMPOSE_NAVIGATION,
            arguments = arguments
        )

        assertEquals(arguments, event.arguments)
    }

    @Test
    fun `NavigationEvent should accept custom metadata`() {
        val metadata = mapOf("route" to "/test", "label" to "Test Screen")
        val event = NavigationEvent(
            destination = "TestScreen",
            source = NavigationSource.COMPOSE_NAVIGATION,
            metadata = metadata
        )

        assertEquals(metadata, event.metadata)
    }

    @Test
    fun `NavigationEvent should accept custom timestamp`() {
        val customTimestamp = 1234567890L
        val event = NavigationEvent(
            destination = "TestScreen",
            source = NavigationSource.COMPOSE_NAVIGATION,
            timestamp = customTimestamp
        )

        assertEquals(customTimestamp, event.timestamp)
    }

    @Test
    fun `NavigationEvent should support all NavigationSource types`() {
        val sources = listOf(
            NavigationSource.NAVIGATION_COMPONENT,
            NavigationSource.COMPOSE_NAVIGATION,
            NavigationSource.CIRCUIT,
            NavigationSource.CUSTOM,
            NavigationSource.DEEP_LINK,
            NavigationSource.ACTIVITY
        )

        sources.forEach { source ->
            val event = NavigationEvent(
                destination = "TestScreen",
                source = source
            )
            assertEquals(source, event.source)
        }
    }

    @Test
    fun `NavigationEvent data class should support copy`() {
        val original = NavigationEvent(
            destination = "Screen1",
            source = NavigationSource.COMPOSE_NAVIGATION,
            arguments = mapOf("key" to "value")
        )

        val copied = original.copy(destination = "Screen2")

        assertEquals("Screen2", copied.destination)
        assertEquals(original.source, copied.source)
        assertEquals(original.arguments, copied.arguments)
    }

    @Test
    fun `NavigationEvent data class should support equality`() {
        val event1 = NavigationEvent(
            destination = "TestScreen",
            source = NavigationSource.COMPOSE_NAVIGATION,
            timestamp = 1000L
        )

        val event2 = NavigationEvent(
            destination = "TestScreen",
            source = NavigationSource.COMPOSE_NAVIGATION,
            timestamp = 1000L
        )

        assertEquals(event1, event2)
        assertEquals(event1.hashCode(), event2.hashCode())
    }
}
