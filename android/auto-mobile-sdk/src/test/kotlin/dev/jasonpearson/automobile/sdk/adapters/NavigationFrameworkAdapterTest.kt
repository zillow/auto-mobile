package dev.jasonpearson.automobile.sdk.adapters

import org.junit.Assert.*
import org.junit.Test

class NavigationFrameworkAdapterTest {

  private class TestAdapter : NavigationFrameworkAdapter {
    private var active = false

    override fun start() {
      active = true
    }

    override fun stop() {
      active = false
    }

    override fun isActive(): Boolean = active
  }

  @Test
  fun `adapter should track active state`() {
    val adapter = TestAdapter()

    assertFalse(adapter.isActive())

    adapter.start()
    assertTrue(adapter.isActive())

    adapter.stop()
    assertFalse(adapter.isActive())
  }

  @Test
  fun `multiple start calls should not cause issues`() {
    val adapter = TestAdapter()

    adapter.start()
    adapter.start()
    adapter.start()

    assertTrue(adapter.isActive())
  }

  @Test
  fun `multiple stop calls should not cause issues`() {
    val adapter = TestAdapter()

    adapter.start()
    adapter.stop()
    adapter.stop()
    adapter.stop()

    assertFalse(adapter.isActive())
  }

  @Test
  fun `start and stop should be idempotent`() {
    val adapter = TestAdapter()

    // Start-stop-start-stop sequence
    adapter.start()
    assertTrue(adapter.isActive())

    adapter.stop()
    assertFalse(adapter.isActive())

    adapter.start()
    assertTrue(adapter.isActive())

    adapter.stop()
    assertFalse(adapter.isActive())
  }
}
