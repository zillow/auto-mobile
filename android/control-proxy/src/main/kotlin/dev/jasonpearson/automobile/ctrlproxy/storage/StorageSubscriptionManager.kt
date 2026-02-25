package dev.jasonpearson.automobile.ctrlproxy.storage

import android.content.Context
import android.database.ContentObserver
import android.net.Uri
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.util.Log
import dev.jasonpearson.automobile.protocol.StorageProtocolSerializer
import dev.jasonpearson.automobile.protocol.StorageResponse
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.asSharedFlow

/**
 * Manages subscriptions to SharedPreferences changes across multiple target apps.
 *
 * Uses ContentProvider.call() to communicate with SDK-instrumented apps and ContentObserver to
 * receive push notifications when changes occur.
 */
class StorageSubscriptionManager(
    private val context: Context,
) {

  companion object {
    private const val TAG = "StorageSubscriptionMgr"
    private const val AUTHORITY_SUFFIX = ".automobile.sharedprefs"
    private const val CHANGES_PATH = "changes"
  }

  /** State for a single subscription. */
  private data class SubscriptionState(
      val subscription: StorageSubscription,
      var lastSequence: Long = 0,
  )

  /** State for a package being observed. */
  private data class PackageObserverState(
      val observer: ContentObserver,
      val subscriptions: MutableSet<String> = mutableSetOf(), // file names
  )

  private val subscriptions = mutableMapOf<String, SubscriptionState>() // subscriptionId -> state
  private val packageObservers = mutableMapOf<String, PackageObserverState>() // packageName -> state

  private val _changeEvents = MutableSharedFlow<PreferenceChangeEvent>(extraBufferCapacity = 64)
  val changeEvents: SharedFlow<PreferenceChangeEvent> = _changeEvents.asSharedFlow()

  private val handler = Handler(Looper.getMainLooper())

  /**
   * Checks if the SDK is available and inspection is enabled for a package.
   *
   * @param packageName The target app package name
   * @return Result with availability info or error
   */
  fun checkSdkAvailability(packageName: String): Result<SdkAvailabilityInfo> {
    return try {
      val authority = packageName + AUTHORITY_SUFFIX
      val uri = Uri.parse("content://$authority")
      val result = context.contentResolver.call(uri, "checkAvailability", null, null)

      if (result == null) {
        Result.failure(StorageError.SdkNotInstalled(packageName))
      } else if (!result.getBoolean("success", false)) {
        val error = result.getString("error") ?: "Unknown error"
        val errorType = result.getString("errorType") ?: "UNKNOWN"
        if (errorType == "DISABLED") {
          Result.failure(StorageError.InspectionDisabled(packageName))
        } else {
          Result.failure(StorageError.SdkError(error))
        }
      } else {
        val responseJson = result.getString("result") ?: "{}"
        val response = StorageProtocolSerializer.responseFromJson(responseJson)
        when (response) {
          is StorageResponse.Availability -> Result.success(
            SdkAvailabilityInfo(
              available = response.available,
              version = response.version,
            )
          )
          else -> Result.failure(StorageError.SdkError("Unexpected response type"))
        }
      }
    } catch (e: SecurityException) {
      Result.failure(StorageError.SdkNotInstalled(packageName))
    } catch (e: IllegalArgumentException) {
      Result.failure(StorageError.SdkNotInstalled(packageName))
    } catch (e: Exception) {
      Log.e(TAG, "Error checking SDK availability for $packageName", e)
      Result.failure(StorageError.SdkError(e.message ?: "Unknown error"))
    }
  }

  /**
   * Lists all SharedPreferences files in a package.
   *
   * @param packageName The target app package name
   * @return Result with list of preference file info or error
   */
  fun listPreferenceFiles(packageName: String): Result<List<PreferenceFileInfo>> {
    Log.d(TAG, "listPreferenceFiles: packageName=$packageName")
    return try {
      val authority = packageName + AUTHORITY_SUFFIX
      val uri = Uri.parse("content://$authority")
      Log.d(TAG, "listPreferenceFiles: calling contentResolver.call with authority=$authority")
      val result = context.contentResolver.call(uri, "listFiles", null, null)
      Log.d(TAG, "listPreferenceFiles: contentResolver.call returned, result=$result")

      if (result == null) {
        Log.w(TAG, "listPreferenceFiles: result is null (SDK not installed)")
        Result.failure(StorageError.SdkNotInstalled(packageName))
      } else if (!result.getBoolean("success", false)) {
        val error = result.getString("error") ?: "Unknown error"
        Log.w(TAG, "listPreferenceFiles: result.success=false, error=$error")
        Result.failure(StorageError.SdkError(error))
      } else {
        val responseJson = result.getString("result") ?: "{}"
        Log.d(TAG, "listPreferenceFiles: responseJson=$responseJson")
        val response = StorageProtocolSerializer.responseFromJson(responseJson)
        Log.d(TAG, "listPreferenceFiles: parsed response type=${response?.let { it::class.simpleName } ?: "null"}")
        when (response) {
          is StorageResponse.FileList -> {
            val files = response.files.map { file ->
              PreferenceFileInfo(
                name = file.name,
                path = file.path,
                entryCount = file.entryCount,
              )
            }
            Log.d(TAG, "listPreferenceFiles: returning ${files.size} files")
            Result.success(files)
          }
          else -> {
            Log.w(TAG, "listPreferenceFiles: unexpected response type: ${response?.let { it::class.simpleName } ?: "null"}")
            Result.failure(StorageError.SdkError("Unexpected response type"))
          }
        }
      }
    } catch (e: SecurityException) {
      Log.e(TAG, "listPreferenceFiles: SecurityException (SDK not installed)", e)
      Result.failure(StorageError.SdkNotInstalled(packageName))
    } catch (e: Exception) {
      Log.e(TAG, "Error listing preference files for $packageName", e)
      Result.failure(StorageError.SdkError(e.message ?: "Unknown error"))
    }
  }

  /**
   * Gets all preferences from a file.
   *
   * @param packageName The target app package name
   * @param fileName The preferences file name
   * @return Result with list of preference entries or error
   */
  fun getPreferences(packageName: String, fileName: String): Result<List<PreferenceEntry>> {
    return try {
      val authority = packageName + AUTHORITY_SUFFIX
      val uri = Uri.parse("content://$authority")
      val extras = Bundle().apply { putString("fileName", fileName) }
      val result = context.contentResolver.call(uri, "getPreferences", null, extras)

      if (result == null) {
        Result.failure(StorageError.SdkNotInstalled(packageName))
      } else if (!result.getBoolean("success", false)) {
        val error = result.getString("error") ?: "Unknown error"
        val errorType = result.getString("errorType")
        if (errorType == "FileNotFound") {
          Result.failure(StorageError.FileNotFound(fileName))
        } else {
          Result.failure(StorageError.SdkError(error))
        }
      } else {
        val responseJson = result.getString("result") ?: "{}"
        val response = StorageProtocolSerializer.responseFromJson(responseJson)
        when (response) {
          is StorageResponse.Preferences -> {
            val entries = response.entries.map { entry ->
              PreferenceEntry(
                key = entry.key,
                value = entry.value,
                type = entry.type,
              )
            }
            Result.success(entries)
          }
          else -> Result.failure(StorageError.SdkError("Unexpected response type"))
        }
      }
    } catch (e: SecurityException) {
      Result.failure(StorageError.SdkNotInstalled(packageName))
    } catch (e: Exception) {
      Log.e(TAG, "Error getting preferences for $packageName:$fileName", e)
      Result.failure(StorageError.SdkError(e.message ?: "Unknown error"))
    }
  }

  /**
   * Subscribes to changes on a SharedPreferences file.
   *
   * @param packageName The target app package name
   * @param fileName The preferences file name
   * @return Result with subscription info or error
   */
  fun subscribe(packageName: String, fileName: String): Result<StorageSubscription> {
    val subscriptionId = "$packageName:$fileName"

    // Check if already subscribed
    if (subscriptions.containsKey(subscriptionId)) {
      return Result.success(subscriptions[subscriptionId]!!.subscription)
    }

    return try {
      val authority = packageName + AUTHORITY_SUFFIX
      val uri = Uri.parse("content://$authority")
      val extras = Bundle().apply { putString("fileName", fileName) }
      val result = context.contentResolver.call(uri, "subscribeToFile", null, extras)

      if (result == null) {
        Result.failure(StorageError.SdkNotInstalled(packageName))
      } else if (!result.getBoolean("success", false)) {
        val error = result.getString("error") ?: "Unknown error"
        Result.failure(StorageError.SdkError(error))
      } else {
        val subscription = StorageSubscription(packageName, fileName, subscriptionId)

        // Track the subscription
        subscriptions[subscriptionId] = SubscriptionState(subscription)

        // Register ContentObserver for this package if not already registered
        registerPackageObserver(packageName, fileName)

        Log.d(TAG, "Subscribed to $subscriptionId")
        Result.success(subscription)
      }
    } catch (e: SecurityException) {
      Result.failure(StorageError.SdkNotInstalled(packageName))
    } catch (e: Exception) {
      Log.e(TAG, "Error subscribing to $packageName:$fileName", e)
      Result.failure(StorageError.SdkError(e.message ?: "Unknown error"))
    }
  }

  /**
   * Unsubscribes from changes on a SharedPreferences file.
   *
   * @param packageName The target app package name
   * @param fileName The preferences file name
   * @return true if unsubscribed successfully, false if not subscribed
   */
  fun unsubscribe(packageName: String, fileName: String): Boolean {
    val subscriptionId = "$packageName:$fileName"

    if (!subscriptions.containsKey(subscriptionId)) {
      return false
    }

    try {
      val authority = packageName + AUTHORITY_SUFFIX
      val uri = Uri.parse("content://$authority")
      val extras = Bundle().apply { putString("fileName", fileName) }
      context.contentResolver.call(uri, "unsubscribeFromFile", null, extras)
    } catch (e: Exception) {
      Log.w(TAG, "Error unsubscribing from SDK (may be expected if app was uninstalled)", e)
    }

    // Remove the subscription
    subscriptions.remove(subscriptionId)

    // Unregister package observer if no more subscriptions for this package
    unregisterPackageObserverIfUnused(packageName, fileName)

    Log.d(TAG, "Unsubscribed from $subscriptionId")
    return true
  }

  /** Returns all active subscriptions. */
  fun getActiveSubscriptions(): List<StorageSubscription> {
    return subscriptions.values.map { it.subscription }
  }

  /**
   * Gets a single preference value by key.
   *
   * @param packageName The target app package name
   * @param fileName The preferences file name
   * @param key The key to retrieve
   * @return Result with the preference entry (null if key not found) or error
   */
  fun getPreference(packageName: String, fileName: String, key: String): Result<PreferenceEntry?> {
    return try {
      val authority = packageName + AUTHORITY_SUFFIX
      val uri = Uri.parse("content://$authority")
      val extras = Bundle().apply {
        putString("fileName", fileName)
        putString("key", key)
      }
      val result = context.contentResolver.call(uri, "getPreference", null, extras)

      if (result == null) {
        Result.failure(StorageError.SdkNotInstalled(packageName))
      } else if (!result.getBoolean("success", false)) {
        val error = result.getString("error") ?: "Unknown error"
        val errorType = result.getString("errorType")
        if (errorType == "FileNotFound") {
          Result.failure(StorageError.FileNotFound(fileName))
        } else {
          Result.failure(StorageError.SdkError(error))
        }
      } else {
        val responseJson = result.getString("result") ?: "{}"
        val response = StorageProtocolSerializer.responseFromJson(responseJson)
        when (response) {
          is StorageResponse.SinglePreference -> {
            val entry = response.entry?.let {
              PreferenceEntry(
                key = it.key,
                value = it.value,
                type = it.type,
              )
            }
            Result.success(entry)
          }
          else -> Result.failure(StorageError.SdkError("Unexpected response type"))
        }
      }
    } catch (e: SecurityException) {
      Result.failure(StorageError.SdkNotInstalled(packageName))
    } catch (e: Exception) {
      Log.e(TAG, "Error getting preference for $packageName:$fileName:$key", e)
      Result.failure(StorageError.SdkError(e.message ?: "Unknown error"))
    }
  }

  /**
   * Sets a preference value.
   *
   * @param packageName The target app package name
   * @param fileName The preferences file name
   * @param key The key to set
   * @param value The serialized value (or null)
   * @param type The type of the value (STRING, INT, LONG, FLOAT, BOOLEAN, STRING_SET)
   * @return Result with success or error
   */
  fun setPreference(
    packageName: String,
    fileName: String,
    key: String,
    value: String?,
    type: String,
  ): Result<Unit> {
    return try {
      val authority = packageName + AUTHORITY_SUFFIX
      val uri = Uri.parse("content://$authority")
      val extras = Bundle().apply {
        putString("fileName", fileName)
        putString("key", key)
        if (value != null) putString("value", value)
        putString("type", type)
      }
      val result = context.contentResolver.call(uri, "setValue", null, extras)

      if (result == null) {
        Result.failure(StorageError.SdkNotInstalled(packageName))
      } else if (!result.getBoolean("success", false)) {
        val error = result.getString("error") ?: "Unknown error"
        val errorType = result.getString("errorType")
        if (errorType == "FileNotFound") {
          Result.failure(StorageError.FileNotFound(fileName))
        } else {
          Result.failure(StorageError.SdkError(error))
        }
      } else {
        Log.d(TAG, "Set preference $packageName:$fileName:$key")
        Result.success(Unit)
      }
    } catch (e: SecurityException) {
      Result.failure(StorageError.SdkNotInstalled(packageName))
    } catch (e: Exception) {
      Log.e(TAG, "Error setting preference for $packageName:$fileName:$key", e)
      Result.failure(StorageError.SdkError(e.message ?: "Unknown error"))
    }
  }

  /**
   * Removes a preference value.
   *
   * @param packageName The target app package name
   * @param fileName The preferences file name
   * @param key The key to remove
   * @return Result with success or error
   */
  fun removePreference(packageName: String, fileName: String, key: String): Result<Unit> {
    return try {
      val authority = packageName + AUTHORITY_SUFFIX
      val uri = Uri.parse("content://$authority")
      val extras = Bundle().apply {
        putString("fileName", fileName)
        putString("key", key)
      }
      val result = context.contentResolver.call(uri, "removeValue", null, extras)

      if (result == null) {
        Result.failure(StorageError.SdkNotInstalled(packageName))
      } else if (!result.getBoolean("success", false)) {
        val error = result.getString("error") ?: "Unknown error"
        val errorType = result.getString("errorType")
        if (errorType == "FileNotFound") {
          Result.failure(StorageError.FileNotFound(fileName))
        } else {
          Result.failure(StorageError.SdkError(error))
        }
      } else {
        Log.d(TAG, "Removed preference $packageName:$fileName:$key")
        Result.success(Unit)
      }
    } catch (e: SecurityException) {
      Result.failure(StorageError.SdkNotInstalled(packageName))
    } catch (e: Exception) {
      Log.e(TAG, "Error removing preference for $packageName:$fileName:$key", e)
      Result.failure(StorageError.SdkError(e.message ?: "Unknown error"))
    }
  }

  /**
   * Clears all preferences in a file.
   *
   * @param packageName The target app package name
   * @param fileName The preferences file name
   * @return Result with success or error
   */
  fun clearPreferences(packageName: String, fileName: String): Result<Unit> {
    return try {
      val authority = packageName + AUTHORITY_SUFFIX
      val uri = Uri.parse("content://$authority")
      val extras = Bundle().apply {
        putString("fileName", fileName)
      }
      val result = context.contentResolver.call(uri, "clearFile", null, extras)

      if (result == null) {
        Result.failure(StorageError.SdkNotInstalled(packageName))
      } else if (!result.getBoolean("success", false)) {
        val error = result.getString("error") ?: "Unknown error"
        val errorType = result.getString("errorType")
        if (errorType == "FileNotFound") {
          Result.failure(StorageError.FileNotFound(fileName))
        } else {
          Result.failure(StorageError.SdkError(error))
        }
      } else {
        Log.d(TAG, "Cleared preferences $packageName:$fileName")
        Result.success(Unit)
      }
    } catch (e: SecurityException) {
      Result.failure(StorageError.SdkNotInstalled(packageName))
    } catch (e: Exception) {
      Log.e(TAG, "Error clearing preferences for $packageName:$fileName", e)
      Result.failure(StorageError.SdkError(e.message ?: "Unknown error"))
    }
  }

  /** Cleans up all subscriptions and observers. Call when the service is destroyed. */
  fun destroy() {
    // Unsubscribe from all
    subscriptions.keys.toList().forEach { subscriptionId ->
      val parts = subscriptionId.split(":", limit = 2)
      if (parts.size == 2) {
        unsubscribe(parts[0], parts[1])
      }
    }

    // Clear any remaining state
    subscriptions.clear()
    packageObservers.clear()
  }

  private fun registerPackageObserver(packageName: String, fileName: String) {
    val existingState = packageObservers[packageName]
    if (existingState != null) {
      existingState.subscriptions.add(fileName)
      return
    }

    val authority = packageName + AUTHORITY_SUFFIX
    val changesUri = Uri.parse("content://$authority/$CHANGES_PATH")

    val observer =
        object : ContentObserver(handler) {
          override fun onChange(selfChange: Boolean) {
            super.onChange(selfChange)
            Log.d(TAG, "ContentObserver notified for $packageName")
            fetchChangesForPackage(packageName)
          }
        }

    try {
      context.contentResolver.registerContentObserver(changesUri, false, observer)
      packageObservers[packageName] =
          PackageObserverState(observer, mutableSetOf(fileName))
      Log.d(TAG, "Registered ContentObserver for $packageName")
    } catch (e: Exception) {
      Log.e(TAG, "Failed to register ContentObserver for $packageName", e)
    }
  }

  private fun unregisterPackageObserverIfUnused(packageName: String, fileName: String) {
    val state = packageObservers[packageName] ?: return
    state.subscriptions.remove(fileName)

    if (state.subscriptions.isEmpty()) {
      try {
        context.contentResolver.unregisterContentObserver(state.observer)
        Log.d(TAG, "Unregistered ContentObserver for $packageName")
      } catch (e: Exception) {
        Log.w(TAG, "Error unregistering ContentObserver", e)
      }
      packageObservers.remove(packageName)
    }
  }

  private fun fetchChangesForPackage(packageName: String) {
    val state = packageObservers[packageName] ?: return
    val authority = packageName + AUTHORITY_SUFFIX
    val uri = Uri.parse("content://$authority")

    for (fileName in state.subscriptions.toList()) {
      val subscriptionId = "$packageName:$fileName"
      val subState = subscriptions[subscriptionId] ?: continue

      try {
        val extras =
            Bundle().apply {
              putString("fileName", fileName)
              putLong("sinceSequence", subState.lastSequence)
            }
        val result = context.contentResolver.call(uri, "getChanges", null, extras)

        if (result != null && result.getBoolean("success", false)) {
          val responseJson = result.getString("result") ?: "{}"
          val response = StorageProtocolSerializer.responseFromJson(responseJson)

          if (response is StorageResponse.Changes) {
            for (change in response.changes) {
              val event =
                  PreferenceChangeEvent(
                      packageName = packageName,
                      fileName = fileName,
                      key = change.key,
                      value = change.value,
                      type = change.type,
                      timestamp = change.timestamp,
                      sequenceNumber = change.sequenceNumber,
                  )

              _changeEvents.tryEmit(event)
              subState.lastSequence = maxOf(subState.lastSequence, change.sequenceNumber)
            }
          }
        }
      } catch (e: Exception) {
        Log.e(TAG, "Error fetching changes for $packageName:$fileName", e)
      }
    }
  }
}

/** Information about SDK availability. */
data class SdkAvailabilityInfo(
    val available: Boolean,
    val version: Int,
)

/** Errors that can occur during storage operations. */
sealed class StorageError(message: String) : Exception(message) {
  class SdkNotInstalled(packageName: String) :
      StorageError("SDK not installed in package: $packageName")

  class InspectionDisabled(packageName: String) :
      StorageError("SharedPreferences inspection is disabled in: $packageName")

  class FileNotFound(fileName: String) : StorageError("Preferences file not found: $fileName")

  class SdkError(message: String) : StorageError(message)
}
