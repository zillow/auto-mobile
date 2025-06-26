package com.zillow.automobile.accessibilityservice

import android.accessibilityservice.AccessibilityService
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.Build
import android.util.Log
import android.view.accessibility.AccessibilityEvent
import com.zillow.automobile.accessibilityservice.models.ViewHierarchy
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json

/**
 * Main AutoMobile Accessibility Service that provides view hierarchy extraction capabilities for
 * automated testing and UI interaction.
 */
class AutoMobileAccessibilityService : AccessibilityService() {

  companion object {
    private const val TAG = "AutoMobileAccessibilityService"

    // External actions (handled by AccessibilityCommandReceiver)
    private const val ACTION_GET_LATEST_HIERARCHY = "com.zillow.automobile.GET_LATEST_HIERARCHY"
    private const val ACTION_GET_HIERARCHY_SYNC = "com.zillow.automobile.GET_HIERARCHY_SYNC"

    // Internal actions (handled by this service)
    private const val INTERNAL_ACTION_GET_LATEST_HIERARCHY =
        "com.zillow.automobile.internal.GET_LATEST_HIERARCHY"
    private const val INTERNAL_ACTION_GET_HIERARCHY_SYNC =
        "com.zillow.automobile.internal.GET_HIERARCHY_SYNC"

    // Response action
    private const val ACTION_HIERARCHY_RESPONSE = "com.zillow.automobile.HIERARCHY_RESPONSE"
    private const val EXTRA_JSON_DATA = "json_data"
    private const val EXTRA_SUCCESS = "success"
    private const val EXTRA_ERROR = "error"

    // File name for app-scoped storage
    private const val HIERARCHY_FILE_NAME = "latest_hierarchy.json"
  }

  private val serviceScope = CoroutineScope(Dispatchers.Main + SupervisorJob())
  private val viewHierarchyExtractor = ViewHierarchyExtractor()
  private val json = Json { prettyPrint = true }
  private var commandReceiver: BroadcastReceiver? = null

  // In-memory storage for latest view hierarchy
  @Volatile private var latestViewHierarchy: ViewHierarchy? = null

  @Volatile private var lastExtractionTime: Long = 0

  override fun onServiceConnected() {
    super.onServiceConnected()

    try {
      Log.i(TAG, "AutoMobile Accessibility Service connecting...")

      // Register broadcast receiver for commands
      registerCommandReceiver()

      // Log service capabilities
      logServiceCapabilities()

      Log.i(TAG, "AutoMobile Accessibility Service connected successfully")
    } catch (e: Exception) {
      Log.e(TAG, "Error during service connection", e)
      // Service will continue running even if some initialization fails
    }
  }

  override fun onDestroy() {
    super.onDestroy()
    Log.i(TAG, "AutoMobile Accessibility Service destroyed")

    // Unregister receiver
    commandReceiver?.let {
      try {
        unregisterReceiver(it)
      } catch (e: Exception) {
        Log.w(TAG, "Error unregistering command receiver", e)
      }
    }

    // Cancel coroutines
    serviceScope.cancel()
  }

  override fun onAccessibilityEvent(event: AccessibilityEvent?) {
    if (event == null) return

    try {
      // Log accessibility events for debugging
      Log.d(TAG, "Accessibility event: ${event.eventType}, package: ${event.packageName}")

      // Extract and store view hierarchy when content or window changes
      if (event.eventType == AccessibilityEvent.TYPE_WINDOW_CONTENT_CHANGED ||
          event.eventType == AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED) {
        serviceScope.launch { extractAndStoreHierarchy() }
      }
    } catch (e: Exception) {
      Log.e(TAG, "Error handling accessibility event", e)
      // Don't let event handling crash the service
    }
  }

  override fun onInterrupt() {
    Log.w(TAG, "Accessibility service interrupted")
  }

  /** Extracts and stores view hierarchy, automatically writing to disk */
  private suspend fun extractAndStoreHierarchy() =
      withContext(Dispatchers.IO) {
        try {
          val rootNode = rootInActiveWindow
          if (rootNode == null) {
            Log.w(TAG, "No root node available for extraction")
            writeErrorToFile("No root node available")
            return@withContext
          }

          val hierarchy = viewHierarchyExtractor.extractFromActiveWindow(rootNode)
          if (hierarchy == null) {
            Log.w(TAG, "Failed to extract hierarchy")
            writeErrorToFile("Failed to extract hierarchy")
            return@withContext
          }

          // Store in memory
          latestViewHierarchy = hierarchy
          lastExtractionTime = System.currentTimeMillis()

          // Automatically write to disk
          writeHierarchyToFile(hierarchy)

          Log.d(TAG, "View hierarchy extracted and written to disk")
        } catch (e: Exception) {
          Log.e(TAG, "Error extracting and storing hierarchy", e)
          writeErrorToFile("Error: ${e.message}")
        }
      }

  /** Registers broadcast receiver for handling commands from external apps */
  private fun registerCommandReceiver() {
    try {
      commandReceiver =
          object : BroadcastReceiver() {
            override fun onReceive(context: Context?, intent: Intent?) {
              if (intent == null) return

              Log.d(TAG, "Received command: ${intent.action}")

              serviceScope.launch {
                try {
                  when (intent.action) {
                    INTERNAL_ACTION_GET_LATEST_HIERARCHY -> {
                      handleGetLatestHierarchyBroadcast()
                    }
                    INTERNAL_ACTION_GET_HIERARCHY_SYNC -> {
                      Log.i(TAG, "Handling synchronous hierarchy request")
                      withContext(Dispatchers.IO) {
                        val hierarchy = getLatestViewHierarchy()
                        if (hierarchy != null) {
                          Log.d(TAG, "Writing hierarchy to app-scoped storage")
                          writeHierarchyToFile(hierarchy)
                          Log.i(TAG, "Hierarchy written to file successfully")
                        } else {
                          Log.w(TAG, "No hierarchy available for synchronous request")
                          writeErrorToFile("No view hierarchy available")
                        }
                      }
                    }
                  }
                } catch (e: Exception) {
                  Log.e(TAG, "Error handling command: ${intent.action}", e)
                  sendErrorBroadcast("Error handling command: ${e.message}")
                }
              }
            }
          }

      val filter =
          IntentFilter().apply {
            addAction(INTERNAL_ACTION_GET_LATEST_HIERARCHY)
            addAction(INTERNAL_ACTION_GET_HIERARCHY_SYNC)
          }

      // Register receiver with proper flags for Android 13+ compatibility
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
        registerReceiver(commandReceiver, filter, Context.RECEIVER_NOT_EXPORTED)
      } else {
        @Suppress("UnspecifiedRegisterReceiverFlag") registerReceiver(commandReceiver, filter)
      }

      Log.i(TAG, "Command receiver registered successfully")
    } catch (e: Exception) {
      Log.e(TAG, "Failed to register command receiver", e)
      // Don't let this crash the service
    }
  }

  /** Handles get latest hierarchy command via broadcast */
  private suspend fun handleGetLatestHierarchyBroadcast() =
      withContext(Dispatchers.IO) {
        try {
          Log.i(TAG, "Getting latest view hierarchy from memory")

          val hierarchy = getLatestViewHierarchy()
          if (hierarchy == null) {
            sendErrorBroadcast("No view hierarchy available in memory")
            return@withContext
          }

          // Serialize to JSON
          val jsonString = json.encodeToString(hierarchy)
          sendResponseBroadcast(ACTION_HIERARCHY_RESPONSE, jsonString)
          Log.i(TAG, "Latest view hierarchy retrieved successfully")
        } catch (e: Exception) {
          Log.e(TAG, "Error getting latest hierarchy", e)
          sendErrorBroadcast("Error: ${e.message}")
        }
      }

  /** Sends a broadcast response with the given data */
  private fun sendResponseBroadcast(action: String, jsonData: String) {
    val intent =
        Intent(action).apply {
          putExtra(EXTRA_JSON_DATA, jsonData)
          putExtra(EXTRA_SUCCESS, true)
        }
    sendBroadcast(intent)
  }

  /** Sends an error broadcast response */
  private fun sendErrorBroadcast(error: String) {
    val intent =
        Intent(ACTION_HIERARCHY_RESPONSE).apply {
          putExtra(EXTRA_JSON_DATA, error)
          putExtra(EXTRA_SUCCESS, false)
        }
    sendBroadcast(intent)
  }

  /** Logs service capabilities for debugging */
  private fun logServiceCapabilities() {
    val info = serviceInfo
    if (info != null) {
      Log.i(TAG, "Service capabilities:")
      Log.i(TAG, "  - Can retrieve window content: ${info.canRetrieveWindowContent}")
      Log.i(
          TAG,
          "  - Can perform gestures: ${(info.capabilities and android.accessibilityservice.AccessibilityServiceInfo.CAPABILITY_CAN_PERFORM_GESTURES) != 0}")
      Log.i(TAG, "  - Event types: ${info.eventTypes}")
      Log.i(TAG, "  - Flags: ${info.flags}")
    }
  }

  /** Gets the latest stored view hierarchy */
  fun getLatestViewHierarchy(): ViewHierarchy? {
    val rootNode = rootInActiveWindow
    if (rootNode != null) {
      val hierarchy = viewHierarchyExtractor.extractFromActiveWindow(rootNode)
      latestViewHierarchy = hierarchy
      lastExtractionTime = System.currentTimeMillis()
      Log.d(TAG, "View hierarchy refreshed in memory")
      return hierarchy
    }
    return latestViewHierarchy
  }

  /** Public API methods for direct access (when service is running) */

  /** Gets current view hierarchy */
  fun getCurrentViewHierarchy(): ViewHierarchy? {
    val rootNode = rootInActiveWindow ?: return null
    return viewHierarchyExtractor.extractFromActiveWindow(rootNode)
  }

  /** Gets the timestamp of the last view hierarchy extraction */
  fun getLastExtractionTime(): Long {
    return lastExtractionTime
  }

  /** Writes the hierarchy to a file for synchronous access */
  private fun writeHierarchyToFile(hierarchy: ViewHierarchy) {
    try {
      Log.d(TAG, "Opening file output stream for: $HIERARCHY_FILE_NAME")
      val jsonString = json.encodeToString(hierarchy)
      Log.d(TAG, "JSON string length: ${jsonString.length}")

      openFileOutput(HIERARCHY_FILE_NAME, Context.MODE_PRIVATE).use { output ->
        output.write(jsonString.toByteArray())
        output.flush()
      }

      Log.d(TAG, "File written successfully to app's private storage")

      // Verify the file was written
      val file = getFileStreamPath(HIERARCHY_FILE_NAME)
      Log.d(TAG, "File path: ${file.absolutePath}")
      Log.d(TAG, "File exists: ${file.exists()}")
      Log.d(TAG, "File size: ${file.length()} bytes")
    } catch (e: Exception) {
      Log.e(TAG, "Error writing hierarchy to file", e)
    }
  }

  /** Writes an error message to the file for debugging */
  private fun writeErrorToFile(errorMessage: String) {
    try {
      Log.d(TAG, "Opening file output stream for error message")
      val errorJson = json.encodeToString(mapOf("error" to errorMessage))
      Log.d(TAG, "Error JSON string length: ${errorJson.length}")

      openFileOutput(HIERARCHY_FILE_NAME, Context.MODE_PRIVATE).use { output ->
        output.write(errorJson.toByteArray())
        output.flush()
      }

      Log.d(TAG, "Error message written to file for debugging")

      // Verify the error file was written
      val file = getFileStreamPath(HIERARCHY_FILE_NAME)
      Log.d(TAG, "Error file path: ${file.absolutePath}")
      Log.d(TAG, "Error file exists: ${file.exists()}")
      Log.d(TAG, "Error file size: ${file.length()} bytes")
    } catch (e: Exception) {
      Log.e(TAG, "Error writing error message to file", e)
    }
  }
}
