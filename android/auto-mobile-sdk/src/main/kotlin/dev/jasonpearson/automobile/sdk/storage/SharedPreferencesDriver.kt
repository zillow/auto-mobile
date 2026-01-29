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
