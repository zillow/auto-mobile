package dev.jasonpearson.automobile.sdk.storage

/** Describes a SharedPreferences file. */
data class PreferenceFileDescriptor(
  /** Display name of the preferences file (without .xml extension). */
  val name: String,
  /** Absolute path to the preferences file. */
  val path: String,
  /** Number of key-value entries in the file. */
  val entryCount: Int,
)

/** A key-value pair from SharedPreferences. */
data class KeyValuePair(
  /** The preference key. */
  val key: String,
  /** The preference value. */
  val value: Any?,
  /** The type of the value. */
  val type: KeyValueType,
)

/** Types of values that can be stored in SharedPreferences. */
enum class KeyValueType {
  STRING,
  INT,
  LONG,
  FLOAT,
  BOOLEAN,
  STRING_SET,
  UNKNOWN,
}

/** Listener for SharedPreferences changes. */
fun interface OnPreferenceChangeListener {
  /**
   * Called when a preference changes.
   *
   * @param fileName The name of the preferences file that changed
   * @param key The key that changed, or null if multiple keys changed or file was cleared
   */
  fun onPreferenceChanged(fileName: String, key: String?)
}
