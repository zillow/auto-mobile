package dev.jasonpearson.automobile.sdk

import org.junit.After
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test

class AutoMobileSDKTest {

  @Before
  fun setup() {
    // Clear all listeners before each test
    AutoMobileSDK.clearNavigationListeners()
    AutoMobileSDK.setEnabled(true)
  }

  @After
  fun tearDown() {
    // Clean up after each test
    AutoMobileSDK.clearNavigationListeners()
    AutoMobileSDK.setEnabled(true)
  }

  @Test
  fun `addNavigationListener should register listener`() {
    val listener = NavigationListener {}
    AutoMobileSDK.addNavigationListener(listener)

    assertEquals(1, AutoMobileSDK.getListenerCount())
  }

  @Test
  fun `removeNavigationListener should unregister listener`() {
    val listener = NavigationListener {}
    AutoMobileSDK.addNavigationListener(listener)
    AutoMobileSDK.removeNavigationListener(listener)

    assertEquals(0, AutoMobileSDK.getListenerCount())
  }

  @Test
  fun `clearNavigationListeners should remove all listeners`() {
    AutoMobileSDK.addNavigationListener {}
    AutoMobileSDK.addNavigationListener {}
    AutoMobileSDK.addNavigationListener {}

    AutoMobileSDK.clearNavigationListeners()

    assertEquals(0, AutoMobileSDK.getListenerCount())
  }

  @Test
  fun `notifyNavigationEvent should invoke listener`() {
    var receivedEvent: NavigationEvent? = null
    val listener = NavigationListener { event -> receivedEvent = event }

    AutoMobileSDK.addNavigationListener(listener)
    val event =
        NavigationEvent(destination = "TestScreen", source = NavigationSource.COMPOSE_NAVIGATION)
    AutoMobileSDK.notifyNavigationEvent(event)

    assertNotNull(receivedEvent)
    assertEquals("TestScreen", receivedEvent?.destination)
    assertEquals(NavigationSource.COMPOSE_NAVIGATION, receivedEvent?.source)
  }

  @Test
  fun `notifyNavigationEvent should invoke all registered listeners`() {
    var callCount = 0
    val listener1 = NavigationListener { callCount++ }
    val listener2 = NavigationListener { callCount++ }
    val listener3 = NavigationListener { callCount++ }

    AutoMobileSDK.addNavigationListener(listener1)
    AutoMobileSDK.addNavigationListener(listener2)
    AutoMobileSDK.addNavigationListener(listener3)

    val event =
        NavigationEvent(destination = "TestScreen", source = NavigationSource.COMPOSE_NAVIGATION)
    AutoMobileSDK.notifyNavigationEvent(event)

    assertEquals(3, callCount)
  }

  @Test
  fun `notifyNavigationEvent should not invoke listeners when disabled`() {
    var receivedEvent: NavigationEvent? = null
    val listener = NavigationListener { event -> receivedEvent = event }

    AutoMobileSDK.addNavigationListener(listener)
    AutoMobileSDK.setEnabled(false)

    val event =
        NavigationEvent(destination = "TestScreen", source = NavigationSource.COMPOSE_NAVIGATION)
    AutoMobileSDK.notifyNavigationEvent(event)

    assertNull(receivedEvent)
  }

  @Test
  fun `setEnabled should control tracking state`() {
    assertTrue(AutoMobileSDK.isEnabled())

    AutoMobileSDK.setEnabled(false)
    assertFalse(AutoMobileSDK.isEnabled())

    AutoMobileSDK.setEnabled(true)
    assertTrue(AutoMobileSDK.isEnabled())
  }

  @Test
  fun `notifyNavigationEvent should handle listener exceptions gracefully`() {
    var successfulCallCount = 0
    val throwingListener = NavigationListener { throw RuntimeException("Test exception") }
    val workingListener = NavigationListener { successfulCallCount++ }

    AutoMobileSDK.addNavigationListener(throwingListener)
    AutoMobileSDK.addNavigationListener(workingListener)

    val event =
        NavigationEvent(destination = "TestScreen", source = NavigationSource.COMPOSE_NAVIGATION)

    // Should not throw exception
    AutoMobileSDK.notifyNavigationEvent(event)

    // Working listener should still have been called
    assertEquals(1, successfulCallCount)
  }

  @Test
  fun `NavigationEvent should include arguments and metadata`() {
    val arguments = mapOf("userId" to "123", "fromScreen" to "Home")
    val metadata = mapOf("timestamp" to "2025-01-01", "sessionId" to "abc")

    var receivedEvent: NavigationEvent? = null
    AutoMobileSDK.addNavigationListener { event -> receivedEvent = event }

    val event =
        NavigationEvent(
            destination = "ProfileScreen",
            source = NavigationSource.COMPOSE_NAVIGATION,
            arguments = arguments,
            metadata = metadata,
        )
    AutoMobileSDK.notifyNavigationEvent(event)

    assertNotNull(receivedEvent)
    assertEquals(arguments, receivedEvent?.arguments)
    assertEquals(metadata, receivedEvent?.metadata)
  }
}
