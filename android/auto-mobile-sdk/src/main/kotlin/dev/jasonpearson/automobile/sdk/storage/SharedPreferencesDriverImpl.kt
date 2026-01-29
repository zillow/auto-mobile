package dev.jasonpearson.automobile.sdk.storage

import android.content.Context
import android.content.SharedPreferences
import java.io.File
import java.util.concurrent.CopyOnWriteArrayList

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

  private val listeners = CopyOnWriteArrayList<OnPreferenceChangeListener>()
  private val sharedPrefsListeners =
    mutableMapOf<String, SharedPreferences.OnSharedPreferenceChangeListener>()

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
   * @param fileName The preferences file name
   */
  internal fun startListening(fileName: String) {
    if (sharedPrefsListeners.containsKey(fileName)) return

    val prefs = context.getSharedPreferences(fileName, Context.MODE_PRIVATE)
    val sharedPrefsListener =
      SharedPreferences.OnSharedPreferenceChangeListener { _, key ->
        listeners.forEach { it.onPreferenceChanged(fileName, key) }
      }

    prefs.registerOnSharedPreferenceChangeListener(sharedPrefsListener)
    sharedPrefsListeners[fileName] = sharedPrefsListener
  }

  /**
   * Stops listening for changes on a specific preferences file.
   *
   * @param fileName The preferences file name
   */
  internal fun stopListening(fileName: String) {
    sharedPrefsListeners.remove(fileName)?.let { listener ->
      val prefs = context.getSharedPreferences(fileName, Context.MODE_PRIVATE)
      prefs.unregisterOnSharedPreferenceChangeListener(listener)
    }
  }

  /** Stops listening on all preferences files. */
  internal fun stopAllListening() {
    sharedPrefsListeners.keys.toList().forEach { stopListening(it) }
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
