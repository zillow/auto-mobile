package dev.jasonpearson.automobile.sdk.storage

/** Sealed class representing SharedPreferences inspection errors. */
sealed class SharedPreferencesError(message: String) : Exception(message) {
  /** Preferences file was not found. */
  class FileNotFound(fileName: String) :
    SharedPreferencesError("Preferences file not found: $fileName")

  /** Path is outside the app's data directory. */
  class InvalidPath(path: String) : SharedPreferencesError("Invalid preferences path: $path")

  /** SharedPreferencesInspector was not initialized with a context. */
  class NotInitialized : SharedPreferencesError("SharedPreferencesInspector not initialized")

  /** Error reading preferences. */
  class ReadError(cause: String) : SharedPreferencesError("Read error: $cause")
}
