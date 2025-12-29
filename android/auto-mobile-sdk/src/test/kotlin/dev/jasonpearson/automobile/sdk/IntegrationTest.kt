package dev.jasonpearson.automobile.sdk

import dev.jasonpearson.automobile.sdk.adapters.CircuitAdapter
import org.junit.After
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test

/**
 * Integration tests that verify the SDK works end-to-end with different adapters.
 */
class IntegrationTest {

    @Before
    fun setup() {
        AutoMobileSDK.clearNavigationListeners()
        AutoMobileSDK.setEnabled(true)
        CircuitAdapter.stop()
    }

    @After
    fun tearDown() {
        AutoMobileSDK.clearNavigationListeners()
        CircuitAdapter.stop()
    }

    @Test
    fun `end-to-end navigation tracking with Circuit adapter`() {
        val events = mutableListOf<NavigationEvent>()
        AutoMobileSDK.addNavigationListener { event ->
            events.add(event)
        }

        CircuitAdapter.start()

        // Simulate navigation flow
        CircuitAdapter.trackNavigation("HomeScreen")
        CircuitAdapter.trackNavigation(
            destination = "ProfileScreen",
            arguments = mapOf("userId" to "123")
        )
        CircuitAdapter.trackNavigation("SettingsScreen")

        assertEquals(3, events.size)
        assertEquals("HomeScreen", events[0].destination)
        assertEquals("ProfileScreen", events[1].destination)
        assertEquals("SettingsScreen", events[2].destination)
        assertEquals("123", events[1].arguments["userId"])
    }

    @Test
    fun `multiple listeners should all receive events`() {
        val events1 = mutableListOf<NavigationEvent>()
        val events2 = mutableListOf<NavigationEvent>()
        val events3 = mutableListOf<NavigationEvent>()

        AutoMobileSDK.addNavigationListener { events1.add(it) }
        AutoMobileSDK.addNavigationListener { events2.add(it) }
        AutoMobileSDK.addNavigationListener { events3.add(it) }

        CircuitAdapter.start()
        CircuitAdapter.trackNavigation("TestScreen")

        assertEquals(1, events1.size)
        assertEquals(1, events2.size)
        assertEquals(1, events3.size)
        assertEquals("TestScreen", events1[0].destination)
        assertEquals("TestScreen", events2[0].destination)
        assertEquals("TestScreen", events3[0].destination)
    }

    @Test
    fun `removing listener should stop receiving events`() {
        val events1 = mutableListOf<NavigationEvent>()
        val events2 = mutableListOf<NavigationEvent>()

        val listener1 = NavigationListener { events1.add(it) }
        val listener2 = NavigationListener { events2.add(it) }

        AutoMobileSDK.addNavigationListener(listener1)
        AutoMobileSDK.addNavigationListener(listener2)

        CircuitAdapter.start()
        CircuitAdapter.trackNavigation("Screen1")

        // Remove listener1
        AutoMobileSDK.removeNavigationListener(listener1)

        CircuitAdapter.trackNavigation("Screen2")

        // listener1 should only have Screen1, listener2 should have both
        assertEquals(1, events1.size)
        assertEquals(2, events2.size)
        assertEquals("Screen1", events1[0].destination)
        assertEquals("Screen2", events2[1].destination)
    }

    @Test
    fun `disabling SDK should stop all event notifications`() {
        val events = mutableListOf<NavigationEvent>()
        AutoMobileSDK.addNavigationListener { events.add(it) }

        CircuitAdapter.start()
        CircuitAdapter.trackNavigation("Screen1")

        AutoMobileSDK.setEnabled(false)
        CircuitAdapter.trackNavigation("Screen2")

        AutoMobileSDK.setEnabled(true)
        CircuitAdapter.trackNavigation("Screen3")

        assertEquals(2, events.size)
        assertEquals("Screen1", events[0].destination)
        assertEquals("Screen3", events[1].destination)
    }

    @Test
    fun `clearing listeners should remove all registered listeners`() {
        val events1 = mutableListOf<NavigationEvent>()
        val events2 = mutableListOf<NavigationEvent>()

        AutoMobileSDK.addNavigationListener { events1.add(it) }
        AutoMobileSDK.addNavigationListener { events2.add(it) }

        CircuitAdapter.start()
        CircuitAdapter.trackNavigation("Screen1")

        assertEquals(1, events1.size)
        assertEquals(1, events2.size)

        AutoMobileSDK.clearNavigationListeners()
        CircuitAdapter.trackNavigation("Screen2")

        // No new events should be received
        assertEquals(1, events1.size)
        assertEquals(1, events2.size)
    }

    @Test
    fun `listener exception should not affect other listeners`() {
        val events1 = mutableListOf<NavigationEvent>()
        val events2 = mutableListOf<NavigationEvent>()

        // Listener that throws exception
        AutoMobileSDK.addNavigationListener {
            throw RuntimeException("Test exception")
        }

        // Normal listeners
        AutoMobileSDK.addNavigationListener { events1.add(it) }
        AutoMobileSDK.addNavigationListener { events2.add(it) }

        CircuitAdapter.start()
        CircuitAdapter.trackNavigation("TestScreen")

        // Both normal listeners should have received the event
        assertEquals(1, events1.size)
        assertEquals(1, events2.size)
    }

    @Test
    fun `navigation events should include timestamps`() {
        val events = mutableListOf<NavigationEvent>()
        AutoMobileSDK.addNavigationListener { events.add(it) }

        CircuitAdapter.start()

        val startTime = System.currentTimeMillis()
        CircuitAdapter.trackNavigation("Screen1")
        Thread.sleep(10)
        CircuitAdapter.trackNavigation("Screen2")
        val endTime = System.currentTimeMillis()

        assertEquals(2, events.size)
        assertTrue(events[0].timestamp >= startTime)
        assertTrue(events[1].timestamp <= endTime)
        assertTrue(events[1].timestamp >= events[0].timestamp)
    }

    @Test
    fun `complex navigation flow with arguments and metadata`() {
        val events = mutableListOf<NavigationEvent>()
        AutoMobileSDK.addNavigationListener { events.add(it) }

        CircuitAdapter.start()

        // Simulate complex navigation flow
        CircuitAdapter.trackNavigation(
            destination = "HomeScreen",
            arguments = mapOf("tab" to "discover"),
            metadata = mapOf("source" to "deeplink")
        )

        CircuitAdapter.trackNavigation(
            destination = "VideoPlayerScreen",
            arguments = mapOf("videoId" to "abc123", "autoplay" to true),
            metadata = mapOf("transition" to "fade", "duration" to "300")
        )

        CircuitAdapter.trackNavigation(
            destination = "SettingsScreen",
            arguments = emptyMap(),
            metadata = mapOf("previousScreen" to "VideoPlayerScreen")
        )

        assertEquals(3, events.size)

        // Verify first navigation
        assertEquals("HomeScreen", events[0].destination)
        assertEquals("discover", events[0].arguments["tab"])
        assertEquals("deeplink", events[0].metadata["source"])

        // Verify second navigation
        assertEquals("VideoPlayerScreen", events[1].destination)
        assertEquals("abc123", events[1].arguments["videoId"])
        assertEquals(true, events[1].arguments["autoplay"])
        assertEquals("fade", events[1].metadata["transition"])

        // Verify third navigation
        assertEquals("SettingsScreen", events[2].destination)
        assertTrue(events[2].arguments.isEmpty())
        assertEquals("VideoPlayerScreen", events[2].metadata["previousScreen"])
    }

    @Test
    fun `adapter state should persist across multiple navigation events`() {
        val events = mutableListOf<NavigationEvent>()
        AutoMobileSDK.addNavigationListener { events.add(it) }

        CircuitAdapter.start()
        assertTrue(CircuitAdapter.isActive())

        CircuitAdapter.trackNavigation("Screen1")
        assertTrue(CircuitAdapter.isActive())

        CircuitAdapter.trackNavigation("Screen2")
        assertTrue(CircuitAdapter.isActive())

        CircuitAdapter.trackNavigation("Screen3")
        assertTrue(CircuitAdapter.isActive())

        assertEquals(3, events.size)

        CircuitAdapter.stop()
        assertFalse(CircuitAdapter.isActive())

        CircuitAdapter.trackNavigation("Screen4")
        assertEquals(3, events.size) // No new event should be added
    }
}
