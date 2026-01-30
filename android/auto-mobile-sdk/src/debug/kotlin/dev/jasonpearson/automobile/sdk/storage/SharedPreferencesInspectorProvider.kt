package dev.jasonpearson.automobile.sdk.storage

import android.content.ContentProvider
import android.content.ContentValues
import android.database.Cursor
import android.net.Uri
import android.os.Bundle
import org.json.JSONArray
import org.json.JSONObject

/**
 * ContentProvider for SharedPreferences inspection via ADB.
 *
 * This provider is only included in debug builds and allows SharedPreferences inspection via `adb
 * shell content call` commands.
 *
 * Example usage:
 * ```bash
 * adb shell content call --uri content://com.example.app.automobile.sharedprefs \
 *     --method listFiles
 *
 * adb shell content call --uri content://com.example.app.automobile.sharedprefs \
 *     --method getPreferences --extra fileName:s:auth_prefs
 * ```
 */
class SharedPreferencesInspectorProvider : ContentProvider() {

  override fun onCreate(): Boolean {
    // Always return true - actual initialization happens in call()
    return true
  }

  override fun call(method: String, arg: String?, extras: Bundle?): Bundle {
    val result = Bundle()

    // Check if inspection is enabled
    if (!SharedPreferencesInspector.isEnabled()) {
      result.putBoolean("success", false)
      result.putString("errorType", "DISABLED")
      result.putString("error", "SharedPreferences inspection is disabled")
      return result
    }

    try {
      // checkAvailability doesn't require the driver to be initialized
      if (method == "checkAvailability") {
        val response = handleCheckAvailability()
        result.putBoolean("success", true)
        result.putString("result", response.toString())
        return result
      }

      val driver = SharedPreferencesInspector.getDriver()
      val response =
        when (method) {
          "listFiles" -> handleListFiles(driver)
          "getPreferences" -> handleGetPreferences(driver, extras)
          "subscribeToFile" -> handleSubscribeToFile(driver, extras)
          "unsubscribeFromFile" -> handleUnsubscribeFromFile(driver, extras)
          "getChanges" -> handleGetChanges(driver, extras)
          "getListenedFiles" -> handleGetListenedFiles(driver)
          else -> throw IllegalArgumentException("Unknown method: $method")
        }
      result.putBoolean("success", true)
      result.putString("result", response.toString())
    } catch (e: SharedPreferencesError) {
      result.putBoolean("success", false)
      result.putString("errorType", e::class.simpleName ?: "UNKNOWN")
      result.putString("error", e.message ?: "Unknown error")
    } catch (e: IllegalArgumentException) {
      result.putBoolean("success", false)
      result.putString("errorType", "INVALID_ARGUMENT")
      result.putString("error", e.message ?: "Invalid argument")
    } catch (e: Exception) {
      result.putBoolean("success", false)
      result.putString("errorType", e::class.simpleName ?: "UNKNOWN")
      result.putString("error", e.message ?: "Unknown error")
    }

    return result
  }

  private fun handleListFiles(driver: SharedPreferencesDriver): JSONObject {
    val files = driver.getPreferenceFiles()
    val jsonArray = JSONArray()

    files.forEach { file ->
      jsonArray.put(
        JSONObject().apply {
          put("name", file.name)
          put("path", file.path)
          put("entryCount", file.entryCount)
        }
      )
    }

    return JSONObject().put("files", jsonArray)
  }

  private fun handleGetPreferences(driver: SharedPreferencesDriver, extras: Bundle?): JSONObject {
    val fileName =
      extras?.getString("fileName") ?: throw IllegalArgumentException("fileName required")

    val entries = driver.getPreferences(fileName)
    val entriesArray = JSONArray()

    entries.forEach { entry ->
      entriesArray.put(
        JSONObject().apply {
          put("key", entry.key)
          put("value", serializeValue(entry.value, entry.type))
          put("type", entry.type.name)
        }
      )
    }

    // Get file descriptor for response
    val files = driver.getPreferenceFiles()
    val fileDescriptor = files.find { it.name == fileName }

    return JSONObject().apply {
      if (fileDescriptor != null) {
        put(
          "file",
          JSONObject().apply {
            put("name", fileDescriptor.name)
            put("path", fileDescriptor.path)
            put("entryCount", fileDescriptor.entryCount)
          },
        )
      }
      put("entries", entriesArray)
    }
  }

  private fun serializeValue(value: Any?, type: KeyValueType): Any? {
    return when (type) {
      KeyValueType.STRING_SET -> {
        val jsonArray = JSONArray()
        @Suppress("UNCHECKED_CAST") (value as? Set<String>)?.forEach { jsonArray.put(it) }
        jsonArray
      }
      else -> value ?: JSONObject.NULL
    }
  }

  /**
   * Handles checkAvailability - returns SDK availability and version.
   *
   * This method works even when the driver isn't initialized, returning:
   * - available: true (always true when inspection is enabled)
   * - version: API version number for compatibility checking
   */
  private fun handleCheckAvailability(): JSONObject {
    return JSONObject().apply {
      put("available", true)
      put("version", 1)
    }
  }

  /**
   * Handles subscribeToFile - starts listening for changes on a preference file.
   *
   * @param extras Must contain "fileName" string
   * @return JSON with success status and subscription info
   */
  private fun handleSubscribeToFile(driver: SharedPreferencesDriver, extras: Bundle?): JSONObject {
    val fileName =
      extras?.getString("fileName") ?: throw IllegalArgumentException("fileName required")

    val driverImpl =
      driver as? SharedPreferencesDriverImpl
        ?: throw IllegalStateException("Driver must be SharedPreferencesDriverImpl")

    driverImpl.startListening(fileName)

    return JSONObject().apply {
      put("fileName", fileName)
      put("subscribed", true)
    }
  }

  /**
   * Handles unsubscribeFromFile - stops listening for changes on a preference file.
   *
   * @param extras Must contain "fileName" string
   * @return JSON with success status
   */
  private fun handleUnsubscribeFromFile(
    driver: SharedPreferencesDriver,
    extras: Bundle?,
  ): JSONObject {
    val fileName =
      extras?.getString("fileName") ?: throw IllegalArgumentException("fileName required")

    val driverImpl =
      driver as? SharedPreferencesDriverImpl
        ?: throw IllegalStateException("Driver must be SharedPreferencesDriverImpl")

    driverImpl.stopListening(fileName)

    return JSONObject().apply {
      put("fileName", fileName)
      put("subscribed", false)
    }
  }

  /**
   * Handles getChanges - returns queued changes for a file since a sequence number.
   *
   * @param extras Must contain "fileName" string, optionally "sinceSequence" long
   * @return JSON with array of changes
   */
  private fun handleGetChanges(driver: SharedPreferencesDriver, extras: Bundle?): JSONObject {
    val fileName =
      extras?.getString("fileName") ?: throw IllegalArgumentException("fileName required")
    val sinceSequence = extras?.getLong("sinceSequence", 0L) ?: 0L

    val driverImpl =
      driver as? SharedPreferencesDriverImpl
        ?: throw IllegalStateException("Driver must be SharedPreferencesDriverImpl")

    val changes = driverImpl.getQueuedChanges(fileName, sinceSequence)
    val changesArray = JSONArray()

    changes.forEach { change ->
      changesArray.put(
        JSONObject().apply {
          put("fileName", change.fileName)
          if (change.key != null) {
            put("key", change.key)
          } else {
            put("key", JSONObject.NULL)
          }
          put("value", serializeValue(change.newValue, change.type))
          put("type", change.type.name)
          put("timestamp", change.timestamp)
          put("sequenceNumber", change.sequenceNumber)
        }
      )
    }

    return JSONObject().apply {
      put("fileName", fileName)
      put("changes", changesArray)
    }
  }

  /**
   * Handles getListenedFiles - returns list of files currently being monitored.
   *
   * @return JSON with array of file names
   */
  private fun handleGetListenedFiles(driver: SharedPreferencesDriver): JSONObject {
    val driverImpl =
      driver as? SharedPreferencesDriverImpl
        ?: throw IllegalStateException("Driver must be SharedPreferencesDriverImpl")

    val files = driverImpl.getListenedFiles()
    val filesArray = JSONArray()
    files.forEach { filesArray.put(it) }

    return JSONObject().apply { put("files", filesArray) }
  }

  // Required ContentProvider methods - not used for content call
  override fun query(
    uri: Uri,
    projection: Array<String>?,
    selection: String?,
    selectionArgs: Array<String>?,
    sortOrder: String?,
  ): Cursor? = null

  override fun getType(uri: Uri): String? = null

  override fun insert(uri: Uri, values: ContentValues?): Uri? = null

  override fun delete(uri: Uri, selection: String?, selectionArgs: Array<String>?): Int = 0

  override fun update(
    uri: Uri,
    values: ContentValues?,
    selection: String?,
    selectionArgs: Array<String>?,
  ): Int = 0
}
