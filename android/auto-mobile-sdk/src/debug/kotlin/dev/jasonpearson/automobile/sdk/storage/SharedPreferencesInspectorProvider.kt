package dev.jasonpearson.automobile.sdk.storage

import android.content.ContentProvider
import android.content.ContentValues
import android.database.Cursor
import android.net.Uri
import android.os.Bundle
import dev.jasonpearson.automobile.protocol.StorageChangeEvent
import dev.jasonpearson.automobile.protocol.StorageEntry
import dev.jasonpearson.automobile.protocol.StorageFileInfo
import dev.jasonpearson.automobile.protocol.StorageProtocolSerializer
import dev.jasonpearson.automobile.protocol.StorageResponse

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
        val responseJson = handleCheckAvailability()
        result.putBoolean("success", true)
        result.putString("result", responseJson)
        return result
      }

      val driver = SharedPreferencesInspector.getDriver()
      val responseJson =
        when (method) {
          "listFiles" -> handleListFiles(driver)
          "getPreferences" -> handleGetPreferences(driver, extras)
          "getPreference" -> handleGetPreference(driver, extras)
          "setValue" -> handleSetValue(driver, extras)
          "removeValue" -> handleRemoveValue(driver, extras)
          "clearFile" -> handleClearFile(driver, extras)
          "subscribeToFile" -> handleSubscribeToFile(driver, extras)
          "unsubscribeFromFile" -> handleUnsubscribeFromFile(driver, extras)
          "getChanges" -> handleGetChanges(driver, extras)
          "getListenedFiles" -> handleGetListenedFiles(driver)
          else -> throw IllegalArgumentException("Unknown method: $method")
        }
      result.putBoolean("success", true)
      result.putString("result", responseJson)
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

  private fun handleListFiles(driver: SharedPreferencesDriver): String {
    val files = driver.getPreferenceFiles()
    val protocolFiles = files.map { file ->
      StorageFileInfo(
        name = file.name,
        path = file.path,
        entryCount = file.entryCount,
      )
    }
    val response = StorageResponse.FileList(files = protocolFiles)
    return StorageProtocolSerializer.responseToJson(response)
  }

  private fun handleGetPreferences(driver: SharedPreferencesDriver, extras: Bundle?): String {
    val fileName =
      extras?.getString("fileName") ?: throw IllegalArgumentException("fileName required")

    val entries = driver.getPreferences(fileName)
    val protocolEntries = entries.map { entry ->
      StorageEntry(
        key = entry.key,
        value = serializeValue(entry.value, entry.type),
        type = entry.type.name,
      )
    }

    // Get file descriptor for response
    val files = driver.getPreferenceFiles()
    val fileDescriptor = files.find { it.name == fileName }
    val protocolFile = fileDescriptor?.let {
      StorageFileInfo(
        name = it.name,
        path = it.path,
        entryCount = it.entryCount,
      )
    }

    val response = StorageResponse.Preferences(
      file = protocolFile,
      entries = protocolEntries,
    )
    return StorageProtocolSerializer.responseToJson(response)
  }

  private fun serializeValue(value: Any?, type: KeyValueType): String? {
    return when {
      value == null -> null
      type == KeyValueType.STRING_SET -> {
        @Suppress("UNCHECKED_CAST")
        val set = value as? Set<String> ?: return null
        // Serialize as JSON array string
        "[" + set.joinToString(",") { "\"$it\"" } + "]"
      }
      else -> value.toString()
    }
  }

  /**
   * Handles getPreference - returns a single preference value by key.
   *
   * @param extras Must contain "fileName" and "key" strings
   * @return JSON with the preference entry or null if not found
   */
  private fun handleGetPreference(driver: SharedPreferencesDriver, extras: Bundle?): String {
    val fileName =
      extras?.getString("fileName") ?: throw IllegalArgumentException("fileName required")
    val key =
      extras.getString("key") ?: throw IllegalArgumentException("key required")

    val entry = driver.getPreference(fileName, key)
    val protocolEntry = entry?.let {
      StorageEntry(
        key = it.key,
        value = serializeValue(it.value, it.type),
        type = it.type.name,
      )
    }

    val response = StorageResponse.SinglePreference(
      fileName = fileName,
      key = key,
      entry = protocolEntry,
    )
    return StorageProtocolSerializer.responseToJson(response)
  }

  /**
   * Handles setValue - sets a preference value.
   *
   * @param extras Must contain "fileName", "key", "value", and "type" strings
   * @return JSON with success status
   */
  private fun handleSetValue(driver: SharedPreferencesDriver, extras: Bundle?): String {
    val fileName =
      extras?.getString("fileName") ?: throw IllegalArgumentException("fileName required")
    val key =
      extras.getString("key") ?: throw IllegalArgumentException("key required")
    val valueStr = extras.getString("value")
    val typeStr =
      extras.getString("type") ?: throw IllegalArgumentException("type required")

    val type = try {
      KeyValueType.valueOf(typeStr)
    } catch (e: IllegalArgumentException) {
      throw IllegalArgumentException("Invalid type: $typeStr")
    }

    val value = deserializeValue(valueStr, type)
    driver.setValue(fileName, key, value, type)

    val response = StorageResponse.OperationSuccess(
      operation = "setValue",
      fileName = fileName,
      key = key,
    )
    return StorageProtocolSerializer.responseToJson(response)
  }

  /**
   * Handles removeValue - removes a preference by key.
   *
   * @param extras Must contain "fileName" and "key" strings
   * @return JSON with success status
   */
  private fun handleRemoveValue(driver: SharedPreferencesDriver, extras: Bundle?): String {
    val fileName =
      extras?.getString("fileName") ?: throw IllegalArgumentException("fileName required")
    val key =
      extras.getString("key") ?: throw IllegalArgumentException("key required")

    driver.removeValue(fileName, key)

    val response = StorageResponse.OperationSuccess(
      operation = "removeValue",
      fileName = fileName,
      key = key,
    )
    return StorageProtocolSerializer.responseToJson(response)
  }

  /**
   * Handles clearFile - clears all preferences in a file.
   *
   * @param extras Must contain "fileName" string
   * @return JSON with success status
   */
  private fun handleClearFile(driver: SharedPreferencesDriver, extras: Bundle?): String {
    val fileName =
      extras?.getString("fileName") ?: throw IllegalArgumentException("fileName required")

    driver.clear(fileName)

    val response = StorageResponse.OperationSuccess(
      operation = "clearFile",
      fileName = fileName,
      key = null,
    )
    return StorageProtocolSerializer.responseToJson(response)
  }

  /**
   * Deserializes a string value to the appropriate type.
   */
  private fun deserializeValue(valueStr: String?, type: KeyValueType): Any? {
    if (valueStr == null) return null

    return when (type) {
      KeyValueType.STRING -> valueStr
      KeyValueType.INT -> valueStr.toIntOrNull() ?: throw IllegalArgumentException("Invalid INT value: $valueStr")
      KeyValueType.LONG -> valueStr.toLongOrNull() ?: throw IllegalArgumentException("Invalid LONG value: $valueStr")
      KeyValueType.FLOAT -> valueStr.toFloatOrNull() ?: throw IllegalArgumentException("Invalid FLOAT value: $valueStr")
      KeyValueType.BOOLEAN -> valueStr.toBooleanStrictOrNull() ?: throw IllegalArgumentException("Invalid BOOLEAN value: $valueStr")
      KeyValueType.STRING_SET -> {
        // Parse JSON array format: ["a","b","c"]
        val trimmed = valueStr.trim()
        if (!trimmed.startsWith("[") || !trimmed.endsWith("]")) {
          throw IllegalArgumentException("STRING_SET must be a JSON array: $valueStr")
        }
        val inner = trimmed.substring(1, trimmed.length - 1)
        if (inner.isBlank()) {
          emptySet<String>()
        } else {
          inner.split(",")
            .map { it.trim().removeSurrounding("\"") }
            .toSet()
        }
      }
      KeyValueType.UNKNOWN -> throw IllegalArgumentException("Cannot deserialize UNKNOWN type")
    }
  }

  /**
   * Handles checkAvailability - returns SDK availability and version.
   *
   * This method works even when the driver isn't initialized, returning:
   * - available: true (always true when inspection is enabled)
   * - version: API version number for compatibility checking
   */
  private fun handleCheckAvailability(): String {
    val response = StorageResponse.Availability(
      available = true,
      version = 1,
    )
    return StorageProtocolSerializer.responseToJson(response)
  }

  /**
   * Handles subscribeToFile - starts listening for changes on a preference file.
   *
   * @param extras Must contain "fileName" string
   * @return JSON with success status and subscription info
   */
  private fun handleSubscribeToFile(driver: SharedPreferencesDriver, extras: Bundle?): String {
    val fileName =
      extras?.getString("fileName") ?: throw IllegalArgumentException("fileName required")

    val driverImpl =
      driver as? SharedPreferencesDriverImpl
        ?: throw IllegalStateException("Driver must be SharedPreferencesDriverImpl")

    driverImpl.startListening(fileName)

    val response = StorageResponse.SubscriptionResult(
      fileName = fileName,
      subscribed = true,
    )
    return StorageProtocolSerializer.responseToJson(response)
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
  ): String {
    val fileName =
      extras?.getString("fileName") ?: throw IllegalArgumentException("fileName required")

    val driverImpl =
      driver as? SharedPreferencesDriverImpl
        ?: throw IllegalStateException("Driver must be SharedPreferencesDriverImpl")

    driverImpl.stopListening(fileName)

    val response = StorageResponse.SubscriptionResult(
      fileName = fileName,
      subscribed = false,
    )
    return StorageProtocolSerializer.responseToJson(response)
  }

  /**
   * Handles getChanges - returns queued changes for a file since a sequence number.
   *
   * @param extras Must contain "fileName" string, optionally "sinceSequence" long
   * @return JSON with array of changes
   */
  private fun handleGetChanges(driver: SharedPreferencesDriver, extras: Bundle?): String {
    val fileName =
      extras?.getString("fileName") ?: throw IllegalArgumentException("fileName required")
    val sinceSequence = extras?.getLong("sinceSequence", 0L) ?: 0L

    val driverImpl =
      driver as? SharedPreferencesDriverImpl
        ?: throw IllegalStateException("Driver must be SharedPreferencesDriverImpl")

    val changes = driverImpl.getQueuedChanges(fileName, sinceSequence)
    val protocolChanges = changes.map { change ->
      StorageChangeEvent(
        fileName = change.fileName,
        key = change.key,
        value = serializeValue(change.newValue, change.type),
        type = change.type.name,
        timestamp = change.timestamp,
        sequenceNumber = change.sequenceNumber,
      )
    }

    val response = StorageResponse.Changes(
      fileName = fileName,
      changes = protocolChanges,
    )
    return StorageProtocolSerializer.responseToJson(response)
  }

  /**
   * Handles getListenedFiles - returns list of files currently being monitored.
   *
   * @return JSON with array of file names
   */
  private fun handleGetListenedFiles(driver: SharedPreferencesDriver): String {
    val driverImpl =
      driver as? SharedPreferencesDriverImpl
        ?: throw IllegalStateException("Driver must be SharedPreferencesDriverImpl")

    val files = driverImpl.getListenedFiles()

    val response = StorageResponse.ListenedFiles(files = files)
    return StorageProtocolSerializer.responseToJson(response)
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
