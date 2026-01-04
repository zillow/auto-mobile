package dev.jasonpearson.automobile.accessibilityservice

import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.GestureDescription
import android.annotation.SuppressLint
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.graphics.Bitmap
import android.graphics.Path
import android.os.Build
import android.util.Base64
import android.util.Log
import android.util.DisplayMetrics
import android.view.Display
import android.view.WindowManager
import android.view.accessibility.AccessibilityEvent
import dev.jasonpearson.automobile.accessibilityservice.models.ScreenDimensions
import dev.jasonpearson.automobile.accessibilityservice.models.ViewHierarchy
import dev.jasonpearson.automobile.accessibilityservice.perf.PerfProvider
import dev.jasonpearson.automobile.accessibilityservice.perf.SystemTimeProvider
import dev.jasonpearson.automobile.accessibilityservice.perf.TimeProvider
import dev.jasonpearson.automobile.sdk.AutoMobileSDK
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.launchIn
import kotlinx.coroutines.flow.onEach
import kotlinx.coroutines.launch
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import java.io.ByteArrayOutputStream
import kotlin.coroutines.resume

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
  private val perfProvider = PerfProvider.instance
  private val timeProvider: TimeProvider = SystemTimeProvider()
  private lateinit var webSocketServer: WebSocketServer
  private lateinit var hierarchyDebouncer: HierarchyDebouncer
  private val navigationEventAccumulator = NavigationEventAccumulator()

  // Job for collecting hierarchy flow results
  private var hierarchyFlowJob: Job? = null

  // Job for collecting navigation event updates
  private var navigationEventJob: Job? = null

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

  private val navigationEventReceiver =
      object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
          if (intent == null || intent.action != AutoMobileSDK.ACTION_NAVIGATION_EVENT) {
            return
          }

          try {
            val destination = intent.getStringExtra(AutoMobileSDK.EXTRA_DESTINATION) ?: return
            val source = intent.getStringExtra(AutoMobileSDK.EXTRA_SOURCE) ?: return
            val applicationId = intent.getStringExtra(AutoMobileSDK.EXTRA_APPLICATION_ID)

            // Extract arguments (prefixed with "arg_")
            val arguments = mutableMapOf<String, String>()
            val metadata = mutableMapOf<String, String>()

            intent.extras?.keySet()?.forEach { key ->
              when {
                key.startsWith("arg_") -> {
                  intent.getStringExtra(key)?.let { value ->
                    arguments[key.removePrefix("arg_")] = value
                  }
                }
                key.startsWith("meta_") -> {
                  intent.getStringExtra(key)?.let { value ->
                    metadata[key.removePrefix("meta_")] = value
                  }
                }
              }
            }

            Log.d(TAG, "Received navigation event: $destination from $source (app: $applicationId)")
            navigationEventAccumulator.addEvent(destination, source, arguments, metadata, applicationId)
          } catch (e: Exception) {
            Log.e(TAG, "Error handling navigation event broadcast", e)
          }
        }
      }

  override fun onServiceConnected() {
    super.onServiceConnected()
    Log.d(TAG, "onServiceConnected")

    try {
      // Register broadcast receiver for commands
      val commandFilter = IntentFilter().apply { addAction(ACTION_EXTRACT_HIERARCHY) }

      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
        registerReceiver(commandReceiver, commandFilter, RECEIVER_EXPORTED)
      } else {
        @SuppressLint("UnspecifiedRegisterReceiverFlag") registerReceiver(commandReceiver, commandFilter)
      }

      // Register broadcast receiver for navigation events
      val navigationFilter = IntentFilter().apply { addAction(AutoMobileSDK.ACTION_NAVIGATION_EVENT) }

      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
        registerReceiver(navigationEventReceiver, navigationFilter, RECEIVER_EXPORTED)
      } else {
        @SuppressLint("UnspecifiedRegisterReceiverFlag") registerReceiver(navigationEventReceiver, navigationFilter)
      }
      Log.d(TAG, "Navigation event receiver registered")

      // Initialize the navigation event accumulator
      navigationEventAccumulator.initialize()
      Log.d(TAG, "Navigation event accumulator initialized")

      // Subscribe to navigation events and broadcast them
      navigationEventJob = navigationEventAccumulator.latestEvent
          .onEach { event ->
            if (event != null) {
              Log.d(TAG, "Navigation event: ${event.destination} at ${event.timestamp}")
              broadcastNavigationEvent(event)
            }
          }
          .launchIn(serviceScope)

      // Initialize the smart hierarchy debouncer with structural hash comparison
      hierarchyDebouncer = HierarchyDebouncer(
          scope = serviceScope,
          timeProvider = timeProvider,
          perfProvider = perfProvider,
          quickDebounceMs = 5L,
          animationSkipWindowMs = 100L,
          extractHierarchy = { extractHierarchyDirect() }
      )

      // Subscribe to hierarchy updates from the debouncer
      hierarchyFlowJob = hierarchyDebouncer.hierarchyFlow
          .onEach { result ->
            when (result) {
              is HierarchyResult.Changed -> {
                Log.d(TAG, "Hierarchy changed (hash=${result.hash}, extraction=${result.extractionTimeMs}ms)")
                writeHierarchyToFile(result.hierarchy)
                broadcastHierarchyUpdate(result.hierarchy)
              }
              is HierarchyResult.Unchanged -> {
                Log.d(TAG, "Hierarchy unchanged (animation mode, skipped=${result.skippedEventCount})")
                // Still broadcast so clients get updated bounds
                broadcastHierarchyUpdate(result.hierarchy)
              }
              is HierarchyResult.Error -> {
                Log.w(TAG, "Hierarchy extraction error: ${result.message}")
              }
            }
          }
          .launchIn(serviceScope)

      // Start WebSocket server with hierarchy, screenshot, swipe, text input, and IME action callbacks
      webSocketServer = WebSocketServer(
          port = 8765,
          scope = serviceScope,
          onRequestHierarchy = { extractHierarchyNow() },
          onRequestHierarchyIfStale = { sinceTimestamp ->
            hierarchyDebouncer.extractIfStale(sinceTimestamp)
          },
          onRequestScreenshot = { requestId -> broadcastScreenshot(requestId) },
          onRequestSwipe = { requestId, x1, y1, x2, y2, duration ->
            performSwipe(requestId, x1, y1, x2, y2, duration)
          },
          onRequestSetText = { requestId, text, resourceId ->
            performSetText(requestId, text, resourceId)
          },
          onRequestImeAction = { requestId, action ->
            performImeAction(requestId, action)
          },
          onRequestSelectAll = { requestId ->
            performSelectAll(requestId)
          },
          onRequestAction = { requestId, action, resourceId ->
            performNodeAction(requestId, action, resourceId)
          }
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
      Log.e(TAG, "Error unregistering command receiver", e)
    }

    try {
      unregisterReceiver(navigationEventReceiver)
    } catch (e: Exception) {
      Log.e(TAG, "Error unregistering navigation event receiver", e)
    }

    // Cancel hierarchy flow subscription
    hierarchyFlowJob?.cancel()

    // Cancel navigation event flow subscription
    navigationEventJob?.cancel()

    // Reset debouncer
    if (::hierarchyDebouncer.isInitialized) {
      hierarchyDebouncer.reset()
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
    if (event == null) {
      Log.w(TAG, "onAccessibilityEvent: no event")
      return
    }

    try {
      // Log accessibility events for debugging (reduced verbosity)
      Log.v(TAG, "Accessibility event: ${event.eventType}, package: ${event.packageName}")

      // Delegate to the smart debouncer for content/window changes
      // The debouncer uses structural hash comparison to detect animation vs real changes
      if (event.eventType == AccessibilityEvent.TYPE_WINDOW_CONTENT_CHANGED ||
          event.eventType == AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED) {
        if (::hierarchyDebouncer.isInitialized) {
          hierarchyDebouncer.onAccessibilityEvent()
        }
      }
    } catch (e: Exception) {
      Log.e(TAG, "Error handling accessibility event", e)
      // Don't let event handling crash the service
    }
  }

  override fun onInterrupt() {
    Log.w(TAG, "Accessibility service interrupted")
  }

  /**
   * Get current screen dimensions for offscreen filtering.
   */
  @Suppress("DEPRECATION")
  private fun getScreenDimensions(): ScreenDimensions? {
    return try {
      val windowManager = getSystemService(Context.WINDOW_SERVICE) as? WindowManager
      if (windowManager != null) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
          val bounds = windowManager.currentWindowMetrics.bounds
          ScreenDimensions(bounds.width(), bounds.height())
        } else {
          val displayMetrics = DisplayMetrics()
          windowManager.defaultDisplay.getRealMetrics(displayMetrics)
          ScreenDimensions(displayMetrics.widthPixels, displayMetrics.heightPixels)
        }
      } else {
        null
      }
    } catch (e: Exception) {
      Log.w(TAG, "Failed to get screen dimensions", e)
      null
    }
  }

  /**
   * Direct hierarchy extraction without debouncing.
   * Used by the HierarchyDebouncer.
   * Extracts from all visible windows to capture popups, toolbars, etc.
   */
  private fun extractHierarchyDirect(): ViewHierarchy? {
    // Get all windows to capture popups, toolbars, and other floating windows
    val allWindows = windows
    val rootNode = rootInActiveWindow
    val screenDimensions = getScreenDimensions()

    if (allWindows.isNullOrEmpty() && rootNode == null) {
      Log.w(TAG, "No windows or root node available for extraction")
      return null
    }

    // Use multi-window extraction if windows are available, otherwise fall back to single window
    return if (!allWindows.isNullOrEmpty()) {
      Log.d(TAG, "Extracting from ${allWindows.size} windows")
      viewHierarchyExtractor.extractFromAllWindows(allWindows, rootNode, null, screenDimensions)
    } else {
      viewHierarchyExtractor.extractFromActiveWindow(rootNode, null, screenDimensions)
    }
  }

  /**
   * Extract hierarchy immediately and broadcast, bypassing the debouncer.
   * Used for explicit WebSocket requests where we need fresh data immediately.
   */
  private fun extractHierarchyNow() {
    Log.d(TAG, "extractHierarchyNow")
    hierarchyDebouncer.extractNow()
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
    val allWindows = windows
    val rootNode = rootInActiveWindow
    val screenDimensions = getScreenDimensions()

    if (allWindows.isNullOrEmpty() && rootNode == null) {
      return null
    }

    return if (!allWindows.isNullOrEmpty()) {
      viewHierarchyExtractor.extractFromAllWindows(allWindows, rootNode, textFilter, screenDimensions)
    } else {
      viewHierarchyExtractor.extractFromActiveWindow(rootNode, textFilter, screenDimensions)
    }
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

  /**
   * Broadcast hierarchy update to WebSocket clients (suspend function for proper ordering).
   * @param sync If true, waits for delivery to all clients before returning. Use for critical ordering.
   */
  private suspend fun broadcastHierarchyUpdate(hierarchy: ViewHierarchy, sync: Boolean = false) {
    if (!::webSocketServer.isInitialized || !webSocketServer.isRunning()) {
      Log.d(TAG, "WebSocket server not running, skipping broadcast")
      return
    }

    try {
      val jsonString = perfProvider.track("serializeHierarchy") {
        jsonCompact.encodeToString(hierarchy)
      }
      val messageBuilder: (kotlinx.serialization.json.JsonElement?) -> String = { perfTiming ->
        buildString {
          append("""{"type":"hierarchy_update","timestamp":${System.currentTimeMillis()},"data":$jsonString""")
          if (perfTiming != null) {
            append(""","perfTiming":$perfTiming""")
          }
          append("}")
        }
      }

      if (sync) {
        // Synchronous broadcast - waits for delivery to ensure ordering
        webSocketServer.broadcastWithPerfSync(messageBuilder)
      } else {
        // Async broadcast - for normal event-driven updates
        webSocketServer.broadcastWithPerf(messageBuilder)
      }
      Log.d(TAG, "Broadcasted hierarchy update to ${webSocketServer.getConnectionCount()} clients (sync=$sync)")
    } catch (e: Exception) {
      Log.e(TAG, "Error broadcasting hierarchy update", e)
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

  /**
   * Takes a screenshot and returns it as a base64-encoded JPEG string.
   * Requires Android R (API 30) or higher.
   * Runs on IO dispatcher to avoid blocking the main thread.
   */
  private suspend fun takeScreenshotAsync(quality: Int = 80): String? {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) {
      Log.w(TAG, "Screenshot API requires Android R (API 30) or higher")
      return null
    }

    return withContext(Dispatchers.IO) {
      try {
        val startTime = System.currentTimeMillis()

        // Use suspendCancellableCoroutine to bridge callback-based API
        val bitmap = suspendCancellableCoroutine<Bitmap?> { continuation ->
          takeScreenshot(
            Display.DEFAULT_DISPLAY,
            mainExecutor,
            object : TakeScreenshotCallback {
              override fun onSuccess(screenshot: ScreenshotResult) {
                val hardwareBitmap = Bitmap.wrapHardwareBuffer(
                  screenshot.hardwareBuffer,
                  screenshot.colorSpace
                )
                screenshot.hardwareBuffer.close()
                continuation.resume(hardwareBitmap)
              }

              override fun onFailure(errorCode: Int) {
                Log.e(TAG, "Screenshot failed with error code: $errorCode")
                continuation.resume(null)
              }
            }
          )
        }

        if (bitmap == null) {
          Log.e(TAG, "Failed to capture screenshot bitmap")
          return@withContext null
        }

        val screenshotTime = System.currentTimeMillis() - startTime
        Log.d(TAG, "Screenshot captured in ${screenshotTime}ms (${bitmap.width}x${bitmap.height})")

        // Convert to JPEG bytes on IO thread
        val encodeStart = System.currentTimeMillis()
        val outputStream = ByteArrayOutputStream()

        // Convert hardware bitmap to software bitmap for compression
        val softwareBitmap = bitmap.copy(Bitmap.Config.ARGB_8888, false)
        bitmap.recycle()

        softwareBitmap.compress(Bitmap.CompressFormat.JPEG, quality, outputStream)
        softwareBitmap.recycle()

        val jpegBytes = outputStream.toByteArray()
        val base64String = Base64.encodeToString(jpegBytes, Base64.NO_WRAP)

        val encodeTime = System.currentTimeMillis() - encodeStart
        val totalTime = System.currentTimeMillis() - startTime

        Log.d(TAG, "Screenshot encoded: ${jpegBytes.size} bytes -> ${base64String.length} base64 chars in ${encodeTime}ms (total: ${totalTime}ms)")

        base64String
      } catch (e: Exception) {
        Log.e(TAG, "Error taking screenshot", e)
        null
      }
    }
  }

  /**
   * Perform a swipe gesture using AccessibilityService's dispatchGesture API.
   * This is significantly faster than ADB's input swipe command.
   */
  private fun performSwipe(requestId: String?, x1: Int, y1: Int, x2: Int, y2: Int, duration: Long) {
    val startTime = System.currentTimeMillis()
    Log.d(TAG, "performSwipe: ($x1, $y1) -> ($x2, $y2) duration=${duration}ms")
    perfProvider.serial("performSwipe")

    try {
      // Create the swipe path
      perfProvider.startOperation("buildPath")
      val path = Path().apply {
        moveTo(x1.toFloat(), y1.toFloat())
        lineTo(x2.toFloat(), y2.toFloat())
      }

      // Build the gesture description
      val gesture = GestureDescription.Builder()
        .addStroke(GestureDescription.StrokeDescription(path, 0, duration))
        .build()
      perfProvider.endOperation("buildPath")

      val gestureBuiltTime = System.currentTimeMillis()
      Log.d(TAG, "Gesture built in ${gestureBuiltTime - startTime}ms")

      perfProvider.startOperation("dispatchGesture")
      // Dispatch the gesture
      val dispatched = dispatchGesture(gesture, object : GestureResultCallback() {
        override fun onCompleted(gestureDescription: GestureDescription?) {
          perfProvider.endOperation("dispatchGesture")
          perfProvider.end() // end performSwipe block
          val completedTime = System.currentTimeMillis()
          val totalTime = completedTime - startTime
          val gestureTime = completedTime - gestureBuiltTime
          Log.d(TAG, "Swipe completed: gesture=${gestureTime}ms, total=${totalTime}ms")

          // Broadcast success result
          serviceScope.launch {
            broadcastSwipeResult(requestId, true, null, totalTime, gestureTime)
          }
        }

        override fun onCancelled(gestureDescription: GestureDescription?) {
          perfProvider.endOperation("dispatchGesture")
          perfProvider.end() // end performSwipe block
          val cancelledTime = System.currentTimeMillis()
          val totalTime = cancelledTime - startTime
          Log.w(TAG, "Swipe cancelled after ${totalTime}ms")

          // Broadcast cancelled result
          serviceScope.launch {
            broadcastSwipeResult(requestId, false, "Gesture was cancelled", totalTime, null)
          }
        }
      }, null)

      if (!dispatched) {
        perfProvider.endOperation("dispatchGesture")
        perfProvider.end() // end performSwipe block
        val failTime = System.currentTimeMillis()
        Log.e(TAG, "Failed to dispatch swipe gesture")
        serviceScope.launch {
          broadcastSwipeResult(requestId, false, "Failed to dispatch gesture", failTime - startTime, null)
        }
      }
    } catch (e: Exception) {
      perfProvider.end() // end performSwipe block
      val errorTime = System.currentTimeMillis()
      Log.e(TAG, "Error performing swipe", e)
      serviceScope.launch {
        broadcastSwipeResult(requestId, false, e.message, errorTime - startTime, null)
      }
    }
  }

  /**
   * Perform text input using AccessibilityService's ACTION_SET_TEXT.
   * This is significantly faster than ADB's input text command.
   */
  private fun performSetText(requestId: String?, text: String, resourceId: String?) {
    val startTime = System.currentTimeMillis()
    Log.d(TAG, "performSetText: text='${text.take(20)}...' resourceId=$resourceId")
    perfProvider.serial("performSetText")

    try {
      perfProvider.startOperation("findNode")
      val targetNode = if (resourceId != null) {
        // Find node by resource-id
        findNodeByResourceId(rootInActiveWindow, resourceId)
      } else {
        // Find currently focused input node
        findFocusedEditableNode(rootInActiveWindow)
      }
      perfProvider.endOperation("findNode")

      if (targetNode == null) {
        perfProvider.end()
        val errorTime = System.currentTimeMillis()
        val error = if (resourceId != null) {
          "No node found with resource-id: $resourceId"
        } else {
          "No focused editable node found"
        }
        Log.w(TAG, error)
        serviceScope.launch {
          broadcastSetTextResult(requestId, false, error, errorTime - startTime)
        }
        return
      }

      perfProvider.startOperation("setText")
      val arguments = android.os.Bundle().apply {
        putCharSequence(android.view.accessibility.AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, text)
      }
      val success = targetNode.performAction(android.view.accessibility.AccessibilityNodeInfo.ACTION_SET_TEXT, arguments)
      targetNode.recycle()
      perfProvider.endOperation("setText")
      perfProvider.end()

      Log.d(TAG, "Set text completed: success=$success")

      // Trigger a hierarchy refresh after successful text input
      // This ensures the next observe will get the updated text
      if (success) {
        // Wait for UI to settle (no accessibility events for 50ms), then extract hierarchy
        // This dynamically adapts to how long validation/animations take, instead of using a fixed delay
        // Flow emissions are suppressed during this to prevent race conditions with debounced broadcasts
        val freshHierarchy = hierarchyDebouncer.extractAfterQuiescence(
          quiescenceMs = 50L,   // Wait for 50ms of no events
          maxWaitMs = 500L,     // But don't wait more than 500ms total
          pollIntervalMs = 10L  // Check every 10ms
        )
        if (freshHierarchy != null) {
          // Broadcast hierarchy synchronously (sync=true) to ensure it arrives before set_text_result
          kotlinx.coroutines.runBlocking {
            broadcastHierarchyUpdate(freshHierarchy, sync = true)
          }
        }
      }

      val totalTime = System.currentTimeMillis() - startTime
      Log.d(TAG, "Set text total time: ${totalTime}ms")

      // Broadcast set_text_result synchronously to ensure ordering after hierarchy
      kotlinx.coroutines.runBlocking {
        broadcastSetTextResult(requestId, success, if (success) null else "performAction returned false", totalTime)
      }
    } catch (e: Exception) {
      perfProvider.end()
      val errorTime = System.currentTimeMillis()
      Log.e(TAG, "Error performing set text", e)
      kotlinx.coroutines.runBlocking {
        broadcastSetTextResult(requestId, false, e.message, errorTime - startTime)
      }
    }
  }

  /**
   * Perform IME action using AccessibilityService.
   * This properly handles focus movement (next/previous) and keyboard actions (done/go/search/send).
   */
  private fun performImeAction(requestId: String?, action: String) {
    val startTime = System.currentTimeMillis()
    Log.d(TAG, "performImeAction: action='$action'")
    perfProvider.serial("performImeAction")

    try {
      perfProvider.startOperation("findFocusedNode")
      val root = rootInActiveWindow
      val focusedNode = findFocusedEditableNode(root)
      perfProvider.endOperation("findFocusedNode")

      if (focusedNode == null && action in listOf("next", "previous")) {
        perfProvider.end()
        val errorTime = System.currentTimeMillis()
        val error = "No focused editable node found for IME action"
        Log.w(TAG, error)
        serviceScope.launch {
          broadcastImeActionResult(requestId, action, false, error, errorTime - startTime)
        }
        return
      }

      perfProvider.startOperation("executeAction")
      val success = when (action) {
        "next" -> {
          // Find next focusable element and focus it
          val nextNode = findNextFocusableNode(root, focusedNode!!)
          if (nextNode != null) {
            val focusSuccess = nextNode.performAction(android.view.accessibility.AccessibilityNodeInfo.ACTION_FOCUS)
            nextNode.recycle()
            focusSuccess
          } else {
            Log.w(TAG, "No next focusable node found")
            false
          }
        }
        "previous" -> {
          // Find previous focusable element and focus it
          val prevNode = findPreviousFocusableNode(root, focusedNode!!)
          if (prevNode != null) {
            val focusSuccess = prevNode.performAction(android.view.accessibility.AccessibilityNodeInfo.ACTION_FOCUS)
            prevNode.recycle()
            focusSuccess
          } else {
            Log.w(TAG, "No previous focusable node found")
            false
          }
        }
        "done", "go", "send", "search" -> {
          // For these actions, trigger the IME's enter/submit action
          // This properly submits forms, navigates URLs, performs searches, etc.
          if (focusedNode != null && android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.R) {
            // API 30+: Use ACTION_IME_ENTER for proper IME action handling
            @Suppress("NewApi")
            val actionId = android.view.accessibility.AccessibilityNodeInfo.AccessibilityAction.ACTION_IME_ENTER.id
            val imeResult = focusedNode.performAction(actionId)
            Log.d(TAG, "ACTION_IME_ENTER result: $imeResult")
            imeResult
          } else if (focusedNode != null) {
            // Pre-API 30: Fall back to pressing Enter key via input shell command
            // This is less reliable but works on older devices
            Log.d(TAG, "Pre-API 30: falling back to KEYCODE_ENTER")
            try {
              Runtime.getRuntime().exec(arrayOf("input", "keyevent", "66")).waitFor() == 0
            } catch (e: Exception) {
              Log.e(TAG, "Failed to send KEYCODE_ENTER", e)
              false
            }
          } else {
            // No focused node - fall back to global back action
            Log.w(TAG, "No focused node for IME action, falling back to GLOBAL_ACTION_BACK")
            performGlobalAction(GLOBAL_ACTION_BACK)
          }
        }
        else -> {
          Log.w(TAG, "Unknown IME action: $action")
          false
        }
      }
      perfProvider.endOperation("executeAction")

      focusedNode?.recycle()
      perfProvider.end()

      Log.d(TAG, "IME action completed: success=$success")

      // Wait for UI to settle, then extract fresh hierarchy
      if (success) {
        val freshHierarchy = hierarchyDebouncer.extractAfterQuiescence(
          quiescenceMs = 50L,
          maxWaitMs = 500L,
          pollIntervalMs = 10L
        )
        if (freshHierarchy != null) {
          kotlinx.coroutines.runBlocking {
            broadcastHierarchyUpdate(freshHierarchy, sync = true)
          }
        }
      }

      val totalTime = System.currentTimeMillis() - startTime
      Log.d(TAG, "IME action total time: ${totalTime}ms")

      kotlinx.coroutines.runBlocking {
        broadcastImeActionResult(requestId, action, success, if (success) null else "Action failed", totalTime)
      }
    } catch (e: Exception) {
      perfProvider.end()
      val errorTime = System.currentTimeMillis()
      Log.e(TAG, "Error performing IME action", e)
      kotlinx.coroutines.runBlocking {
        broadcastImeActionResult(requestId, action, false, e.message, errorTime - startTime)
      }
    }
  }

  /**
   * Perform select all text using AccessibilityService's ACTION_SET_SELECTION.
   * This is significantly faster than using ADB double-tap gestures.
   */
  private fun performSelectAll(requestId: String?) {
    val startTime = System.currentTimeMillis()
    Log.d(TAG, "performSelectAll")
    perfProvider.serial("performSelectAll")

    try {
      perfProvider.startOperation("findFocusedNode")
      val focusedNode = findFocusedEditableNode(rootInActiveWindow)
      perfProvider.endOperation("findFocusedNode")

      if (focusedNode == null) {
        perfProvider.end()
        val errorTime = System.currentTimeMillis()
        val error = "No focused editable node found"
        Log.w(TAG, error)
        kotlinx.coroutines.runBlocking {
          broadcastSelectAllResult(requestId, false, error, errorTime - startTime)
        }
        return
      }

      perfProvider.startOperation("setSelection")
      // Get the text length to set selection from 0 to end
      val text = focusedNode.text
      val textLength = text?.length ?: 0

      val success = if (textLength > 0) {
        // Use ACTION_SET_SELECTION with start=0 and end=textLength to select all
        val arguments = android.os.Bundle().apply {
          putInt(android.view.accessibility.AccessibilityNodeInfo.ACTION_ARGUMENT_SELECTION_START_INT, 0)
          putInt(android.view.accessibility.AccessibilityNodeInfo.ACTION_ARGUMENT_SELECTION_END_INT, textLength)
        }
        focusedNode.performAction(android.view.accessibility.AccessibilityNodeInfo.ACTION_SET_SELECTION, arguments)
      } else {
        // No text to select
        Log.d(TAG, "No text in focused node to select")
        true // Consider it a success - nothing to select
      }

      focusedNode.recycle()
      perfProvider.endOperation("setSelection")
      perfProvider.end()

      Log.d(TAG, "Select all completed: success=$success, textLength=$textLength")

      val totalTime = System.currentTimeMillis() - startTime
      Log.d(TAG, "Select all total time: ${totalTime}ms")

      kotlinx.coroutines.runBlocking {
        broadcastSelectAllResult(requestId, success, if (success) null else "performAction returned false", totalTime)
      }
    } catch (e: Exception) {
      perfProvider.end()
      val errorTime = System.currentTimeMillis()
      Log.e(TAG, "Error performing select all", e)
      kotlinx.coroutines.runBlocking {
        broadcastSelectAllResult(requestId, false, e.message, errorTime - startTime)
      }
    }
  }

  /**
   * Perform a node action using AccessibilityService.
   * Supports actions like long_click on a specific resource-id.
   */
  private fun performNodeAction(requestId: String?, action: String, resourceId: String?) {
    val startTime = System.currentTimeMillis()
    Log.d(TAG, "performNodeAction: action='$action' resourceId=$resourceId")
    perfProvider.serial("performNodeAction")

    try {
      perfProvider.startOperation("findNode")
      val targetNode = if (resourceId != null) {
        findNodeByResourceId(rootInActiveWindow, resourceId)
      } else {
        rootInActiveWindow?.findFocus(android.view.accessibility.AccessibilityNodeInfo.FOCUS_ACCESSIBILITY)
      }
      perfProvider.endOperation("findNode")

      if (targetNode == null) {
        perfProvider.end()
        val errorTime = System.currentTimeMillis()
        val error = if (resourceId != null) {
          "No node found with resource-id: $resourceId"
        } else {
          "No focused node found for action"
        }
        Log.w(TAG, error)
        serviceScope.launch {
          broadcastActionResult(requestId, action, false, error, errorTime - startTime)
        }
        return
      }

      val actionId = when (action) {
        "long_click" -> android.view.accessibility.AccessibilityNodeInfo.ACTION_LONG_CLICK
        "click" -> android.view.accessibility.AccessibilityNodeInfo.ACTION_CLICK
        "focus" -> android.view.accessibility.AccessibilityNodeInfo.ACTION_FOCUS
        else -> null
      }

      if (actionId == null) {
        perfProvider.end()
        targetNode.recycle()
        val errorTime = System.currentTimeMillis()
        val error = "Unsupported action: $action"
        Log.w(TAG, error)
        serviceScope.launch {
          broadcastActionResult(requestId, action, false, error, errorTime - startTime)
        }
        return
      }

      perfProvider.startOperation("performAction")
      val success = targetNode.performAction(actionId)
      targetNode.recycle()
      perfProvider.endOperation("performAction")
      perfProvider.end()

      Log.d(TAG, "Action completed: action=$action success=$success")

      if (success) {
        val freshHierarchy = hierarchyDebouncer.extractAfterQuiescence(
          quiescenceMs = 50L,
          maxWaitMs = 500L,
          pollIntervalMs = 10L
        )
        if (freshHierarchy != null) {
          kotlinx.coroutines.runBlocking {
            broadcastHierarchyUpdate(freshHierarchy, sync = true)
          }
        }
      }

      val totalTime = System.currentTimeMillis() - startTime
      kotlinx.coroutines.runBlocking {
        broadcastActionResult(requestId, action, success, if (success) null else "performAction returned false", totalTime)
      }
    } catch (e: Exception) {
      perfProvider.end()
      val errorTime = System.currentTimeMillis()
      Log.e(TAG, "Error performing node action", e)
      kotlinx.coroutines.runBlocking {
        broadcastActionResult(requestId, action, false, e.message, errorTime - startTime)
      }
    }
  }

  /**
   * Find the next focusable node after the given node in document order.
   */
  private fun findNextFocusableNode(
    root: android.view.accessibility.AccessibilityNodeInfo?,
    currentNode: android.view.accessibility.AccessibilityNodeInfo
  ): android.view.accessibility.AccessibilityNodeInfo? {
    if (root == null) return null

    // Collect all focusable editable nodes in document order
    val focusableNodes = mutableListOf<android.view.accessibility.AccessibilityNodeInfo>()
    collectFocusableNodes(root, focusableNodes)

    // Find current node's position and return the next one
    var foundCurrent = false
    for (node in focusableNodes) {
      if (foundCurrent) {
        // This is the next node - return it (don't recycle it)
        // Recycle all remaining nodes
        focusableNodes.forEach { n ->
          if (n != node) n.recycle()
        }
        return node
      }
      if (isSameNode(node, currentNode)) {
        foundCurrent = true
      }
    }

    // If no next node found, recycle all collected nodes
    focusableNodes.forEach { it.recycle() }
    return null
  }

  /**
   * Find the previous focusable node before the given node in document order.
   */
  private fun findPreviousFocusableNode(
    root: android.view.accessibility.AccessibilityNodeInfo?,
    currentNode: android.view.accessibility.AccessibilityNodeInfo
  ): android.view.accessibility.AccessibilityNodeInfo? {
    if (root == null) return null

    // Collect all focusable editable nodes in document order
    val focusableNodes = mutableListOf<android.view.accessibility.AccessibilityNodeInfo>()
    collectFocusableNodes(root, focusableNodes)

    // Find current node's position and return the previous one
    var previousNode: android.view.accessibility.AccessibilityNodeInfo? = null
    for (node in focusableNodes) {
      if (isSameNode(node, currentNode)) {
        // Recycle all nodes except the previous one
        focusableNodes.forEach { n ->
          if (n != previousNode) n.recycle()
        }
        return previousNode
      }
      previousNode?.recycle()
      previousNode = node
    }

    // If current node not found, recycle all
    focusableNodes.forEach { it.recycle() }
    return null
  }

  /**
   * Collect all focusable and editable nodes in document order (pre-order traversal).
   */
  private fun collectFocusableNodes(
    node: android.view.accessibility.AccessibilityNodeInfo,
    result: MutableList<android.view.accessibility.AccessibilityNodeInfo>
  ) {
    // A node is a valid IME target if it's editable and focusable
    if (node.isEditable && node.isFocusable) {
      // Create a copy to add to our list (we'll recycle the originals as we traverse)
      result.add(android.view.accessibility.AccessibilityNodeInfo.obtain(node))
    }

    // Traverse children in order
    for (i in 0 until node.childCount) {
      val child = node.getChild(i) ?: continue
      collectFocusableNodes(child, result)
      child.recycle()
    }
  }

  /**
   * Check if two AccessibilityNodeInfo objects refer to the same node.
   */
  private fun isSameNode(
    node1: android.view.accessibility.AccessibilityNodeInfo,
    node2: android.view.accessibility.AccessibilityNodeInfo
  ): Boolean {
    // Compare by bounds and text/id since we can't reliably compare node objects directly
    val bounds1 = android.graphics.Rect()
    val bounds2 = android.graphics.Rect()
    node1.getBoundsInScreen(bounds1)
    node2.getBoundsInScreen(bounds2)
    return bounds1 == bounds2 &&
           node1.viewIdResourceName == node2.viewIdResourceName &&
           node1.text?.toString() == node2.text?.toString()
  }

  /**
   * Find a node by resource-id, searching recursively through the hierarchy.
   */
  private fun findNodeByResourceId(root: android.view.accessibility.AccessibilityNodeInfo?, resourceId: String): android.view.accessibility.AccessibilityNodeInfo? {
    if (root == null) return null

    // Check if this node matches
    val nodeResourceId = root.viewIdResourceName
    if (nodeResourceId != null && (nodeResourceId == resourceId || nodeResourceId.endsWith(":id/$resourceId"))) {
      return root
    }

    // Search children
    for (i in 0 until root.childCount) {
      val child = root.getChild(i) ?: continue
      val found = findNodeByResourceId(child, resourceId)
      if (found != null) {
        if (found != child) {
          child.recycle()
        }
        return found
      }
      child.recycle()
    }

    return null
  }

  /**
   * Find the currently focused editable node.
   */
  private fun findFocusedEditableNode(root: android.view.accessibility.AccessibilityNodeInfo?): android.view.accessibility.AccessibilityNodeInfo? {
    if (root == null) return null

    // First try to find the input-focused node
    val focusedNode = root.findFocus(android.view.accessibility.AccessibilityNodeInfo.FOCUS_INPUT)
    if (focusedNode != null && focusedNode.isEditable) {
      return focusedNode
    }
    focusedNode?.recycle()

    // Fallback: search for any focused editable node in hierarchy
    return findFocusedEditableInHierarchy(root)
  }

  /**
   * Recursively search for a focused editable node in the hierarchy.
   */
  private fun findFocusedEditableInHierarchy(node: android.view.accessibility.AccessibilityNodeInfo?): android.view.accessibility.AccessibilityNodeInfo? {
    if (node == null) return null

    // Check if this node is focused and editable
    if (node.isFocused && node.isEditable) {
      return node
    }

    // Search children
    for (i in 0 until node.childCount) {
      val child = node.getChild(i) ?: continue
      val found = findFocusedEditableInHierarchy(child)
      if (found != null) {
        if (found != child) {
          child.recycle()
        }
        return found
      }
      child.recycle()
    }

    return null
  }

  /** Broadcast set text result to WebSocket clients */
  private suspend fun broadcastSetTextResult(
    requestId: String?,
    success: Boolean,
    error: String?,
    totalTimeMs: Long
  ) {
    if (!::webSocketServer.isInitialized || !webSocketServer.isRunning()) {
      Log.d(TAG, "WebSocket server not running, skipping set text result broadcast")
      return
    }

    try {
      webSocketServer.broadcastWithPerf { perfTiming ->
        buildString {
          append("""{"type":"set_text_result","timestamp":${System.currentTimeMillis()}""")
          if (requestId != null) {
            append(""","requestId":"$requestId"""")
          }
          append(""","success":$success""")
          append(""","totalTimeMs":$totalTimeMs""")
          if (error != null) {
            append(""","error":"$error"""")
          }
          if (perfTiming != null) {
            append(""","perfTiming":$perfTiming""")
          }
          append("}")
        }
      }
      Log.d(TAG, "Broadcasted set text result to ${webSocketServer.getConnectionCount()} clients")
    } catch (e: Exception) {
      Log.e(TAG, "Error broadcasting set text result", e)
    }
  }

  /** Broadcast IME action result to WebSocket clients */
  private suspend fun broadcastImeActionResult(
    requestId: String?,
    action: String,
    success: Boolean,
    error: String?,
    totalTimeMs: Long
  ) {
    if (!::webSocketServer.isInitialized || !webSocketServer.isRunning()) {
      Log.d(TAG, "WebSocket server not running, skipping IME action result broadcast")
      return
    }

    try {
      webSocketServer.broadcastWithPerf { perfTiming ->
        buildString {
          append("""{"type":"ime_action_result","timestamp":${System.currentTimeMillis()}""")
          if (requestId != null) {
            append(""","requestId":"$requestId"""")
          }
          append(""","action":"$action"""")
          append(""","success":$success""")
          append(""","totalTimeMs":$totalTimeMs""")
          if (error != null) {
            append(""","error":"$error"""")
          }
          if (perfTiming != null) {
            append(""","perfTiming":$perfTiming""")
          }
          append("}")
        }
      }
      Log.d(TAG, "Broadcasted IME action result to ${webSocketServer.getConnectionCount()} clients")
    } catch (e: Exception) {
      Log.e(TAG, "Error broadcasting IME action result", e)
    }
  }

  /** Broadcast select all result to WebSocket clients */
  private suspend fun broadcastSelectAllResult(
    requestId: String?,
    success: Boolean,
    error: String?,
    totalTimeMs: Long
  ) {
    if (!::webSocketServer.isInitialized || !webSocketServer.isRunning()) {
      Log.d(TAG, "WebSocket server not running, skipping select all result broadcast")
      return
    }

    try {
      webSocketServer.broadcastWithPerf { perfTiming ->
        buildString {
          append("""{"type":"select_all_result","timestamp":${System.currentTimeMillis()}""")
          if (requestId != null) {
            append(""","requestId":"$requestId"""")
          }
          append(""","success":$success""")
          append(""","totalTimeMs":$totalTimeMs""")
          if (error != null) {
            append(""","error":"$error"""")
          }
          if (perfTiming != null) {
            append(""","perfTiming":$perfTiming""")
          }
          append("}")
        }
      }
      Log.d(TAG, "Broadcasted select all result to ${webSocketServer.getConnectionCount()} clients")
    } catch (e: Exception) {
      Log.e(TAG, "Error broadcasting select all result", e)
    }
  }

  /** Broadcast action result to WebSocket clients */
  private suspend fun broadcastActionResult(
    requestId: String?,
    action: String,
    success: Boolean,
    error: String?,
    totalTimeMs: Long
  ) {
    if (!::webSocketServer.isInitialized || !webSocketServer.isRunning()) {
      Log.d(TAG, "WebSocket server not running, skipping action result broadcast")
      return
    }

    try {
      webSocketServer.broadcastWithPerf { perfTiming ->
        buildString {
          append("""{"type":"action_result","timestamp":${System.currentTimeMillis()}""")
          if (requestId != null) {
            append(""","requestId":"$requestId"""")
          }
          append(""","action":"$action"""")
          append(""","success":$success""")
          append(""","totalTimeMs":$totalTimeMs""")
          if (error != null) {
            append(""","error":"$error"""")
          }
          if (perfTiming != null) {
            append(""","perfTiming":$perfTiming""")
          }
          append("}")
        }
      }
      Log.d(TAG, "Broadcasted action result to ${webSocketServer.getConnectionCount()} clients")
    } catch (e: Exception) {
      Log.e(TAG, "Error broadcasting action result", e)
    }
  }

  /** Broadcast swipe result to WebSocket clients */
  private suspend fun broadcastSwipeResult(
    requestId: String?,
    success: Boolean,
    error: String?,
    totalTimeMs: Long,
    gestureTimeMs: Long?
  ) {
    if (!::webSocketServer.isInitialized || !webSocketServer.isRunning()) {
      Log.d(TAG, "WebSocket server not running, skipping swipe result broadcast")
      return
    }

    try {
      webSocketServer.broadcastWithPerf { perfTiming ->
        buildString {
          append("""{"type":"swipe_result","timestamp":${System.currentTimeMillis()}""")
          if (requestId != null) {
            append(""","requestId":"$requestId"""")
          }
          append(""","success":$success""")
          append(""","totalTimeMs":$totalTimeMs""")
          if (gestureTimeMs != null) {
            append(""","gestureTimeMs":$gestureTimeMs""")
          }
          if (error != null) {
            append(""","error":"$error"""")
          }
          if (perfTiming != null) {
            append(""","perfTiming":$perfTiming""")
          }
          append("}")
        }
      }
      Log.d(TAG, "Broadcasted swipe result to ${webSocketServer.getConnectionCount()} clients")
    } catch (e: Exception) {
      Log.e(TAG, "Error broadcasting swipe result", e)
    }
  }

  /** Broadcast screenshot to WebSocket clients */
  private fun broadcastScreenshot(requestId: String?) {
    if (!::webSocketServer.isInitialized || !webSocketServer.isRunning()) {
      Log.d(TAG, "WebSocket server not running, skipping screenshot broadcast")
      return
    }

    serviceScope.launch {
      try {
        val base64Image = takeScreenshotAsync()
        if (base64Image != null) {
          val message = buildString {
            append("""{"type":"screenshot","timestamp":${System.currentTimeMillis()}""")
            if (requestId != null) {
              append(""","requestId":"$requestId"""")
            }
            append(""","format":"jpeg","data":"$base64Image"}""")
          }
          webSocketServer.broadcast(message)
          Log.d(TAG, "Broadcasted screenshot to ${webSocketServer.getConnectionCount()} clients")
        } else {
          val errorMessage = buildString {
            append("""{"type":"screenshot_error","timestamp":${System.currentTimeMillis()}""")
            if (requestId != null) {
              append(""","requestId":"$requestId"""")
            }
            append(""","error":"Failed to capture screenshot"}""")
          }
          webSocketServer.broadcast(errorMessage)
        }
      } catch (e: Exception) {
        Log.e(TAG, "Error broadcasting screenshot", e)
      }
    }
  }

  /** Broadcast navigation event to WebSocket clients */
  private suspend fun broadcastNavigationEvent(event: TimestampedNavigationEvent) {
    if (!::webSocketServer.isInitialized || !webSocketServer.isRunning()) {
      Log.d(TAG, "WebSocket server not running, skipping navigation event broadcast")
      return
    }

    try {
      // Serialize the event to JSON
      val eventJson = jsonCompact.encodeToString(event)

      webSocketServer.broadcastWithPerf { perfTiming ->
        buildString {
          append("""{"type":"navigation_event","timestamp":${System.currentTimeMillis()},"event":""")
          append(eventJson)
          if (perfTiming != null) {
            append(""","perfTiming":$perfTiming""")
          }
          append("}")
        }
      }
      Log.d(TAG, "Broadcasted navigation event to ${webSocketServer.getConnectionCount()} clients: ${event.destination}")
    } catch (e: Exception) {
      Log.e(TAG, "Error broadcasting navigation event", e)
    }
  }
}
