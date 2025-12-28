package dev.jasonpearson.automobile.accessibilityservice

import android.accessibilityservice.AccessibilityService
import android.annotation.SuppressLint
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.Build
import android.util.Log
import android.view.accessibility.AccessibilityEvent
import dev.jasonpearson.automobile.accessibilityservice.models.ViewHierarchy
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json

/**
 * Main AutoMobile Accessibility Service that provides view hierarchy extraction capabilities for
 * automated testing and UI interaction.
 */
class AutoMobileAccessibilityService : AccessibilityService() {

  companion object {
    private const val TAG = "AutoMobileAccessibilityService"

    // File name for app-scoped storage
    private const val HIERARCHY_FILE_NAME = "latest_hierarchy.json"

    // Broadcast actions
    const val ACTION_EXTRACT_HIERARCHY = "dev.jasonpearson.automobile.EXTRACT_HIERARCHY"

    // Result broadcast actions
    const val ACTION_OPERATION_RESULT = "dev.jasonpearson.automobile.OPERATION_RESULT"
  }

  private val serviceScope = CoroutineScope(Dispatchers.IO + SupervisorJob())
  private val viewHierarchyExtractor = ViewHierarchyExtractor()
  private val json = Json { prettyPrint = true }
  private val jsonCompact = Json { prettyPrint = false }
  private lateinit var webSocketServer: WebSocketServer

  private val commandReceiver =
      object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
          if (intent == null) {
            Log.w(TAG, "no intent")
            return
          }

          Log.d(TAG, "Received broadcast: ${intent.action}")

          serviceScope.launch {
            try {
              handleCommand(intent)
            } catch (e: Exception) {
              Log.e(TAG, "Error handling command: ${intent.action}", e)
              sendResult(success = false, error = e.message)
            }
          }
        }
      }

  override fun onServiceConnected() {
    super.onServiceConnected()
    Log.d(TAG, "onServiceConnected")

    try {
      // Register broadcast receiver for commands
      val filter = IntentFilter().apply { addAction(ACTION_EXTRACT_HIERARCHY) }

      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
        registerReceiver(commandReceiver, filter, RECEIVER_EXPORTED)
      } else {
        @SuppressLint("UnspecifiedRegisterReceiverFlag") registerReceiver(commandReceiver, filter)
      }

      // Start WebSocket server with hierarchy request callback
      webSocketServer = WebSocketServer(
          port = 8765,
          scope = serviceScope,
          onRequestHierarchy = { extractAndStoreHierarchy() }
      )
      webSocketServer.start()
      Log.d(TAG, "WebSocket server started on port 8765")

      Log.d(TAG, "AutoMobile Accessibility Service connected successfully")
    } catch (e: Exception) {
      Log.e(TAG, "Error during service connection", e)
      // Service will continue running even if some initialization fails
    }
  }

  override fun onDestroy() {
    super.onDestroy()

    try {
      unregisterReceiver(commandReceiver)
    } catch (e: Exception) {
      Log.e(TAG, "Error unregistering receiver", e)
    }

    // Stop WebSocket server
    if (::webSocketServer.isInitialized) {
      webSocketServer.stop()
      Log.d(TAG, "WebSocket server stopped")
    }

    Log.d(TAG, "AutoMobile Accessibility Service destroyed")
    serviceScope.cancel()
  }

  override fun onAccessibilityEvent(event: AccessibilityEvent?) {
    Log.d(TAG, "onAccessibilityEvent")
    if (event == null) {
      Log.w(TAG, "no event")
      return
    }

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
  private fun extractAndStoreHierarchy() {
    Log.d(TAG, "extractAndStoreHierarchy")
    try {
      val rootNode = rootInActiveWindow
      if (rootNode == null) {
        Log.w(TAG, "No root node available for extraction")
        return
      }

      val hierarchy = viewHierarchyExtractor.extractFromActiveWindow(rootNode)
      if (hierarchy == null) {
        Log.w(TAG, "Failed to extract hierarchy")
        return
      }

      // Automatically write to disk
      writeHierarchyToFile(hierarchy)

      // Broadcast to WebSocket clients
      broadcastHierarchyUpdate(hierarchy)

      Log.d(TAG, "View hierarchy extracted and written to disk")
    } catch (e: Exception) {
      Log.e(TAG, "Error extracting and storing hierarchy", e)
    }
  }

  /** Writes the hierarchy to a file for synchronous access */
  private fun writeHierarchyToFile(
      hierarchy: ViewHierarchy,
      filename: String = HIERARCHY_FILE_NAME
  ) {
    try {
      val jsonString = json.encodeToString(hierarchy)
      val jsonBytes = jsonString.toByteArray()
      openFileOutput(filename, Context.MODE_PRIVATE).use { output ->
        Log.d(TAG, "Writing ${jsonBytes.size} bytes to $filename")
        output.write(jsonBytes)
        output.flush()
      }
    } catch (e: Exception) {
      Log.e(TAG, "Error writing hierarchy to file: $filename", e)
    }
  }

  private suspend fun handleCommand(intent: Intent) {
    // Clean up any lingering UUID-based hierarchy files before processing new requests
    cleanupUuidHierarchyFiles()

    when (intent.action) {
      ACTION_EXTRACT_HIERARCHY -> {
        val uuid = intent.getStringExtra("uuid")
        if (uuid.isNullOrBlank()) {
          sendResult(success = false, error = "UUID parameter is required")
          return
        }

        val textFilter = intent.getStringExtra("text")
        val hierarchy = extractHierarchy(textFilter)
        if (hierarchy != null) {
          val filename = "hierarchy_$uuid.json"
          writeHierarchyToFile(hierarchy, filename)

          // Broadcast to WebSocket clients
          broadcastHierarchyUpdate(hierarchy)

          val message =
              if (textFilter != null) {
                "Hierarchy extracted with text filter: '$textFilter', saved as $filename"
              } else {
                "Hierarchy extracted successfully, saved as $filename"
              }
          sendResult(success = true, data = message)
        } else {
          sendResult(success = false, error = "Failed to extract hierarchy")
        }
      }
    }
  }

  private fun extractHierarchy(textFilter: String? = null): ViewHierarchy? {
    val rootNode = rootInActiveWindow ?: return null
    return viewHierarchyExtractor.extractFromActiveWindow(rootNode, textFilter)
  }

  private fun sendResult(success: Boolean, data: String? = null, error: String? = null) {
    val resultIntent =
        Intent(ACTION_OPERATION_RESULT).apply {
          putExtra("success", success)
          putExtra("timestamp", System.currentTimeMillis())
          data?.let { putExtra("data", it) }
          error?.let { putExtra("error", it) }
        }
    sendBroadcast(resultIntent)
  }

  private fun writeResultToFile(filename: String, content: String) {
    try {
      openFileOutput(filename, Context.MODE_PRIVATE).use { output ->
        output.write(content.toByteArray())
        output.flush()
      }
    } catch (e: Exception) {
      Log.e(TAG, "Error writing result to file: $filename", e)
    }
  }

  /** Broadcast hierarchy update to WebSocket clients */
  private fun broadcastHierarchyUpdate(hierarchy: ViewHierarchy) {
    if (!::webSocketServer.isInitialized || !webSocketServer.isRunning()) {
      Log.d(TAG, "WebSocket server not running, skipping broadcast")
      return
    }

    serviceScope.launch {
      try {
        val jsonString = jsonCompact.encodeToString(hierarchy)
        val message = """{"type":"hierarchy_update","timestamp":${System.currentTimeMillis()},"data":$jsonString}"""
        webSocketServer.broadcast(message)
        Log.d(TAG, "Broadcasted hierarchy update to ${webSocketServer.getConnectionCount()} clients")
      } catch (e: Exception) {
        Log.e(TAG, "Error broadcasting hierarchy update", e)
      }
    }
  }

  /** Clean up any existing UUID-based hierarchy files */
  private fun cleanupUuidHierarchyFiles() {
    try {
      val filesDir = filesDir
      val files = filesDir.listFiles() ?: return

      var deletedCount = 0
      files.forEach { file ->
        if (file.name.startsWith("hierarchy_") &&
            file.name.endsWith(".json") &&
            file.name != HIERARCHY_FILE_NAME) {
          if (file.delete()) {
            deletedCount++
            Log.d(TAG, "Deleted old hierarchy file: ${file.name}")
          } else {
            Log.w(TAG, "Failed to delete hierarchy file: ${file.name}")
          }
        }
      }

      if (deletedCount > 0) {
        Log.i(TAG, "Cleaned up $deletedCount old UUID hierarchy files")
      }
    } catch (e: Exception) {
      Log.e(TAG, "Error cleaning up UUID hierarchy files", e)
      // Don't let cleanup errors prevent the main operation
    }
  }
}
