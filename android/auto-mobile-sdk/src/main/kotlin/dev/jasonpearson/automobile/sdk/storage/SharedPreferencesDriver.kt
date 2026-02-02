package dev.jasonpearson.automobile.sdk.storage

import java.io.File

/**
 * Interface for SharedPreferences operations. Implementations provide access to app preferences for
 * inspection.
 */
interface SharedPreferencesDriver {
  /** Returns a list of all accessible SharedPreferences files. */
  fun getPreferenceFiles(): List<PreferenceFileDescriptor>

  /**
   * Returns all key-value pairs from a preferences file.
   *
   * @param fileName The name of the preferences file (without .xml extension)
   * @throws SharedPreferencesError.FileNotFound if the file doesn't exist
   */
  fun getPreferences(fileName: String): List<KeyValuePair>

  /**
   * Registers a listener to be notified when preferences change.
   *
   * @param listener The listener to register
   */
  fun registerOnChangeListener(listener: OnPreferenceChangeListener)

  /**
   * Unregisters a previously registered change listener.
   *
   * @param listener The listener to unregister
   */
  fun unregisterOnChangeListener(listener: OnPreferenceChangeListener)

  /**
   * Gets a single preference value by key.
   *
   * @param fileName The name of the preferences file (without .xml extension)
   * @param key The key to retrieve
   * @return The key-value pair if found, null if key doesn't exist
   * @throws SharedPreferencesError.FileNotFound if the file doesn't exist
   */
  fun getPreference(fileName: String, key: String): KeyValuePair?

  /**
   * Sets a preference value.
   *
   * @param fileName The name of the preferences file (without .xml extension)
   * @param key The key to set
   * @param value The value to set (String, Int, Long, Float, Boolean, or Set<String>)
   * @param type The type of the value
   * @throws SharedPreferencesError.FileNotFound if the file doesn't exist
   * @throws SharedPreferencesError.InvalidType if the type doesn't match the value
   */
  fun setValue(fileName: String, key: String, value: Any?, type: KeyValueType)

  /**
   * Removes a preference value.
   *
   * @param fileName The name of the preferences file (without .xml extension)
   * @param key The key to remove
   * @throws SharedPreferencesError.FileNotFound if the file doesn't exist
   */
  fun removeValue(fileName: String, key: String)

  /**
   * Clears all preferences in a file.
   *
   * @param fileName The name of the preferences file (without .xml extension)
   * @throws SharedPreferencesError.FileNotFound if the file doesn't exist
   */
  fun clear(fileName: String)
}

/** Abstraction for file system operations to enable testing. */
interface FileSystemOperations {
  /**
   * Lists files in a directory.
   *
   * @param directory The directory to list
   * @return List of files in the directory, or empty list if directory doesn't exist
   */
  fun listFiles(directory: File): List<File>

  /**
   * Checks if a file exists.
   *
   * @param file The file to check
   * @return true if the file exists
   */
  fun exists(file: File): Boolean
}

/** Real implementation of FileSystemOperations that delegates to the file system. */
class RealFileSystemOperations : FileSystemOperations {
  override fun listFiles(directory: File): List<File> {
    return directory.listFiles()?.toList() ?: emptyList()
  }

  override fun exists(file: File): Boolean {
    return file.exists()
  }
}
