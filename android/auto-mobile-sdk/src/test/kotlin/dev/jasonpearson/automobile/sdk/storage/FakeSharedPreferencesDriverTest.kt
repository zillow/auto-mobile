package dev.jasonpearson.automobile.sdk.storage

import org.junit.Assert.*
import org.junit.Before
import org.junit.Test

class FakeSharedPreferencesDriverTest {

  private lateinit var driver: FakeSharedPreferencesDriver

  @Before
  fun setUp() {
    driver = FakeSharedPreferencesDriver()
  }

  @Test
  fun `getPreferenceFiles returns empty list initially`() {
    val files = driver.getPreferenceFiles()

    assertTrue(files.isEmpty())
  }

  @Test
  fun `getPreferenceFiles returns added preferences`() {
    driver.setPreferences("auth_prefs", mapOf("token" to "abc123", "userId" to 42))
    driver.setPreferences("settings", mapOf("darkMode" to true))

    val files = driver.getPreferenceFiles()

    assertEquals(2, files.size)
    val authFile = files.find { it.name == "auth_prefs" }
    assertNotNull(authFile)
    assertEquals(2, authFile!!.entryCount)
    assertTrue(authFile.path.contains("auth_prefs.xml"))
  }

  @Test
  fun `getPreferences returns all entries for a file`() {
    driver.setPreferences(
      "user_prefs",
      mapOf("name" to "John", "age" to 30, "premium" to true, "score" to 95.5f),
    )

    val prefs = driver.getPreferences("user_prefs")

    assertEquals(4, prefs.size)

    val namePref = prefs.find { it.key == "name" }
    assertNotNull(namePref)
    assertEquals("John", namePref!!.value)
    assertEquals(KeyValueType.STRING, namePref.type)

    val agePref = prefs.find { it.key == "age" }
    assertNotNull(agePref)
    assertEquals(30, agePref!!.value)
    assertEquals(KeyValueType.INT, agePref.type)

    val premiumPref = prefs.find { it.key == "premium" }
    assertNotNull(premiumPref)
    assertEquals(true, premiumPref!!.value)
    assertEquals(KeyValueType.BOOLEAN, premiumPref.type)

    val scorePref = prefs.find { it.key == "score" }
    assertNotNull(scorePref)
    assertEquals(95.5f, scorePref!!.value)
    assertEquals(KeyValueType.FLOAT, scorePref.type)
  }

  @Test
  fun `getPreferences throws FileNotFound for unknown file`() {
    try {
      driver.getPreferences("nonexistent")
      fail("Expected SharedPreferencesError.FileNotFound")
    } catch (e: SharedPreferencesError.FileNotFound) {
      assertTrue(e.message!!.contains("nonexistent"))
    }
  }

  @Test
  fun `putPreference adds entry to file`() {
    driver.putPreference("prefs", "key1", "value1")
    driver.putPreference("prefs", "key2", 100)

    val prefs = driver.getPreferences("prefs")

    assertEquals(2, prefs.size)
    assertNotNull(prefs.find { it.key == "key1" && it.value == "value1" })
    assertNotNull(prefs.find { it.key == "key2" && it.value == 100 })
  }

  @Test
  fun `removePreference removes entry from file`() {
    driver.setPreferences("prefs", mapOf("key1" to "value1", "key2" to "value2"))

    driver.removePreference("prefs", "key1")

    val prefs = driver.getPreferences("prefs")
    assertEquals(1, prefs.size)
    assertNull(prefs.find { it.key == "key1" })
    assertNotNull(prefs.find { it.key == "key2" })
  }

  @Test
  fun `clearPreferences removes all entries from file`() {
    driver.setPreferences("prefs", mapOf("key1" to "value1", "key2" to "value2"))

    driver.clearPreferences("prefs")

    val prefs = driver.getPreferences("prefs")
    assertTrue(prefs.isEmpty())
  }

  @Test
  fun `change listener is notified on putPreference`() {
    var notifiedFile: String? = null
    var notifiedKey: String? = null

    driver.registerOnChangeListener { file, key ->
      notifiedFile = file
      notifiedKey = key
    }

    driver.putPreference("settings", "theme", "dark")

    assertEquals("settings", notifiedFile)
    assertEquals("theme", notifiedKey)
  }

  @Test
  fun `change listener is notified on removePreference`() {
    driver.setPreferences("settings", mapOf("theme" to "light"))

    var notifiedFile: String? = null
    var notifiedKey: String? = null

    driver.registerOnChangeListener { file, key ->
      notifiedFile = file
      notifiedKey = key
    }

    driver.removePreference("settings", "theme")

    assertEquals("settings", notifiedFile)
    assertEquals("theme", notifiedKey)
  }

  @Test
  fun `change listener is notified on clearPreferences with null key`() {
    driver.setPreferences("settings", mapOf("theme" to "light"))

    var notifiedFile: String? = null
    var notifiedKey: String? = "initial"

    driver.registerOnChangeListener { file, key ->
      notifiedFile = file
      notifiedKey = key
    }

    driver.clearPreferences("settings")

    assertEquals("settings", notifiedFile)
    assertNull(notifiedKey)
  }

  @Test
  fun `unregistered listener is not notified`() {
    var callCount = 0
    val listener = OnPreferenceChangeListener { _, _ -> callCount++ }

    driver.registerOnChangeListener(listener)
    driver.putPreference("prefs", "key", "value")
    assertEquals(1, callCount)

    driver.unregisterOnChangeListener(listener)
    driver.putPreference("prefs", "key2", "value2")
    assertEquals(1, callCount)
  }

  @Test
  fun `type detection works for all supported types`() {
    driver.setPreferences(
      "types",
      mapOf(
        "string" to "hello",
        "int" to 42,
        "long" to 9999999999L,
        "float" to 3.14f,
        "boolean" to false,
        "stringSet" to setOf("a", "b", "c"),
        "null" to null,
      ),
    )

    val prefs = driver.getPreferences("types")

    assertEquals(KeyValueType.STRING, prefs.find { it.key == "string" }?.type)
    assertEquals(KeyValueType.INT, prefs.find { it.key == "int" }?.type)
    assertEquals(KeyValueType.LONG, prefs.find { it.key == "long" }?.type)
    assertEquals(KeyValueType.FLOAT, prefs.find { it.key == "float" }?.type)
    assertEquals(KeyValueType.BOOLEAN, prefs.find { it.key == "boolean" }?.type)
    assertEquals(KeyValueType.STRING_SET, prefs.find { it.key == "stringSet" }?.type)
    assertEquals(KeyValueType.UNKNOWN, prefs.find { it.key == "null" }?.type)
  }

  @Test
  fun `clear removes all preference files`() {
    driver.setPreferences("file1", mapOf("key" to "value"))
    driver.setPreferences("file2", mapOf("key" to "value"))

    driver.clear()

    assertTrue(driver.getPreferenceFiles().isEmpty())
  }
}
