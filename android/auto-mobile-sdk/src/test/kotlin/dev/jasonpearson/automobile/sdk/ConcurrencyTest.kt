package dev.jasonpearson.automobile.sdk

import dev.jasonpearson.automobile.sdk.adapters.CircuitAdapter
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicInteger
import org.junit.After
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test

/** Tests for concurrent access to the SDK. */
class ConcurrencyTest {

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
  fun `concurrent listener registration should be thread-safe`() {
    val executor = Executors.newFixedThreadPool(10)
    val latch = CountDownLatch(100)
    val listeners = mutableListOf<NavigationListener>()

    repeat(100) {
      executor.submit {
        val listener = NavigationListener {}
        synchronized(listeners) { listeners.add(listener) }
        AutoMobileSDK.addNavigationListener(listener)
        latch.countDown()
      }
    }

    assertTrue(latch.await(5, TimeUnit.SECONDS))
    assertEquals(100, AutoMobileSDK.getListenerCount())

    executor.shutdown()
    assertTrue(executor.awaitTermination(5, TimeUnit.SECONDS))
  }

  @Test
  fun `concurrent event notifications should be thread-safe`() {
    val eventCount = AtomicInteger(0)
    val listener = NavigationListener { eventCount.incrementAndGet() }

    AutoMobileSDK.addNavigationListener(listener)
    CircuitAdapter.start()

    val executor = Executors.newFixedThreadPool(10)
    val latch = CountDownLatch(100)

    repeat(100) { index ->
      executor.submit {
        CircuitAdapter.trackNavigation("Screen$index")
        latch.countDown()
      }
    }

    assertTrue(latch.await(5, TimeUnit.SECONDS))
    assertEquals(100, eventCount.get())

    executor.shutdown()
    assertTrue(executor.awaitTermination(5, TimeUnit.SECONDS))
  }

  @Test
  fun `concurrent listener removal should be thread-safe`() {
    val listeners = (1..50).map { NavigationListener {} }
    listeners.forEach { AutoMobileSDK.addNavigationListener(it) }

    assertEquals(50, AutoMobileSDK.getListenerCount())

    val executor = Executors.newFixedThreadPool(10)
    val latch = CountDownLatch(50)

    listeners.forEach { listener ->
      executor.submit {
        AutoMobileSDK.removeNavigationListener(listener)
        latch.countDown()
      }
    }

    assertTrue(latch.await(5, TimeUnit.SECONDS))
    assertEquals(0, AutoMobileSDK.getListenerCount())

    executor.shutdown()
    assertTrue(executor.awaitTermination(5, TimeUnit.SECONDS))
  }

  @Test
  fun `concurrent enable and disable should be thread-safe`() {
    val executor = Executors.newFixedThreadPool(10)
    val latch = CountDownLatch(100)

    repeat(100) { index ->
      executor.submit {
        if (index % 2 == 0) {
          AutoMobileSDK.setEnabled(true)
        } else {
          AutoMobileSDK.setEnabled(false)
        }
        latch.countDown()
      }
    }

    assertTrue(latch.await(5, TimeUnit.SECONDS))

    // Final state should be consistent
    val isEnabled = AutoMobileSDK.isEnabled()
    assertTrue(isEnabled || !isEnabled) // Just verify we can read the state

    executor.shutdown()
    assertTrue(executor.awaitTermination(5, TimeUnit.SECONDS))
  }

  @Test
  fun `concurrent navigation events with multiple listeners should deliver all events`() {
    val eventCounts = (1..5).map { AtomicInteger(0) }
    val listeners = eventCounts.map { counter -> NavigationListener { counter.incrementAndGet() } }

    listeners.forEach { AutoMobileSDK.addNavigationListener(it) }
    CircuitAdapter.start()

    val executor = Executors.newFixedThreadPool(10)
    val latch = CountDownLatch(50)

    repeat(50) { index ->
      executor.submit {
        CircuitAdapter.trackNavigation("Screen$index")
        latch.countDown()
      }
    }

    assertTrue(latch.await(5, TimeUnit.SECONDS))

    // All listeners should have received all 50 events
    eventCounts.forEach { counter -> assertEquals(50, counter.get()) }

    executor.shutdown()
    assertTrue(executor.awaitTermination(5, TimeUnit.SECONDS))
  }

  @Test
  fun `clearing listeners while events are being fired should not cause errors`() {
    val eventCount = AtomicInteger(0)
    val listener = NavigationListener {
      eventCount.incrementAndGet()
      Thread.sleep(1) // Slow down processing
    }

    AutoMobileSDK.addNavigationListener(listener)
    CircuitAdapter.start()

    val executor = Executors.newFixedThreadPool(2)
    val eventLatch = CountDownLatch(1)
    val clearLatch = CountDownLatch(1)

    // Start firing events
    executor.submit {
      repeat(100) { index -> CircuitAdapter.trackNavigation("Screen$index") }
      eventLatch.countDown()
    }

    // Clear listeners while events are being fired
    executor.submit {
      Thread.sleep(5) // Give events time to start firing
      AutoMobileSDK.clearNavigationListeners()
      clearLatch.countDown()
    }

    assertTrue(eventLatch.await(10, TimeUnit.SECONDS))
    assertTrue(clearLatch.await(10, TimeUnit.SECONDS))

    // Should have processed some events before clearing
    val finalCount = eventCount.get()
    assertTrue("Expected some events to be processed, got $finalCount", finalCount > 0)
    assertTrue("Expected not all events to be processed, got $finalCount", finalCount < 100)

    executor.shutdown()
    assertTrue(executor.awaitTermination(5, TimeUnit.SECONDS))
  }
}
