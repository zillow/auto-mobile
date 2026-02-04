package dev.jasonpearson.automobile.sdk.storage

import java.util.concurrent.CopyOnWriteArrayList
import java.util.concurrent.atomic.AtomicLong

/** Fake implementation of SharedPreferencesDriver for testing. */
class FakeSharedPreferencesDriver : SharedPreferencesDriver {
  private val preferenceFiles = mutableMapOf<String, MutableMap<String, Any?>>()
  private val listeners = CopyOnWriteArrayList<OnPreferenceChangeListener>()
  private val listenedFiles = mutableSetOf<String>()
  private val changeQueues = mutableMapOf<String, CopyOnWriteArrayList<PreferenceChange>>()
  private val sequenceCounter = AtomicLong(0)

  /** Whether to record changes (simulates listening). */
  var recordChanges: Boolean = true

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
    if (isListening(fileName)) {
      queueChange(fileName, key, value)
    }
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
    if (isListening(fileName)) {
      queueChange(fileName, key, null)
    }
    notifyListeners(fileName, key)
  }

  /**
   * Clears all preferences from a file.
   *
   * @param fileName The preferences file name
   */
  fun clearPreferences(fileName: String) {
    preferenceFiles[fileName]?.clear()
    if (isListening(fileName)) {
      queueChange(fileName, null, null)
    }
    notifyListeners(fileName, null)
  }

  /** Clears all stored preferences data and resets listening state. */
  fun clear() {
    preferenceFiles.clear()
    listenedFiles.clear()
    changeQueues.clear()
  }

  private fun notifyListeners(fileName: String, key: String?) {
    listeners.forEach { it.onPreferenceChanged(fileName, key) }
  }

  private fun queueChange(fileName: String, key: String?, value: Any?) {
    if (!recordChanges) return

    val change =
      PreferenceChange(
        fileName = fileName,
        key = key,
        newValue = value,
        type = detectType(value),
        timestamp = System.currentTimeMillis(),
        sequenceNumber = sequenceCounter.incrementAndGet(),
      )
    changeQueues.getOrPut(fileName) { CopyOnWriteArrayList() }.add(change)
  }

  /**
   * Starts listening for changes on a specific preferences file.
   *
   * @param fileName The preferences file name
   */
  fun startListening(fileName: String) {
    if (listenedFiles.contains(fileName)) return
    listenedFiles.add(fileName)
    changeQueues.getOrPut(fileName) { CopyOnWriteArrayList() }
  }

  /**
   * Stops listening for changes on a specific preferences file.
   *
   * @param fileName The preferences file name
   */
  fun stopListening(fileName: String) {
    listenedFiles.remove(fileName)
    changeQueues.remove(fileName)
  }

  /** Stops listening on all preferences files. */
  fun stopAllListening() {
    listenedFiles.clear()
    changeQueues.clear()
  }

  /**
   * Checks if the driver is actively listening for changes on a specific file.
   *
   * @param fileName The preferences file name
   * @return true if listening on this file
   */
  fun isListening(fileName: String): Boolean {
    return listenedFiles.contains(fileName)
  }

  /**
   * Returns the list of files currently being listened to.
   *
   * @return List of preference file names with active listeners
   */
  fun getListenedFiles(): List<String> {
    return listenedFiles.toList()
  }

  /**
   * Returns queued changes for a file since the given sequence number.
   *
   * @param fileName The preferences file name
   * @param sinceSequence Only return changes with sequenceNumber > sinceSequence
   * @return List of changes since the given sequence number
   */
  fun getQueuedChanges(fileName: String, sinceSequence: Long): List<PreferenceChange> {
    val queue = changeQueues[fileName] ?: return emptyList()
    val changes = queue.filter { it.sequenceNumber > sinceSequence }
    if (changes.isNotEmpty()) {
      queue.removeAll(changes.toSet())
    }
    return changes
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

  override fun getPreference(fileName: String, key: String): KeyValuePair? {
    val data = preferenceFiles[fileName] ?: throw SharedPreferencesError.FileNotFound(fileName)
    val value = data[key] ?: return null
    return KeyValuePair(key = key, value = value, type = detectType(value))
  }

  override fun setValue(fileName: String, key: String, value: Any?, type: KeyValueType) {
    val data = preferenceFiles[fileName] ?: throw SharedPreferencesError.FileNotFound(fileName)
    data[key] = value
    if (isListening(fileName)) {
      queueChange(fileName, key, value)
    }
    notifyListeners(fileName, key)
  }

  override fun removeValue(fileName: String, key: String) {
    val data = preferenceFiles[fileName] ?: throw SharedPreferencesError.FileNotFound(fileName)
    data.remove(key)
    if (isListening(fileName)) {
      queueChange(fileName, key, null)
    }
    notifyListeners(fileName, key)
  }

  override fun clear(fileName: String) {
    val data = preferenceFiles[fileName] ?: throw SharedPreferencesError.FileNotFound(fileName)
    data.clear()
    if (isListening(fileName)) {
      queueChange(fileName, null, null)
    }
    notifyListeners(fileName, null)
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
