package dev.jasonpearson.automobile.sdk.storage

import java.util.concurrent.CopyOnWriteArrayList

/** Fake implementation of SharedPreferencesDriver for testing. */
class FakeSharedPreferencesDriver : SharedPreferencesDriver {
  private val preferenceFiles = mutableMapOf<String, MutableMap<String, Any?>>()
  private val listeners = CopyOnWriteArrayList<OnPreferenceChangeListener>()

  /**
   * Sets preferences data for a file.
   *
   * @param fileName The preferences file name (without .xml extension)
   * @param data Map of key-value pairs
   */
  fun setPreferences(fileName: String, data: Map<String, Any?>) {
    preferenceFiles[fileName] = data.toMutableMap()
  }

  /**
   * Adds a single preference to a file.
   *
   * @param fileName The preferences file name
   * @param key The preference key
   * @param value The preference value
   */
  fun putPreference(fileName: String, key: String, value: Any?) {
    preferenceFiles.getOrPut(fileName) { mutableMapOf() }[key] = value
    notifyListeners(fileName, key)
  }

  /**
   * Removes a preference from a file.
   *
   * @param fileName The preferences file name
   * @param key The preference key to remove
   */
  fun removePreference(fileName: String, key: String) {
    preferenceFiles[fileName]?.remove(key)
    notifyListeners(fileName, key)
  }

  /**
   * Clears all preferences from a file.
   *
   * @param fileName The preferences file name
   */
  fun clearPreferences(fileName: String) {
    preferenceFiles[fileName]?.clear()
    notifyListeners(fileName, null)
  }

  /** Clears all stored preferences data. */
  fun clear() {
    preferenceFiles.clear()
  }

  private fun notifyListeners(fileName: String, key: String?) {
    listeners.forEach { it.onPreferenceChanged(fileName, key) }
  }

  override fun getPreferenceFiles(): List<PreferenceFileDescriptor> {
    return preferenceFiles.map { (name, data) ->
      PreferenceFileDescriptor(
        name = name,
        path = "/data/data/com.example.app/shared_prefs/$name.xml",
        entryCount = data.size,
      )
    }
  }

  override fun getPreferences(fileName: String): List<KeyValuePair> {
    val data = preferenceFiles[fileName] ?: throw SharedPreferencesError.FileNotFound(fileName)

    return data.map { (key, value) ->
      KeyValuePair(key = key, value = value, type = detectType(value))
    }
  }

  override fun registerOnChangeListener(listener: OnPreferenceChangeListener) {
    listeners.add(listener)
  }

  override fun unregisterOnChangeListener(listener: OnPreferenceChangeListener) {
    listeners.remove(listener)
  }

  private fun detectType(value: Any?): KeyValueType {
    return when (value) {
      null -> KeyValueType.UNKNOWN
      is String -> KeyValueType.STRING
      is Int -> KeyValueType.INT
      is Long -> KeyValueType.LONG
      is Float -> KeyValueType.FLOAT
      is Boolean -> KeyValueType.BOOLEAN
      is Set<*> -> KeyValueType.STRING_SET
      else -> KeyValueType.UNKNOWN
    }
  }
}
