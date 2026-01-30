package dev.jasonpearson.automobile.sdk.storage

import android.content.Context
import android.content.SharedPreferences
import android.net.Uri
import java.io.File
import java.util.concurrent.CopyOnWriteArrayList
import java.util.concurrent.atomic.AtomicLong

/**
 * Android implementation of SharedPreferencesDriver that uses the SharedPreferences API.
 *
 * @param context Application context
 * @param fileSystemOperations File system abstraction for listing preference files
 */
class SharedPreferencesDriverImpl(
  private val context: Context,
  private val fileSystemOperations: FileSystemOperations = RealFileSystemOperations(),
) : SharedPreferencesDriver {

  companion object {
    /** URI authority suffix for change notifications. */
    const val CHANGES_AUTHORITY_SUFFIX = ".automobile.sharedprefs"

    /** URI path for change notifications. */
    const val CHANGES_PATH = "changes"
  }

  private val listeners = CopyOnWriteArrayList<OnPreferenceChangeListener>()
  private val sharedPrefsListeners =
    mutableMapOf<String, SharedPreferences.OnSharedPreferenceChangeListener>()

  /** Per-file change queues for push-based notifications. */
  private val changeQueues = mutableMapOf<String, CopyOnWriteArrayList<PreferenceChange>>()

  /** Monotonically increasing sequence counter for ordering changes. */
  private val sequenceCounter = AtomicLong(0)

  override fun getPreferenceFiles(): List<PreferenceFileDescriptor> {
    val sharedPrefsDir = File(context.applicationInfo.dataDir, "shared_prefs")
    val files = fileSystemOperations.listFiles(sharedPrefsDir)

    return files
      .filter { it.name.endsWith(".xml") }
      .map { file ->
        val name = file.name.removeSuffix(".xml")
        val prefs = context.getSharedPreferences(name, Context.MODE_PRIVATE)
        PreferenceFileDescriptor(name = name, path = file.absolutePath, entryCount = prefs.all.size)
      }
  }

  override fun getPreferences(fileName: String): List<KeyValuePair> {
    // Verify the file exists
    val sharedPrefsDir = File(context.applicationInfo.dataDir, "shared_prefs")
    val prefFile = File(sharedPrefsDir, "$fileName.xml")

    if (!fileSystemOperations.exists(prefFile)) {
      throw SharedPreferencesError.FileNotFound(fileName)
    }

    val prefs = context.getSharedPreferences(fileName, Context.MODE_PRIVATE)
    return prefs.all.map { (key, value) ->
      KeyValuePair(key = key, value = value, type = detectType(value))
    }
  }

  override fun registerOnChangeListener(listener: OnPreferenceChangeListener) {
    listeners.add(listener)
  }

  override fun unregisterOnChangeListener(listener: OnPreferenceChangeListener) {
    listeners.remove(listener)
  }

  /**
   * Starts listening for changes on a specific preferences file.
   *
   * Initializes a change queue for the file and registers a listener that:
   * 1. Captures new values and queues changes with sequence numbers
   * 2. Notifies registered listeners
   * 3. Signals observers via ContentResolver.notifyChange()
   *
   * @param fileName The preferences file name
   */
  internal fun startListening(fileName: String) {
    if (sharedPrefsListeners.containsKey(fileName)) return

    // Initialize change queue for this file
    changeQueues.getOrPut(fileName) { CopyOnWriteArrayList() }

    val prefs = context.getSharedPreferences(fileName, Context.MODE_PRIVATE)
    val sharedPrefsListener =
      SharedPreferences.OnSharedPreferenceChangeListener { sharedPrefs, key ->
        // Capture the new value
        val newValue = if (key != null) sharedPrefs.all[key] else null
        val type = detectType(newValue)
        val timestamp = System.currentTimeMillis()
        val sequence = sequenceCounter.incrementAndGet()

        // Queue the change
        val change = PreferenceChange(fileName, key, newValue, type, timestamp, sequence)
        changeQueues[fileName]?.add(change)

        // Notify registered listeners
        listeners.forEach { it.onPreferenceChanged(fileName, key) }

        // Signal ContentObserver watchers
        notifyChangesAvailable()
      }

    prefs.registerOnSharedPreferenceChangeListener(sharedPrefsListener)
    sharedPrefsListeners[fileName] = sharedPrefsListener
  }

  /**
   * Stops listening for changes on a specific preferences file.
   *
   * Also clears any queued changes for this file.
   *
   * @param fileName The preferences file name
   */
  internal fun stopListening(fileName: String) {
    sharedPrefsListeners.remove(fileName)?.let { listener ->
      val prefs = context.getSharedPreferences(fileName, Context.MODE_PRIVATE)
      prefs.unregisterOnSharedPreferenceChangeListener(listener)
    }
    changeQueues.remove(fileName)
  }

  /** Stops listening on all preferences files. */
  internal fun stopAllListening() {
    sharedPrefsListeners.keys.toList().forEach { stopListening(it) }
  }

  /**
   * Checks if the driver is actively listening for changes on a specific file.
   *
   * @param fileName The preferences file name
   * @return true if listening on this file
   */
  internal fun isListening(fileName: String): Boolean {
    return sharedPrefsListeners.containsKey(fileName)
  }

  /**
   * Returns the list of files currently being listened to.
   *
   * @return List of preference file names with active listeners
   */
  internal fun getListenedFiles(): List<String> {
    return sharedPrefsListeners.keys.toList()
  }

  /**
   * Returns queued changes for a file since the given sequence number.
   *
   * Changes are returned and removed from the queue. Use sinceSequence=0 to get all changes.
   *
   * @param fileName The preferences file name
   * @param sinceSequence Only return changes with sequenceNumber > sinceSequence
   * @return List of changes since the given sequence number
   */
  internal fun getQueuedChanges(fileName: String, sinceSequence: Long): List<PreferenceChange> {
    val queue = changeQueues[fileName] ?: return emptyList()

    // Find changes after the given sequence
    val changes = queue.filter { it.sequenceNumber > sinceSequence }

    // Remove the returned changes from the queue
    if (changes.isNotEmpty()) {
      queue.removeAll(changes.toSet())
    }

    return changes
  }

  /** Notifies observers that changes are available via ContentResolver. */
  private fun notifyChangesAvailable() {
    try {
      val authority = context.packageName + CHANGES_AUTHORITY_SUFFIX
      val uri = Uri.parse("content://$authority/$CHANGES_PATH")
      context.contentResolver.notifyChange(uri, null)
    } catch (e: Exception) {
      // Log but don't fail if notification fails
      android.util.Log.w("SharedPreferencesDriver", "Failed to notify change", e)
    }
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
