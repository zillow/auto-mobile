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

  // ================= Subscription/Listening Tests =================

  @Test
  fun `startListening marks file as listened`() {
    driver.setPreferences("prefs", mapOf("key" to "value"))

    assertFalse(driver.isListening("prefs"))

    driver.startListening("prefs")

    assertTrue(driver.isListening("prefs"))
  }

  @Test
  fun `stopListening removes file from listened set`() {
    driver.setPreferences("prefs", mapOf("key" to "value"))
    driver.startListening("prefs")
    assertTrue(driver.isListening("prefs"))

    driver.stopListening("prefs")

    assertFalse(driver.isListening("prefs"))
  }

  @Test
  fun `stopAllListening clears all listened files`() {
    driver.setPreferences("prefs1", mapOf("key" to "value"))
    driver.setPreferences("prefs2", mapOf("key" to "value"))
    driver.startListening("prefs1")
    driver.startListening("prefs2")

    driver.stopAllListening()

    assertFalse(driver.isListening("prefs1"))
    assertFalse(driver.isListening("prefs2"))
    assertTrue(driver.getListenedFiles().isEmpty())
  }

  @Test
  fun `getListenedFiles returns all listened files`() {
    driver.setPreferences("prefs1", mapOf())
    driver.setPreferences("prefs2", mapOf())
    driver.startListening("prefs1")
    driver.startListening("prefs2")

    val listened = driver.getListenedFiles()

    assertEquals(2, listened.size)
    assertTrue(listened.contains("prefs1"))
    assertTrue(listened.contains("prefs2"))
  }

  @Test
  fun `changes are queued when listening`() {
    driver.setPreferences("prefs", mapOf())
    driver.startListening("prefs")

    driver.putPreference("prefs", "key1", "value1")
    driver.putPreference("prefs", "key2", 42)

    val changes = driver.getQueuedChanges("prefs", 0)

    assertEquals(2, changes.size)
    assertEquals("key1", changes[0].key)
    assertEquals("value1", changes[0].newValue)
    assertEquals(KeyValueType.STRING, changes[0].type)
    assertEquals("key2", changes[1].key)
    assertEquals(42, changes[1].newValue)
    assertEquals(KeyValueType.INT, changes[1].type)
  }

  @Test
  fun `changes are not queued when not listening`() {
    driver.setPreferences("prefs", mapOf())
    // Not calling startListening

    driver.putPreference("prefs", "key", "value")

    val changes = driver.getQueuedChanges("prefs", 0)
    assertTrue(changes.isEmpty())
  }

  @Test
  fun `getQueuedChanges removes returned changes from queue`() {
    driver.setPreferences("prefs", mapOf())
    driver.startListening("prefs")

    driver.putPreference("prefs", "key1", "value1")
    driver.putPreference("prefs", "key2", "value2")

    val firstBatch = driver.getQueuedChanges("prefs", 0)
    assertEquals(2, firstBatch.size)

    val secondBatch = driver.getQueuedChanges("prefs", 0)
    assertTrue(secondBatch.isEmpty())
  }

  @Test
  fun `getQueuedChanges filters by sinceSequence`() {
    driver.setPreferences("prefs", mapOf())
    driver.startListening("prefs")

    driver.putPreference("prefs", "key1", "value1")
    driver.putPreference("prefs", "key2", "value2")
    driver.putPreference("prefs", "key3", "value3")

    // Get all changes to capture sequence numbers
    val allChanges = driver.getQueuedChanges("prefs", 0)
    assertEquals(3, allChanges.size)

    // Re-add changes to test filtering
    driver.putPreference("prefs", "key4", "value4")
    driver.putPreference("prefs", "key5", "value5")

    // Get changes since sequence 3 (should only get key4 and key5)
    val newChanges = driver.getQueuedChanges("prefs", 3)
    assertEquals(2, newChanges.size)
    assertEquals("key4", newChanges[0].key)
    assertEquals("key5", newChanges[1].key)
  }

  @Test
  fun `sequence numbers are monotonically increasing`() {
    driver.setPreferences("prefs", mapOf())
    driver.startListening("prefs")

    driver.putPreference("prefs", "key1", "value1")
    driver.putPreference("prefs", "key2", "value2")
    driver.putPreference("prefs", "key3", "value3")

    val changes = driver.getQueuedChanges("prefs", 0)

    assertTrue(changes[0].sequenceNumber < changes[1].sequenceNumber)
    assertTrue(changes[1].sequenceNumber < changes[2].sequenceNumber)
  }

  @Test
  fun `remove preference queues change with null value`() {
    driver.setPreferences("prefs", mapOf("key" to "value"))
    driver.startListening("prefs")

    driver.removePreference("prefs", "key")

    val changes = driver.getQueuedChanges("prefs", 0)
    assertEquals(1, changes.size)
    assertEquals("key", changes[0].key)
    assertNull(changes[0].newValue)
  }

  @Test
  fun `clear preferences queues change with null key`() {
    driver.setPreferences("prefs", mapOf("key1" to "v1", "key2" to "v2"))
    driver.startListening("prefs")

    driver.clearPreferences("prefs")

    val changes = driver.getQueuedChanges("prefs", 0)
    assertEquals(1, changes.size)
    assertNull(changes[0].key)
    assertNull(changes[0].newValue)
  }

  @Test
  fun `stopListening clears change queue for file`() {
    driver.setPreferences("prefs", mapOf())
    driver.startListening("prefs")
    driver.putPreference("prefs", "key", "value")

    driver.stopListening("prefs")

    val changes = driver.getQueuedChanges("prefs", 0)
    assertTrue(changes.isEmpty())
  }
}
