package dev.jasonpearson.automobile.accessibilityservice.storage

import android.content.ContentResolver
import android.content.Context
import android.database.ContentObserver
import android.net.Uri
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.util.Log
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.asSharedFlow
import org.json.JSONArray
import org.json.JSONObject

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
        val json = JSONObject(result.getString("result") ?: "{}")
        Result.success(
            SdkAvailabilityInfo(
                available = json.optBoolean("available", false),
                version = json.optInt("version", 0),
            )
        )
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
    return try {
      val authority = packageName + AUTHORITY_SUFFIX
      val uri = Uri.parse("content://$authority")
      val result = context.contentResolver.call(uri, "listFiles", null, null)

      if (result == null) {
        Result.failure(StorageError.SdkNotInstalled(packageName))
      } else if (!result.getBoolean("success", false)) {
        val error = result.getString("error") ?: "Unknown error"
        Result.failure(StorageError.SdkError(error))
      } else {
        val json = JSONObject(result.getString("result") ?: "{}")
        val filesArray = json.optJSONArray("files") ?: JSONArray()
        val files =
            (0 until filesArray.length()).map { i ->
              val fileJson = filesArray.getJSONObject(i)
              PreferenceFileInfo(
                  name = fileJson.getString("name"),
                  path = fileJson.getString("path"),
                  entryCount = fileJson.getInt("entryCount"),
              )
            }
        Result.success(files)
      }
    } catch (e: SecurityException) {
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
        val json = JSONObject(result.getString("result") ?: "{}")
        val entriesArray = json.optJSONArray("entries") ?: JSONArray()
        val entries =
            (0 until entriesArray.length()).map { i ->
              val entryJson = entriesArray.getJSONObject(i)
              PreferenceEntry(
                  key = entryJson.getString("key"),
                  value = serializeJsonValue(entryJson.opt("value")),
                  type = entryJson.getString("type"),
              )
            }
        Result.success(entries)
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
          val json = JSONObject(result.getString("result") ?: "{}")
          val changesArray = json.optJSONArray("changes") ?: JSONArray()

          for (i in 0 until changesArray.length()) {
            val changeJson = changesArray.getJSONObject(i)
            val sequenceNumber = changeJson.getLong("sequenceNumber")

            val event =
                PreferenceChangeEvent(
                    packageName = packageName,
                    fileName = fileName,
                    key = if (changeJson.isNull("key")) null else changeJson.getString("key"),
                    value = serializeJsonValue(changeJson.opt("value")),
                    type = changeJson.getString("type"),
                    timestamp = changeJson.getLong("timestamp"),
                    sequenceNumber = sequenceNumber,
                )

            _changeEvents.tryEmit(event)
            subState.lastSequence = maxOf(subState.lastSequence, sequenceNumber)
          }
        }
      } catch (e: Exception) {
        Log.e(TAG, "Error fetching changes for $packageName:$fileName", e)
      }
    }
  }

  /** Converts a JSON value to a String representation for serialization. */
  private fun serializeJsonValue(value: Any?): String? {
    return when (value) {
      null, JSONObject.NULL -> null
      is JSONArray -> value.toString()
      is JSONObject -> value.toString()
      else -> value.toString()
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
