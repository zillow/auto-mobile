package dev.jasonpearson.automobile.sdk.adapters

import dev.jasonpearson.automobile.sdk.AutoMobileSDK
import dev.jasonpearson.automobile.sdk.NavigationEvent
import dev.jasonpearson.automobile.sdk.NavigationSource
import org.junit.After
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test

class CircuitAdapterTest {

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
  fun `start should activate adapter`() {
    assertFalse(CircuitAdapter.isActive())

    CircuitAdapter.start()

    assertTrue(CircuitAdapter.isActive())
  }

  @Test
  fun `stop should deactivate adapter`() {
    CircuitAdapter.start()
    assertTrue(CircuitAdapter.isActive())

    CircuitAdapter.stop()

    assertFalse(CircuitAdapter.isActive())
  }

  @Test
  fun `trackNavigation should notify SDK when active`() {
    var receivedEvent: NavigationEvent? = null
    AutoMobileSDK.addNavigationListener { event -> receivedEvent = event }

    CircuitAdapter.start()
    CircuitAdapter.trackNavigation("ProfileScreen")

    assertNotNull(receivedEvent)
    assertEquals("ProfileScreen", receivedEvent?.destination)
    assertEquals(NavigationSource.CIRCUIT, receivedEvent?.source)
  }

  @Test
  fun `trackNavigation should not notify SDK when inactive`() {
    var receivedEvent: NavigationEvent? = null
    AutoMobileSDK.addNavigationListener { event -> receivedEvent = event }

    // Don't start the adapter
    CircuitAdapter.trackNavigation("ProfileScreen")

    assertNull(receivedEvent)
  }

  @Test
  fun `trackNavigation should include arguments`() {
    var receivedEvent: NavigationEvent? = null
    AutoMobileSDK.addNavigationListener { event -> receivedEvent = event }

    val arguments = mapOf("userId" to "123", "fromScreen" to "Home")

    CircuitAdapter.start()
    CircuitAdapter.trackNavigation(destination = "ProfileScreen", arguments = arguments)

    assertNotNull(receivedEvent)
    assertEquals(arguments, receivedEvent?.arguments)
  }

  @Test
  fun `trackNavigation should include metadata`() {
    var receivedEvent: NavigationEvent? = null
    AutoMobileSDK.addNavigationListener { event -> receivedEvent = event }

    val metadata = mapOf("transition" to "slide", "duration" to "300")

    CircuitAdapter.start()
    CircuitAdapter.trackNavigation(destination = "ProfileScreen", metadata = metadata)

    assertNotNull(receivedEvent)
    assertEquals(metadata, receivedEvent?.metadata)
  }

  @Test
  fun `trackNavigation should handle empty arguments and metadata`() {
    var receivedEvent: NavigationEvent? = null
    AutoMobileSDK.addNavigationListener { event -> receivedEvent = event }

    CircuitAdapter.start()
    CircuitAdapter.trackNavigation("ProfileScreen")

    assertNotNull(receivedEvent)
    assertTrue(receivedEvent?.arguments?.isEmpty() ?: false)
    assertTrue(receivedEvent?.metadata?.isEmpty() ?: false)
  }

  @Test
  fun `multiple trackNavigation calls should trigger multiple events`() {
    val receivedEvents = mutableListOf<NavigationEvent>()
    AutoMobileSDK.addNavigationListener { event -> receivedEvents.add(event) }

    CircuitAdapter.start()
    CircuitAdapter.trackNavigation("Screen1")
    CircuitAdapter.trackNavigation("Screen2")
    CircuitAdapter.trackNavigation("Screen3")

    assertEquals(3, receivedEvents.size)
    assertEquals("Screen1", receivedEvents[0].destination)
    assertEquals("Screen2", receivedEvents[1].destination)
    assertEquals("Screen3", receivedEvents[2].destination)
  }
}
