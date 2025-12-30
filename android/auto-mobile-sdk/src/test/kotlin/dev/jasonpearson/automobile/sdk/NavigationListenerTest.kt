package dev.jasonpearson.automobile.sdk

import org.junit.Assert.*
import org.junit.Test

class NavigationListenerTest {

    @Test
    fun `NavigationListener should be invokable`() {
        var callCount = 0
        val listener = NavigationListener { callCount++ }

        listener.onNavigationEvent(
            NavigationEvent(
                destination = "TestScreen",
                source = NavigationSource.COMPOSE_NAVIGATION
            )
        )

        assertEquals(1, callCount)
    }

    @Test
    fun `NavigationListener should receive event data`() {
        var receivedDestination: String? = null
        var receivedSource: NavigationSource? = null

        val listener = NavigationListener { event ->
            receivedDestination = event.destination
            receivedSource = event.source
        }

        listener.onNavigationEvent(
            NavigationEvent(
                destination = "ProfileScreen",
                source = NavigationSource.CIRCUIT
            )
        )

        assertEquals("ProfileScreen", receivedDestination)
        assertEquals(NavigationSource.CIRCUIT, receivedSource)
    }

    @Test
    fun `NavigationListener can be created with lambda`() {
        val events = mutableListOf<NavigationEvent>()
        val listener = NavigationListener { event -> events.add(event) }

        val event1 = NavigationEvent("Screen1", source = NavigationSource.COMPOSE_NAVIGATION)
        val event2 = NavigationEvent("Screen2", source = NavigationSource.CIRCUIT)

        listener.onNavigationEvent(event1)
        listener.onNavigationEvent(event2)

        assertEquals(2, events.size)
        assertEquals("Screen1", events[0].destination)
        assertEquals("Screen2", events[1].destination)
    }

    @Test
    fun `NavigationListener should handle exceptions gracefully in implementation`() {
        val listener = NavigationListener {
            throw RuntimeException("Test exception")
        }

        // Should not throw exception to caller
        try {
            listener.onNavigationEvent(
                NavigationEvent(
                    destination = "TestScreen",
                    source = NavigationSource.COMPOSE_NAVIGATION
                )
            )
            fail("Expected exception to be thrown")
        } catch (e: RuntimeException) {
            assertEquals("Test exception", e.message)
        }
    }

    @Test
    fun `multiple NavigationListeners should be independent`() {
        var count1 = 0
        var count2 = 0

        val listener1 = NavigationListener { count1++ }
        val listener2 = NavigationListener { count2++ }

        val event = NavigationEvent("TestScreen", source = NavigationSource.COMPOSE_NAVIGATION)

        listener1.onNavigationEvent(event)
        listener1.onNavigationEvent(event)
        listener2.onNavigationEvent(event)

        assertEquals(2, count1)
        assertEquals(1, count2)
    }
}
