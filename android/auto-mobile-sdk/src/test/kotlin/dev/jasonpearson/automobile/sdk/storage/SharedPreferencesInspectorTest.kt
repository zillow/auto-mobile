package dev.jasonpearson.automobile.sdk.storage

import org.junit.Assert.*
import org.junit.Before
import org.junit.Test

class SharedPreferencesInspectorTest {

  @Before
  fun setUp() {
    SharedPreferencesInspector.reset()
  }

  @Test
  fun `isEnabled returns false by default`() {
    assertFalse(SharedPreferencesInspector.isEnabled())
  }

  @Test
  fun `setEnabled updates enabled state`() {
    SharedPreferencesInspector.setEnabled(true)

    assertTrue(SharedPreferencesInspector.isEnabled())

    SharedPreferencesInspector.setEnabled(false)

    assertFalse(SharedPreferencesInspector.isEnabled())
  }

  @Test
  fun `getDriver throws NotInitialized when not initialized`() {
    try {
      SharedPreferencesInspector.getDriver()
      fail("Expected SharedPreferencesError.NotInitialized")
    } catch (e: SharedPreferencesError.NotInitialized) {
      assertTrue(e.message!!.contains("not initialized"))
    }
  }

  @Test
  fun `reset clears state`() {
    SharedPreferencesInspector.setEnabled(true)

    SharedPreferencesInspector.reset()

    assertFalse(SharedPreferencesInspector.isEnabled())
  }
}
