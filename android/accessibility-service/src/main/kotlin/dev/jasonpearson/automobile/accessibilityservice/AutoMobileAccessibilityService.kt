package dev.jasonpearson.automobile.accessibilityservice

import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.GestureDescription
import android.annotation.SuppressLint
import android.content.BroadcastReceiver
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.graphics.Bitmap
import android.graphics.Path
import android.graphics.Rect
import android.os.Build
import android.util.Base64
import android.util.DisplayMetrics
import android.util.Log
import android.view.Display
import android.view.WindowManager
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo
import dev.jasonpearson.automobile.accessibilityservice.models.ElementBounds
import dev.jasonpearson.automobile.accessibilityservice.models.InteractionElement
import dev.jasonpearson.automobile.accessibilityservice.models.InteractionEvent
import dev.jasonpearson.automobile.accessibilityservice.models.RecompositionSnapshot
import dev.jasonpearson.automobile.accessibilityservice.models.ScreenDimensions
import dev.jasonpearson.automobile.accessibilityservice.models.UIElementInfo
import dev.jasonpearson.automobile.accessibilityservice.models.ViewHierarchy
import dev.jasonpearson.automobile.accessibilityservice.perf.PerfProvider
import dev.jasonpearson.automobile.accessibilityservice.perf.SystemTimeProvider
import dev.jasonpearson.automobile.accessibilityservice.perf.TimeProvider
import dev.jasonpearson.automobile.sdk.AutoMobileSDK
import java.io.ByteArrayOutputStream
import kotlin.coroutines.resume
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
  private val recompositionStore = RecompositionStore()
  private val viewHierarchyExtractor = ViewHierarchyExtractor(recompositionStore)
  private val json = Json { prettyPrint = true }
  private val jsonCompact = Json { prettyPrint = false }
  private val jsonLenient = Json { ignoreUnknownKeys = true }
  private val perfProvider = PerfProvider.instance
  private val timeProvider: TimeProvider = SystemTimeProvider()
  private lateinit var webSocketServer: WebSocketServer
  private lateinit var hierarchyDebouncer: HierarchyDebouncer
  private val navigationEventAccumulator = NavigationEventAccumulator()
  private val clipboardManager by lazy {
    getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
  }
  private var lastWindowClassName: String? = null

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
            navigationEventAccumulator.addEvent(
                destination,
                source,
                arguments,
                metadata,
                applicationId,
            )
          } catch (e: Exception) {
            Log.e(TAG, "Error handling navigation event broadcast", e)
          }
        }
      }

  private val recompositionReceiver =
      object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
          if (intent == null || intent.action != AutoMobileSDK.ACTION_RECOMPOSITION_SNAPSHOT) {
            return
          }

          val payload = intent.getStringExtra(AutoMobileSDK.EXTRA_RECOMPOSITION_SNAPSHOT) ?: return
          try {
            val snapshot = jsonLenient.decodeFromString(RecompositionSnapshot.serializer(), payload)
            recompositionStore.updateSnapshot(snapshot)
          } catch (e: Exception) {
            Log.e(TAG, "Failed to parse recomposition snapshot", e)
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
        @SuppressLint("UnspecifiedRegisterReceiverFlag")
        registerReceiver(commandReceiver, commandFilter)
      }

      // Register broadcast receiver for navigation events
      val navigationFilter =
          IntentFilter().apply { addAction(AutoMobileSDK.ACTION_NAVIGATION_EVENT) }

      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
        registerReceiver(navigationEventReceiver, navigationFilter, RECEIVER_EXPORTED)
      } else {
        @SuppressLint("UnspecifiedRegisterReceiverFlag")
        registerReceiver(navigationEventReceiver, navigationFilter)
      }
      Log.d(TAG, "Navigation event receiver registered")

      // Register broadcast receiver for recomposition snapshots
      val recompositionFilter =
          IntentFilter().apply { addAction(AutoMobileSDK.ACTION_RECOMPOSITION_SNAPSHOT) }

      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
        registerReceiver(recompositionReceiver, recompositionFilter, RECEIVER_EXPORTED)
      } else {
        @SuppressLint("UnspecifiedRegisterReceiverFlag")
        registerReceiver(recompositionReceiver, recompositionFilter)
      }
      Log.d(TAG, "Recomposition receiver registered")

      // Initialize the navigation event accumulator
      navigationEventAccumulator.initialize()
      Log.d(TAG, "Navigation event accumulator initialized")

      // Subscribe to navigation events and broadcast them
      navigationEventJob =
          navigationEventAccumulator.latestEvent
              .onEach { event ->
                if (event != null) {
                  Log.d(TAG, "Navigation event: ${event.destination} at ${event.timestamp}")
                  broadcastNavigationEvent(event)
                }
              }
              .launchIn(serviceScope)

      // Initialize the smart hierarchy debouncer with structural hash comparison
      hierarchyDebouncer =
          HierarchyDebouncer(
              scope = serviceScope,
              timeProvider = timeProvider,
              perfProvider = perfProvider,
              quickDebounceMs = 5L,
              animationSkipWindowMs = 100L,
              extractHierarchy = { disableAllFiltering ->
                extractHierarchyDirect(disableAllFiltering)
              },
          )

      // Subscribe to hierarchy updates from the debouncer
      hierarchyFlowJob =
          hierarchyDebouncer.hierarchyFlow
              .onEach { result ->
                when (result) {
                  is HierarchyResult.Changed -> {
                    Log.d(
                        TAG,
                        "Hierarchy changed (hash=${result.hash}, extraction=${result.extractionTimeMs}ms)",
                    )
                    writeHierarchyToFile(result.hierarchy)
                    broadcastHierarchyUpdate(result.hierarchy)
                  }
                  is HierarchyResult.Unchanged -> {
                    Log.d(
                        TAG,
                        "Hierarchy unchanged (animation mode, skipped=${result.skippedEventCount})",
                    )
                    // Still broadcast so clients get updated bounds
                    broadcastHierarchyUpdate(result.hierarchy)
                  }
                  is HierarchyResult.Error -> {
                    Log.w(TAG, "Hierarchy extraction error: ${result.message}")
                  }
                }
              }
              .launchIn(serviceScope)

      // Start WebSocket server with hierarchy, screenshot, swipe, text input, IME action,
      // and clipboard callbacks
      webSocketServer =
          WebSocketServer(
              port = 8765,
              scope = serviceScope,
              onRequestHierarchy = { disableAllFiltering ->
                extractHierarchyNow(disableAllFiltering)
              },
              onRequestHierarchyIfStale = { sinceTimestamp ->
                hierarchyDebouncer.extractIfStale(sinceTimestamp)
              },
              onRequestScreenshot = { requestId -> broadcastScreenshot(requestId) },
              onRequestSwipe = { requestId, x1, y1, x2, y2, duration ->
                performSwipe(requestId, x1, y1, x2, y2, duration)
              },
              onRequestTwoFingerSwipe = { requestId, x1, y1, x2, y2, duration, offset ->
                performTwoFingerSwipe(requestId, x1, y1, x2, y2, duration, offset)
              },
              onRequestPinch = {
                  requestId,
                  centerX,
                  centerY,
                  distanceStart,
                  distanceEnd,
                  rotationDegrees,
                  duration ->
                performPinch(
                    requestId,
                    centerX,
                    centerY,
                    distanceStart,
                    distanceEnd,
                    rotationDegrees,
                    duration,
                )
              },
              onRequestSetText = { requestId, text, resourceId ->
                performSetText(requestId, text, resourceId)
              },
              onRequestImeAction = { requestId, action -> performImeAction(requestId, action) },
              onRequestSelectAll = { requestId -> performSelectAll(requestId) },
              onRequestAction = { requestId, action, resourceId ->
                performNodeAction(requestId, action, resourceId)
              },
              onRequestClipboard = { requestId, action, text ->
                performClipboard(requestId, action, text)
              },
              onSetRecompositionTracking = { enabled -> setRecompositionTrackingEnabled(enabled) },
              onGetCurrentFocus = { requestId -> handleGetCurrentFocus(requestId) },
              onGetTraversalOrder = { requestId -> handleGetTraversalOrder(requestId) },
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

    try {
      unregisterReceiver(recompositionReceiver)
    } catch (e: Exception) {
      Log.e(TAG, "Error unregistering recomposition receiver", e)
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

  private fun setRecompositionTrackingEnabled(enabled: Boolean) {
    recompositionStore.setEnabled(enabled)
    broadcastRecompositionControl(enabled)
    Log.d(TAG, "Recomposition tracking ${if (enabled) "enabled" else "disabled"}")
  }

  private fun broadcastRecompositionControl(enabled: Boolean) {
    try {
      val intent =
          Intent(AutoMobileSDK.ACTION_RECOMPOSITION_CONTROL).apply {
            putExtra(AutoMobileSDK.EXTRA_RECOMPOSITION_ENABLED, enabled)
          }
      sendBroadcast(intent)
    } catch (e: Exception) {
      Log.e(TAG, "Failed to broadcast recomposition control", e)
    }
  }

  override fun onAccessibilityEvent(event: AccessibilityEvent?) {
    if (event == null) {
      Log.w(TAG, "onAccessibilityEvent: no event")
      return
    }

    try {
      // Log accessibility events for debugging (reduced verbosity)
      Log.v(TAG, "Accessibility event: ${event.eventType}, package: ${event.packageName}")

      if (event.eventType == AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED) {
        lastWindowClassName = event.className?.toString()
      }

      when (event.eventType) {
        AccessibilityEvent.TYPE_VIEW_CLICKED -> recordInteractionEvent(event, "tap")
        AccessibilityEvent.TYPE_VIEW_LONG_CLICKED -> recordInteractionEvent(event, "longPress")
        AccessibilityEvent.TYPE_VIEW_TEXT_CHANGED -> recordInteractionEvent(event, "inputText")
        AccessibilityEvent.TYPE_VIEW_SCROLLED -> recordInteractionEvent(event, "swipe")
      }

      // Delegate to the smart debouncer for content/window changes
      // The debouncer uses structural hash comparison to detect animation vs real changes
      if (
          event.eventType == AccessibilityEvent.TYPE_WINDOW_CONTENT_CHANGED ||
              event.eventType == AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED
      ) {
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

  private fun recordInteractionEvent(event: AccessibilityEvent, type: String) {
    if (!::webSocketServer.isInitialized || !webSocketServer.isRunning()) {
      return
    }

    val source = event.source
    val bounds =
        source?.let {
          val rect = Rect()
          it.getBoundsInScreen(rect)
          ElementBounds(rect)
        }
    val element =
        source?.let {
          InteractionElement(
              text = it.text?.toString(),
              contentDescription = it.contentDescription?.toString(),
              resourceId = it.viewIdResourceName,
              className = it.className?.toString(),
              bounds = bounds,
          )
        }
    source?.recycle()

    val textValue =
        if (type == "inputText") {
          val textList = event.text
          if (textList.isNullOrEmpty()) null
          else textList.joinToString(separator = "") { it.toString() }
        } else {
          null
        }

    val scrollDeltaX =
        if (type == "swipe" && Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
          event.scrollDeltaX
        } else {
          null
        }
    val scrollDeltaY =
        if (type == "swipe" && Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
          event.scrollDeltaY
        } else {
          null
        }

    val interaction =
        InteractionEvent(
            type = type,
            timestamp = System.currentTimeMillis(),
            packageName = event.packageName?.toString(),
            screenClassName = lastWindowClassName,
            element = element,
            text = textValue,
            scrollDeltaX = scrollDeltaX,
            scrollDeltaY = scrollDeltaY,
        )

    serviceScope.launch {
      try {
        broadcastInteractionEvent(interaction)
      } catch (e: Exception) {
        Log.e(TAG, "Error broadcasting interaction event", e)
      }
    }
  }

  private suspend fun broadcastInteractionEvent(interaction: InteractionEvent) {
    if (!::webSocketServer.isInitialized || !webSocketServer.isRunning()) {
      Log.d(TAG, "WebSocket server not running, skipping interaction event broadcast")
      return
    }

    val eventJson = jsonCompact.encodeToString(interaction)
    webSocketServer.broadcast(
        """{"type":"interaction_event","timestamp":${interaction.timestamp},"event":$eventJson}"""
    )
  }

  /** Get current screen dimensions for offscreen filtering. */
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
   * Direct hierarchy extraction without debouncing. Used by the HierarchyDebouncer. Extracts from
   * all visible windows to capture popups, toolbars, etc.
   */
  private fun extractHierarchyDirect(disableAllFiltering: Boolean = false): ViewHierarchy? {
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
      Log.d(
          TAG,
          "Extracting from ${allWindows.size} windows (disableAllFiltering: $disableAllFiltering)",
      )
      viewHierarchyExtractor.extractFromAllWindows(
          allWindows,
          rootNode,
          null,
          screenDimensions,
          true,
          disableAllFiltering,
      )
    } else {
      viewHierarchyExtractor.extractFromActiveWindow(
          rootNode,
          null,
          screenDimensions,
          true,
          disableAllFiltering,
      )
    }
  }

  /**
   * Extract hierarchy immediately and broadcast, bypassing the debouncer. Used for explicit
   * WebSocket requests where we need fresh data immediately.
   */
  private fun extractHierarchyNow(disableAllFiltering: Boolean = false) {
    Log.d(TAG, "extractHierarchyNow (disableAllFiltering: $disableAllFiltering)")
    hierarchyDebouncer.extractNow(disableAllFiltering)
  }

  /** Writes the hierarchy to a file for synchronous access */
  private fun writeHierarchyToFile(
      hierarchy: ViewHierarchy,
      filename: String = HIERARCHY_FILE_NAME,
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
        val disableAllFiltering = intent.getBooleanExtra("disableAllFiltering", false)
        val hierarchy = extractHierarchy(textFilter, disableAllFiltering)
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

  private fun extractHierarchy(
      textFilter: String? = null,
      disableAllFiltering: Boolean = false,
  ): ViewHierarchy? {
    val allWindows = windows
    val rootNode = rootInActiveWindow
    val screenDimensions = getScreenDimensions()

    if (allWindows.isNullOrEmpty() && rootNode == null) {
      return null
    }

    return if (!allWindows.isNullOrEmpty()) {
      viewHierarchyExtractor.extractFromAllWindows(
          allWindows,
          rootNode,
          textFilter,
          screenDimensions,
          true,
          disableAllFiltering,
      )
    } else {
      viewHierarchyExtractor.extractFromActiveWindow(
          rootNode,
          textFilter,
          screenDimensions,
          true,
          disableAllFiltering,
      )
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
   *
   * @param sync If true, waits for delivery to all clients before returning. Use for critical
   *   ordering.
   */
  private suspend fun broadcastHierarchyUpdate(hierarchy: ViewHierarchy, sync: Boolean = false) {
    if (!::webSocketServer.isInitialized || !webSocketServer.isRunning()) {
      Log.d(TAG, "WebSocket server not running, skipping broadcast")
      return
    }

    try {
      val jsonString =
          perfProvider.track("serializeHierarchy") { jsonCompact.encodeToString(hierarchy) }

      // Debug: Check if text labels are in the serialized hierarchy
      val hasTapText = jsonString.contains("\"text\":\"Tap\"")
      val hasDiscoverText = jsonString.contains("\"text\":\"Discover\"")
      Log.d(
          TAG,
          "[BROADCAST] Hierarchy contains: Tap=$hasTapText, Discover=$hasDiscoverText, size=${jsonString.length}",
      )

      val messageBuilder: (kotlinx.serialization.json.JsonElement?) -> String = { perfTiming ->
        buildString {
          append(
              """{"type":"hierarchy_update","timestamp":${System.currentTimeMillis()},"data":$jsonString"""
          )
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
      Log.d(
          TAG,
          "Broadcasted hierarchy update to ${webSocketServer.getConnectionCount()} clients (sync=$sync)",
      )
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
        if (
            file.name.startsWith("hierarchy_") &&
                file.name.endsWith(".json") &&
                file.name != HIERARCHY_FILE_NAME
        ) {
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
   * Takes a screenshot and returns it as a base64-encoded JPEG string. Requires Android R (API 30)
   * or higher. Runs on IO dispatcher to avoid blocking the main thread.
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
        val bitmap =
            suspendCancellableCoroutine<Bitmap?> { continuation ->
              takeScreenshot(
                  Display.DEFAULT_DISPLAY,
                  mainExecutor,
                  object : TakeScreenshotCallback {
                    override fun onSuccess(screenshot: ScreenshotResult) {
                      val hardwareBitmap =
                          Bitmap.wrapHardwareBuffer(
                              screenshot.hardwareBuffer,
                              screenshot.colorSpace,
                          )
                      screenshot.hardwareBuffer.close()
                      continuation.resume(hardwareBitmap)
                    }

                    override fun onFailure(errorCode: Int) {
                      Log.e(TAG, "Screenshot failed with error code: $errorCode")
                      continuation.resume(null)
                    }
                  },
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

        Log.d(
            TAG,
            "Screenshot encoded: ${jpegBytes.size} bytes -> ${base64String.length} base64 chars in ${encodeTime}ms (total: ${totalTime}ms)",
        )

        base64String
      } catch (e: Exception) {
        Log.e(TAG, "Error taking screenshot", e)
        null
      }
    }
  }

  /**
   * Perform a swipe gesture using AccessibilityService's dispatchGesture API. This is significantly
   * faster than ADB's input swipe command.
   */
  private fun performSwipe(requestId: String?, x1: Int, y1: Int, x2: Int, y2: Int, duration: Long) {
    val startTime = System.currentTimeMillis()
    Log.d(TAG, "performSwipe: ($x1, $y1) -> ($x2, $y2) duration=${duration}ms")
    perfProvider.serial("performSwipe")

    try {
      // Create the swipe path
      perfProvider.startOperation("buildPath")
      val path =
          Path().apply {
            moveTo(x1.toFloat(), y1.toFloat())
            lineTo(x2.toFloat(), y2.toFloat())
          }

      // Build the gesture description
      val gesture =
          GestureDescription.Builder()
              .addStroke(GestureDescription.StrokeDescription(path, 0, duration))
              .build()
      perfProvider.endOperation("buildPath")

      val gestureBuiltTime = System.currentTimeMillis()
      Log.d(TAG, "Gesture built in ${gestureBuiltTime - startTime}ms")

      perfProvider.startOperation("dispatchGesture")
      // Dispatch the gesture
      val dispatched =
          dispatchGesture(
              gesture,
              object : GestureResultCallback() {
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
              },
              null,
          )

      if (!dispatched) {
        perfProvider.endOperation("dispatchGesture")
        perfProvider.end() // end performSwipe block
        val failTime = System.currentTimeMillis()
        Log.e(TAG, "Failed to dispatch swipe gesture")
        serviceScope.launch {
          broadcastSwipeResult(
              requestId,
              false,
              "Failed to dispatch gesture",
              failTime - startTime,
              null,
          )
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
   * Perform a two-finger swipe gesture for TalkBack mode scrolling. This allows scrolling content
   * without moving the TalkBack focus cursor.
   *
   * @param requestId Optional request ID for response correlation
   * @param x1 Starting X coordinate
   * @param y1 Starting Y coordinate
   * @param x2 Ending X coordinate
   * @param y2 Ending Y coordinate
   * @param duration Duration of the swipe in milliseconds
   * @param offset Horizontal offset between the two fingers (default 100px)
   */
  private fun performTwoFingerSwipe(
      requestId: String?,
      x1: Int,
      y1: Int,
      x2: Int,
      y2: Int,
      duration: Long,
      offset: Int = 100,
  ) {
    val startTime = System.currentTimeMillis()
    Log.d(
        TAG,
        "performTwoFingerSwipe: ($x1, $y1) -> ($x2, $y2) duration=${duration}ms, offset=${offset}px",
    )
    perfProvider.serial("performTwoFingerSwipe")

    try {
      // Create two parallel paths for the two fingers
      perfProvider.startOperation("buildPaths")
      val path1 =
          Path().apply {
            moveTo(x1.toFloat(), y1.toFloat())
            lineTo(x2.toFloat(), y2.toFloat())
          }

      val path2 =
          Path().apply {
            moveTo((x1 + offset).toFloat(), y1.toFloat())
            lineTo((x2 + offset).toFloat(), y2.toFloat())
          }

      // Build the gesture description with two strokes
      val gesture =
          GestureDescription.Builder()
              .addStroke(GestureDescription.StrokeDescription(path1, 0, duration))
              .addStroke(GestureDescription.StrokeDescription(path2, 0, duration))
              .build()
      perfProvider.endOperation("buildPaths")

      val gestureBuiltTime = System.currentTimeMillis()
      Log.d(TAG, "Two-finger gesture built in ${gestureBuiltTime - startTime}ms")

      perfProvider.startOperation("dispatchGesture")
      // Dispatch the gesture
      val dispatched =
          dispatchGesture(
              gesture,
              object : GestureResultCallback() {
                override fun onCompleted(gestureDescription: GestureDescription?) {
                  perfProvider.endOperation("dispatchGesture")
                  perfProvider.end() // end performTwoFingerSwipe block
                  val completedTime = System.currentTimeMillis()
                  val totalTime = completedTime - startTime
                  val gestureTime = completedTime - gestureBuiltTime
                  Log.d(
                      TAG,
                      "Two-finger swipe completed: gesture=${gestureTime}ms, total=${totalTime}ms",
                  )

                  // Broadcast success result
                  serviceScope.launch {
                    broadcastSwipeResult(requestId, true, null, totalTime, gestureTime)
                  }
                }

                override fun onCancelled(gestureDescription: GestureDescription?) {
                  perfProvider.endOperation("dispatchGesture")
                  perfProvider.end() // end performTwoFingerSwipe block
                  val cancelledTime = System.currentTimeMillis()
                  val totalTime = cancelledTime - startTime
                  Log.w(TAG, "Two-finger swipe cancelled after ${totalTime}ms")

                  // Broadcast cancelled result
                  serviceScope.launch {
                    broadcastSwipeResult(requestId, false, "Gesture was cancelled", totalTime, null)
                  }
                }
              },
              null,
          )

      if (!dispatched) {
        perfProvider.endOperation("dispatchGesture")
        perfProvider.end() // end performTwoFingerSwipe block
        val failTime = System.currentTimeMillis()
        Log.e(TAG, "Failed to dispatch two-finger swipe gesture")
        serviceScope.launch {
          broadcastSwipeResult(
              requestId,
              false,
              "Failed to dispatch gesture",
              failTime - startTime,
              null,
          )
        }
      }
    } catch (e: Exception) {
      perfProvider.end() // end performTwoFingerSwipe block
      val errorTime = System.currentTimeMillis()
      Log.e(TAG, "Error performing two-finger swipe", e)
      serviceScope.launch {
        broadcastSwipeResult(requestId, false, e.message, errorTime - startTime, null)
      }
    }
  }

  /** Perform a pinch gesture using AccessibilityService's dispatchGesture API. */
  private fun performPinch(
      requestId: String?,
      centerX: Int,
      centerY: Int,
      distanceStart: Int,
      distanceEnd: Int,
      rotationDegrees: Float,
      duration: Long,
  ) {
    val startTime = System.currentTimeMillis()
    Log.d(
        TAG,
        "performPinch: center=($centerX,$centerY) start=$distanceStart end=$distanceEnd rotation=$rotationDegrees duration=${duration}ms",
    )
    perfProvider.serial("performPinch")

    try {
      perfProvider.startOperation("buildPath")
      val startRadius = distanceStart / 2f
      val endRadius = distanceEnd / 2f
      val startAngle = 0.0
      val endAngle = Math.toRadians(rotationDegrees.toDouble())

      fun pointAt(radius: Float, angleRad: Double): Pair<Float, Float> {
        val x = centerX + (radius * kotlin.math.cos(angleRad)).toFloat()
        val y = centerY + (radius * kotlin.math.sin(angleRad)).toFloat()
        return x to y
      }

      val (startX1, startY1) = pointAt(startRadius, startAngle)
      val (startX2, startY2) = pointAt(startRadius, Math.PI + startAngle)
      val (endX1, endY1) = pointAt(endRadius, endAngle)
      val (endX2, endY2) = pointAt(endRadius, Math.PI + endAngle)

      val path1 =
          Path().apply {
            moveTo(startX1, startY1)
            lineTo(endX1, endY1)
          }
      val path2 =
          Path().apply {
            moveTo(startX2, startY2)
            lineTo(endX2, endY2)
          }

      val gesture =
          GestureDescription.Builder()
              .addStroke(GestureDescription.StrokeDescription(path1, 0, duration))
              .addStroke(GestureDescription.StrokeDescription(path2, 0, duration))
              .build()
      perfProvider.endOperation("buildPath")

      val gestureBuiltTime = System.currentTimeMillis()
      Log.d(TAG, "Pinch gesture built in ${gestureBuiltTime - startTime}ms")

      perfProvider.startOperation("dispatchGesture")
      val dispatched =
          dispatchGesture(
              gesture,
              object : GestureResultCallback() {
                override fun onCompleted(gestureDescription: GestureDescription?) {
                  perfProvider.endOperation("dispatchGesture")
                  perfProvider.end()
                  val completedTime = System.currentTimeMillis()
                  val totalTime = completedTime - startTime
                  val gestureTime = completedTime - gestureBuiltTime
                  Log.d(TAG, "Pinch completed: gesture=${gestureTime}ms, total=${totalTime}ms")

                  serviceScope.launch {
                    broadcastPinchResult(requestId, true, null, totalTime, gestureTime)
                  }
                }

                override fun onCancelled(gestureDescription: GestureDescription?) {
                  perfProvider.endOperation("dispatchGesture")
                  perfProvider.end()
                  val cancelledTime = System.currentTimeMillis()
                  val totalTime = cancelledTime - startTime
                  Log.w(TAG, "Pinch cancelled after ${totalTime}ms")

                  serviceScope.launch {
                    broadcastPinchResult(
                        requestId,
                        false,
                        "Gesture was cancelled",
                        totalTime,
                        null,
                    )
                  }
                }
              },
              null,
          )

      if (!dispatched) {
        perfProvider.endOperation("dispatchGesture")
        perfProvider.end()
        val failTime = System.currentTimeMillis()
        Log.e(TAG, "Failed to dispatch pinch gesture")
        serviceScope.launch {
          broadcastPinchResult(
              requestId,
              false,
              "Failed to dispatch gesture",
              failTime - startTime,
              null,
          )
        }
      }
    } catch (e: Exception) {
      perfProvider.end()
      val errorTime = System.currentTimeMillis()
      Log.e(TAG, "Error performing pinch", e)
      serviceScope.launch {
        broadcastPinchResult(requestId, false, e.message, errorTime - startTime, null)
      }
    }
  }

  /**
   * Perform text input using AccessibilityService's ACTION_SET_TEXT. This is significantly faster
   * than ADB's input text command.
   */
  private fun performSetText(requestId: String?, text: String, resourceId: String?) {
    val startTime = System.currentTimeMillis()
    Log.d(TAG, "performSetText: text='${text.take(20)}...' resourceId=$resourceId")
    perfProvider.serial("performSetText")

    try {
      perfProvider.startOperation("findNode")
      val targetNode =
          if (resourceId != null) {
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
        val error =
            if (resourceId != null) {
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
      val arguments =
          android.os.Bundle().apply {
            putCharSequence(
                android.view.accessibility.AccessibilityNodeInfo
                    .ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE,
                text,
            )
          }
      val success =
          targetNode.performAction(
              android.view.accessibility.AccessibilityNodeInfo.ACTION_SET_TEXT,
              arguments,
          )
      targetNode.recycle()
      perfProvider.endOperation("setText")
      perfProvider.end()

      Log.d(TAG, "Set text completed: success=$success")

      // Trigger a hierarchy refresh after successful text input
      // This ensures the next observe will get the updated text
      if (success) {
        // Wait for UI to settle (no accessibility events for 50ms), then extract hierarchy
        // This dynamically adapts to how long validation/animations take, instead of using a fixed
        // delay
        // Flow emissions are suppressed during this to prevent race conditions with debounced
        // broadcasts
        val freshHierarchy =
            hierarchyDebouncer.extractAfterQuiescence(
                quiescenceMs = 50L, // Wait for 50ms of no events
                maxWaitMs = 500L, // But don't wait more than 500ms total
                pollIntervalMs = 10L, // Check every 10ms
            )
        if (freshHierarchy != null) {
          // Broadcast hierarchy synchronously (sync=true) to ensure it arrives before
          // set_text_result
          kotlinx.coroutines.runBlocking { broadcastHierarchyUpdate(freshHierarchy, sync = true) }
        }
      }

      val totalTime = System.currentTimeMillis() - startTime
      Log.d(TAG, "Set text total time: ${totalTime}ms")

      // Broadcast set_text_result synchronously to ensure ordering after hierarchy
      kotlinx.coroutines.runBlocking {
        broadcastSetTextResult(
            requestId,
            success,
            if (success) null else "performAction returned false",
            totalTime,
        )
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
   * Perform IME action using AccessibilityService. This properly handles focus movement
   * (next/previous) and keyboard actions (done/go/search/send).
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
      val success =
          when (action) {
            "next" -> {
              // Find next focusable element and focus it
              val nextNode = findNextFocusableNode(root, focusedNode!!)
              if (nextNode != null) {
                val focusSuccess =
                    nextNode.performAction(
                        android.view.accessibility.AccessibilityNodeInfo.ACTION_FOCUS
                    )
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
                val focusSuccess =
                    prevNode.performAction(
                        android.view.accessibility.AccessibilityNodeInfo.ACTION_FOCUS
                    )
                prevNode.recycle()
                focusSuccess
              } else {
                Log.w(TAG, "No previous focusable node found")
                false
              }
            }
            "done",
            "go",
            "send",
            "search" -> {
              // For these actions, trigger the IME's enter/submit action
              // This properly submits forms, navigates URLs, performs searches, etc.
              if (
                  focusedNode != null &&
                      android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.R
              ) {
                // API 30+: Use ACTION_IME_ENTER for proper IME action handling
                @Suppress("NewApi")
                val actionId =
                    android.view.accessibility.AccessibilityNodeInfo.AccessibilityAction
                        .ACTION_IME_ENTER
                        .id
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
        val freshHierarchy =
            hierarchyDebouncer.extractAfterQuiescence(
                quiescenceMs = 50L,
                maxWaitMs = 500L,
                pollIntervalMs = 10L,
            )
        if (freshHierarchy != null) {
          kotlinx.coroutines.runBlocking { broadcastHierarchyUpdate(freshHierarchy, sync = true) }
        }
      }

      val totalTime = System.currentTimeMillis() - startTime
      Log.d(TAG, "IME action total time: ${totalTime}ms")

      kotlinx.coroutines.runBlocking {
        broadcastImeActionResult(
            requestId,
            action,
            success,
            if (success) null else "Action failed",
            totalTime,
        )
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
   * Perform select all text using AccessibilityService's ACTION_SET_SELECTION. This is
   * significantly faster than using ADB double-tap gestures.
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

      val success =
          if (textLength > 0) {
            // Use ACTION_SET_SELECTION with start=0 and end=textLength to select all
            val arguments =
                android.os.Bundle().apply {
                  putInt(
                      android.view.accessibility.AccessibilityNodeInfo
                          .ACTION_ARGUMENT_SELECTION_START_INT,
                      0,
                  )
                  putInt(
                      android.view.accessibility.AccessibilityNodeInfo
                          .ACTION_ARGUMENT_SELECTION_END_INT,
                      textLength,
                  )
                }
            focusedNode.performAction(
                android.view.accessibility.AccessibilityNodeInfo.ACTION_SET_SELECTION,
                arguments,
            )
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
        broadcastSelectAllResult(
            requestId,
            success,
            if (success) null else "performAction returned false",
            totalTime,
        )
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
   * Perform accessibility node action (click, long_click, or focus) on an element identified by
   * resource-id. Designed for TalkBack mode where coordinate-based taps may be intercepted.
   */
  private fun performNodeAction(requestId: String?, action: String, resourceId: String?) {
    val startTime = System.currentTimeMillis()
    Log.d(TAG, "performAction: action='$action', resourceId='$resourceId'")
    perfProvider.serial("performAction")

    try {
      if (resourceId == null || resourceId.isEmpty()) {
        perfProvider.end()
        val errorTime = System.currentTimeMillis()
        val error = "resource-id is required for accessibility actions"
        Log.w(TAG, error)
        serviceScope.launch {
          broadcastActionResult(requestId, action, false, error, errorTime - startTime)
        }
        return
      }

      perfProvider.startOperation("findNode")
      val root = rootInActiveWindow
      val targetNode = findNodeByResourceId(root, resourceId)
      perfProvider.endOperation("findNode")

      if (targetNode == null) {
        perfProvider.end()
        val errorTime = System.currentTimeMillis()
        val error = "Element not found with resource-id: $resourceId"
        Log.w(TAG, error)
        serviceScope.launch {
          broadcastActionResult(requestId, action, false, error, errorTime - startTime)
        }
        return
      }

      perfProvider.startOperation("executeAction")
      val success =
          when (action) {
            "click" -> {
              // ACTION_CLICK for single tap in TalkBack mode
              targetNode.performAction(
                  android.view.accessibility.AccessibilityNodeInfo.ACTION_CLICK
              )
            }
            "long_click" -> {
              // ACTION_LONG_CLICK for long press in TalkBack mode
              targetNode.performAction(
                  android.view.accessibility.AccessibilityNodeInfo.ACTION_LONG_CLICK
              )
            }
            "focus" -> {
              // ACTION_ACCESSIBILITY_FOCUS to set TalkBack cursor position
              targetNode.performAction(
                  android.view.accessibility.AccessibilityNodeInfo.ACTION_ACCESSIBILITY_FOCUS
              )
            }
            "clear_focus" -> {
              // ACTION_CLEAR_ACCESSIBILITY_FOCUS to clear TalkBack cursor
              targetNode.performAction(
                  android.view.accessibility.AccessibilityNodeInfo.ACTION_CLEAR_ACCESSIBILITY_FOCUS
              )
            }
            "scroll_forward" -> {
              // ACTION_SCROLL_FORWARD for scrolling down/right in TalkBack mode
              targetNode.performAction(
                  android.view.accessibility.AccessibilityNodeInfo.ACTION_SCROLL_FORWARD
              )
            }
            "scroll_backward" -> {
              // ACTION_SCROLL_BACKWARD for scrolling up/left in TalkBack mode
              targetNode.performAction(
                  android.view.accessibility.AccessibilityNodeInfo.ACTION_SCROLL_BACKWARD
              )
            }
            else -> {
              Log.w(TAG, "Unknown action: $action")
              false
            }
          }
      perfProvider.endOperation("executeAction")

      targetNode.recycle()
      perfProvider.end()

      Log.d(TAG, "Action completed: success=$success")

      // Wait for UI to settle after click/long_click/scroll, then extract fresh hierarchy
      if (success && action in listOf("click", "long_click", "scroll_forward", "scroll_backward")) {
        val freshHierarchy =
            hierarchyDebouncer.extractAfterQuiescence(
                quiescenceMs = 50L,
                maxWaitMs = 500L,
                pollIntervalMs = 10L,
            )
        if (freshHierarchy != null) {
          kotlinx.coroutines.runBlocking { broadcastHierarchyUpdate(freshHierarchy, sync = true) }
        }
      }

      val totalTime = System.currentTimeMillis() - startTime
      Log.d(TAG, "Action total time: ${totalTime}ms")

      kotlinx.coroutines.runBlocking {
        broadcastActionResult(
            requestId,
            action,
            success,
            if (success) null else "performAction returned false",
            totalTime,
        )
      }
    } catch (e: Exception) {
      perfProvider.end()
      val errorTime = System.currentTimeMillis()
      Log.e(TAG, "Error performing action", e)
      kotlinx.coroutines.runBlocking {
        broadcastActionResult(requestId, action, false, e.message, errorTime - startTime)
      }
    }
  }

  /**
   * Perform clipboard operations using ClipboardManager and AccessibilityService. Supports copy,
   * paste, clear, and get operations.
   */
  private fun performClipboard(requestId: String?, action: String, text: String?) {
    val startTime = System.currentTimeMillis()
    Log.d(TAG, "performClipboard: action='$action'")
    perfProvider.serial("performClipboard")

    try {
      perfProvider.startOperation("executeClipboardAction")

      val (success, resultText, error) =
          when (action) {
            "copy" -> {
              if (text == null || text.isEmpty()) {
                Triple(false, null, "Text is required for copy action")
              } else {
                try {
                  val clip = ClipData.newPlainText("AutoMobile", text)
                  clipboardManager.setPrimaryClip(clip)
                  Log.d(TAG, "Clipboard copy successful (${text.length} chars)")
                  Triple(true, null, null)
                } catch (e: Exception) {
                  Log.e(TAG, "Clipboard copy failed", e)
                  Triple(false, null, "Copy failed: ${e.message}")
                }
              }
            }
            "get" -> {
              try {
                val clip = clipboardManager.primaryClip
                val clipText = clip?.getItemAt(0)?.text?.toString()
                if (clipText != null) {
                  Log.d(TAG, "Clipboard get successful (${clipText.length} chars)")
                  Triple(true, clipText, null)
                } else {
                  Log.d(TAG, "Clipboard is empty")
                  Triple(true, "", null)
                }
              } catch (e: Exception) {
                Log.e(TAG, "Clipboard get failed", e)
                Triple(false, null, "Get failed: ${e.message}")
              }
            }
            "clear" -> {
              try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                  clipboardManager.clearPrimaryClip()
                  Log.d(TAG, "Clipboard cleared using clearPrimaryClip()")
                } else {
                  // Fallback for API < 28: set empty clip
                  val emptyClip = ClipData.newPlainText("", "")
                  clipboardManager.setPrimaryClip(emptyClip)
                  Log.d(TAG, "Clipboard cleared using empty clip (API < 28)")
                }
                Triple(true, null, null)
              } catch (e: Exception) {
                Log.e(TAG, "Clipboard clear failed", e)
                Triple(false, null, "Clear failed: ${e.message}")
              }
            }
            "paste" -> {
              try {
                perfProvider.startOperation("findFocusedNode")
                val focusedNode = findFocusedEditableNode(rootInActiveWindow)
                perfProvider.endOperation("findFocusedNode")

                if (focusedNode == null) {
                  Log.w(TAG, "No focused editable node found for paste")
                  Triple(
                      false,
                      null,
                      "No focused input field found. Focus a text field before pasting.",
                  )
                } else {
                  perfProvider.startOperation("performPaste")
                  val pasteSuccess =
                      focusedNode.performAction(
                          android.view.accessibility.AccessibilityNodeInfo.ACTION_PASTE
                      )
                  focusedNode.recycle()
                  perfProvider.endOperation("performPaste")

                  if (pasteSuccess) {
                    Log.d(TAG, "Clipboard paste successful")
                    Triple(true, null, null)
                  } else {
                    Log.w(TAG, "Paste action returned false")
                    Triple(false, null, "Paste action failed")
                  }
                }
              } catch (e: Exception) {
                Log.e(TAG, "Clipboard paste failed", e)
                Triple(false, null, "Paste failed: ${e.message}")
              }
            }
            else -> {
              Log.w(TAG, "Unknown clipboard action: $action")
              Triple(false, null, "Unknown action: $action")
            }
          }

      perfProvider.endOperation("executeClipboardAction")
      perfProvider.end()

      Log.d(TAG, "Clipboard action completed: action=$action, success=$success")

      val totalTime = System.currentTimeMillis() - startTime
      Log.d(TAG, "Clipboard total time: ${totalTime}ms")

      // Broadcast clipboard result
      kotlinx.coroutines.runBlocking {
        broadcastClipboardResult(requestId, action, success, resultText, error, totalTime)
      }
    } catch (e: Exception) {
      perfProvider.end()
      val errorTime = System.currentTimeMillis()
      Log.e(TAG, "Error performing clipboard operation", e)
      kotlinx.coroutines.runBlocking {
        broadcastClipboardResult(requestId, action, false, null, e.message, errorTime - startTime)
      }
    }
  }

  /** Find the next focusable node after the given node in document order. */
  private fun findNextFocusableNode(
      root: android.view.accessibility.AccessibilityNodeInfo?,
      currentNode: android.view.accessibility.AccessibilityNodeInfo,
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
        focusableNodes.forEach { n -> if (n != node) n.recycle() }
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

  /** Find the previous focusable node before the given node in document order. */
  private fun findPreviousFocusableNode(
      root: android.view.accessibility.AccessibilityNodeInfo?,
      currentNode: android.view.accessibility.AccessibilityNodeInfo,
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
        focusableNodes.forEach { n -> if (n != previousNode) n.recycle() }
        return previousNode
      }
      previousNode?.recycle()
      previousNode = node
    }

    // If current node not found, recycle all
    focusableNodes.forEach { it.recycle() }
    return null
  }

  /** Collect all focusable and editable nodes in document order (pre-order traversal). */
  private fun collectFocusableNodes(
      node: android.view.accessibility.AccessibilityNodeInfo,
      result: MutableList<android.view.accessibility.AccessibilityNodeInfo>,
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

  /** Check if two AccessibilityNodeInfo objects refer to the same node. */
  private fun isSameNode(
      node1: android.view.accessibility.AccessibilityNodeInfo,
      node2: android.view.accessibility.AccessibilityNodeInfo,
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

  /** Find a node by resource-id, searching recursively through the hierarchy. */
  private fun findNodeByResourceId(
      root: android.view.accessibility.AccessibilityNodeInfo?,
      resourceId: String,
  ): android.view.accessibility.AccessibilityNodeInfo? {
    if (root == null) return null

    // Check if this node matches
    val nodeResourceId = root.viewIdResourceName
    if (
        nodeResourceId != null &&
            (nodeResourceId == resourceId || nodeResourceId.endsWith(":id/$resourceId"))
    ) {
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

  /** Find the currently focused editable node. */
  private fun findFocusedEditableNode(
      root: android.view.accessibility.AccessibilityNodeInfo?
  ): android.view.accessibility.AccessibilityNodeInfo? {
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

  /** Recursively search for a focused editable node in the hierarchy. */
  private fun findFocusedEditableInHierarchy(
      node: android.view.accessibility.AccessibilityNodeInfo?
  ): android.view.accessibility.AccessibilityNodeInfo? {
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
      totalTimeMs: Long,
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
      totalTimeMs: Long,
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
      totalTimeMs: Long,
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

  /** Broadcast accessibility action result to WebSocket clients */
  private suspend fun broadcastActionResult(
      requestId: String?,
      action: String,
      success: Boolean,
      error: String?,
      totalTimeMs: Long,
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

  /** Broadcast clipboard result to WebSocket clients */
  private suspend fun broadcastClipboardResult(
      requestId: String?,
      action: String,
      success: Boolean,
      text: String?,
      error: String?,
      totalTimeMs: Long,
  ) {
    if (!::webSocketServer.isInitialized || !webSocketServer.isRunning()) {
      Log.d(TAG, "WebSocket server not running, skipping clipboard result broadcast")
      return
    }

    try {
      webSocketServer.broadcastWithPerf { perfTiming ->
        buildString {
          append("""{"type":"clipboard_result","timestamp":${System.currentTimeMillis()}""")
          if (requestId != null) {
            append(""","requestId":"$requestId"""")
          }
          append(""","action":"$action"""")
          append(""","success":$success""")
          append(""","totalTimeMs":$totalTimeMs""")
          if (text != null) {
            // Escape text for JSON
            val escapedText =
                text
                    .replace("\\", "\\\\")
                    .replace("\"", "\\\"")
                    .replace("\n", "\\n")
                    .replace("\r", "\\r")
                    .replace("\t", "\\t")
            append(""","text":"$escapedText"""")
          }
          if (error != null) {
            // Escape error message for JSON
            val escapedError =
                error
                    .replace("\\", "\\\\")
                    .replace("\"", "\\\"")
                    .replace("\n", "\\n")
                    .replace("\r", "\\r")
                    .replace("\t", "\\t")
            append(""","error":"$escapedError"""")
          }
          if (perfTiming != null) {
            append(""","perfTiming":$perfTiming""")
          }
          append("}")
        }
      }
      Log.d(TAG, "Broadcasted clipboard result to ${webSocketServer.getConnectionCount()} clients")
    } catch (e: Exception) {
      Log.e(TAG, "Error broadcasting clipboard result", e)
    }
  }

  /** Broadcast swipe result to WebSocket clients */
  private suspend fun broadcastSwipeResult(
      requestId: String?,
      success: Boolean,
      error: String?,
      totalTimeMs: Long,
      gestureTimeMs: Long?,
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

  /** Broadcast pinch result to WebSocket clients */
  private suspend fun broadcastPinchResult(
      requestId: String?,
      success: Boolean,
      error: String?,
      totalTimeMs: Long,
      gestureTimeMs: Long?,
  ) {
    if (!::webSocketServer.isInitialized || !webSocketServer.isRunning()) {
      Log.d(TAG, "WebSocket server not running, skipping pinch result broadcast")
      return
    }

    try {
      webSocketServer.broadcastWithPerf { perfTiming ->
        buildString {
          append("""{"type":"pinch_result","timestamp":${System.currentTimeMillis()}""")
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
      Log.d(TAG, "Broadcasted pinch result to ${webSocketServer.getConnectionCount()} clients")
    } catch (e: Exception) {
      Log.e(TAG, "Error broadcasting pinch result", e)
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
          append(
              """{"type":"navigation_event","timestamp":${System.currentTimeMillis()},"event":"""
          )
          append(eventJson)
          if (perfTiming != null) {
            append(""","perfTiming":$perfTiming""")
          }
          append("}")
        }
      }
      Log.d(
          TAG,
          "Broadcasted navigation event to ${webSocketServer.getConnectionCount()} clients: ${event.destination}",
      )
    } catch (e: Exception) {
      Log.e(TAG, "Error broadcasting navigation event", e)
    }
  }

  /**
   * Get the current accessibility focus element. Returns the element that currently has
   * accessibility focus (TalkBack cursor position).
   */
  private fun handleGetCurrentFocus(requestId: String?) {
    val startTime = System.currentTimeMillis()
    Log.d(TAG, "handleGetCurrentFocus (requestId: $requestId)")
    perfProvider.serial("getCurrentFocus")

    try {
      perfProvider.startOperation("findFocus")
      val rootNode = rootInActiveWindow
      val focusedNode = rootNode?.findFocus(AccessibilityNodeInfo.FOCUS_ACCESSIBILITY)
      perfProvider.endOperation("findFocus")

      if (focusedNode == null) {
        perfProvider.end()
        val totalTime = System.currentTimeMillis() - startTime
        Log.d(TAG, "No accessibility focus found")
        serviceScope.launch { broadcastCurrentFocusResult(requestId, null, totalTime) }
        return
      }

      perfProvider.startOperation("extractFocusInfo")
      // Extract focus element information
      val focusedElement = viewHierarchyExtractor.extractFocusedElementInfo(focusedNode)
      focusedNode.recycle()
      perfProvider.endOperation("extractFocusInfo")
      perfProvider.end()

      val totalTime = System.currentTimeMillis() - startTime
      Log.d(TAG, "Current focus extracted in ${totalTime}ms")

      serviceScope.launch { broadcastCurrentFocusResult(requestId, focusedElement, totalTime) }
    } catch (e: Exception) {
      perfProvider.end()
      val errorTime = System.currentTimeMillis()
      Log.e(TAG, "Error getting current focus", e)
      serviceScope.launch {
        broadcastCurrentFocusError(requestId, e.message, errorTime - startTime)
      }
    }
  }

  /**
   * Get the traversal order of focusable elements. Returns an ordered list of all
   * accessibility-focusable elements in TalkBack traversal order.
   */
  private fun handleGetTraversalOrder(requestId: String?) {
    val startTime = System.currentTimeMillis()
    Log.d(TAG, "handleGetTraversalOrder (requestId: $requestId)")
    perfProvider.serial("getTraversalOrder")

    try {
      perfProvider.startOperation("extractTraversalOrder")
      val allWindows = windows
      val rootNode = rootInActiveWindow
      val screenDimensions = getScreenDimensions()

      if (allWindows.isNullOrEmpty() && rootNode == null) {
        perfProvider.endOperation("extractTraversalOrder")
        perfProvider.end()
        val totalTime = System.currentTimeMillis() - startTime
        Log.w(TAG, "No windows or root node available for traversal order extraction")
        serviceScope.launch {
          broadcastTraversalOrderError(requestId, "No windows available", totalTime)
        }
        return
      }

      // Extract traversal order using ViewHierarchyExtractor
      val traversalResult =
          if (!allWindows.isNullOrEmpty()) {
            viewHierarchyExtractor.extractTraversalOrderFromAllWindows(
                allWindows,
                rootNode,
                screenDimensions,
            )
          } else {
            viewHierarchyExtractor.extractTraversalOrderFromActiveWindow(rootNode, screenDimensions)
          }
      perfProvider.endOperation("extractTraversalOrder")
      perfProvider.end()

      val totalTime = System.currentTimeMillis() - startTime
      Log.d(
          TAG,
          "Traversal order extracted: ${traversalResult.elements.size} elements in ${totalTime}ms",
      )

      serviceScope.launch { broadcastTraversalOrderResult(requestId, traversalResult, totalTime) }
    } catch (e: Exception) {
      perfProvider.end()
      val errorTime = System.currentTimeMillis()
      Log.e(TAG, "Error getting traversal order", e)
      serviceScope.launch {
        broadcastTraversalOrderError(requestId, e.message, errorTime - startTime)
      }
    }
  }

  /** Broadcast current focus result to WebSocket clients */
  private suspend fun broadcastCurrentFocusResult(
      requestId: String?,
      focusedElement: UIElementInfo?,
      totalTimeMs: Long,
  ) {
    if (!::webSocketServer.isInitialized || !webSocketServer.isRunning()) {
      Log.d(TAG, "WebSocket server not running, skipping current focus result broadcast")
      return
    }

    try {
      webSocketServer.broadcastWithPerf { perfTiming ->
        buildString {
          append("""{"type":"current_focus_result","timestamp":${System.currentTimeMillis()}""")
          if (requestId != null) {
            append(""","requestId":"$requestId"""")
          }
          append(""","totalTimeMs":$totalTimeMs""")
          if (focusedElement != null) {
            val elementJson = jsonCompact.encodeToString(UIElementInfo.serializer(), focusedElement)
            append(""","focusedElement":$elementJson""")
          } else {
            append(""","focusedElement":null""")
          }
          if (perfTiming != null) {
            append(""","perfTiming":$perfTiming""")
          }
          append("}")
        }
      }
      Log.d(
          TAG,
          "Broadcasted current focus result to ${webSocketServer.getConnectionCount()} clients",
      )
    } catch (e: Exception) {
      Log.e(TAG, "Error broadcasting current focus result", e)
    }
  }

  /** Broadcast current focus error to WebSocket clients */
  private suspend fun broadcastCurrentFocusError(
      requestId: String?,
      error: String?,
      totalTimeMs: Long,
  ) {
    if (!::webSocketServer.isInitialized || !webSocketServer.isRunning()) {
      Log.d(TAG, "WebSocket server not running, skipping current focus error broadcast")
      return
    }

    try {
      webSocketServer.broadcast(
          buildString {
            append("""{"type":"current_focus_result","timestamp":${System.currentTimeMillis()}""")
            if (requestId != null) {
              append(""","requestId":"$requestId"""")
            }
            append(""","totalTimeMs":$totalTimeMs""")
            append(""","error":"${error ?: "Unknown error"}"""")
            append("}")
          }
      )
      Log.d(
          TAG,
          "Broadcasted current focus error to ${webSocketServer.getConnectionCount()} clients",
      )
    } catch (e: Exception) {
      Log.e(TAG, "Error broadcasting current focus error", e)
    }
  }

  /** Broadcast traversal order result to WebSocket clients */
  private suspend fun broadcastTraversalOrderResult(
      requestId: String?,
      traversalResult: dev.jasonpearson.automobile.accessibilityservice.models.TraversalOrderResult,
      totalTimeMs: Long,
  ) {
    if (!::webSocketServer.isInitialized || !webSocketServer.isRunning()) {
      Log.d(TAG, "WebSocket server not running, skipping traversal order result broadcast")
      return
    }

    try {
      webSocketServer.broadcastWithPerf { perfTiming ->
        buildString {
          append("""{"type":"traversal_order_result","timestamp":${System.currentTimeMillis()}""")
          if (requestId != null) {
            append(""","requestId":"$requestId"""")
          }
          append(""","totalTimeMs":$totalTimeMs""")
          val resultJson =
              jsonCompact.encodeToString(
                  dev.jasonpearson.automobile.accessibilityservice.models.TraversalOrderResult
                      .serializer(),
                  traversalResult,
              )
          append(""","result":$resultJson""")
          if (perfTiming != null) {
            append(""","perfTiming":$perfTiming""")
          }
          append("}")
        }
      }
      Log.d(
          TAG,
          "Broadcasted traversal order result to ${webSocketServer.getConnectionCount()} clients",
      )
    } catch (e: Exception) {
      Log.e(TAG, "Error broadcasting traversal order result", e)
    }
  }

  /** Broadcast traversal order error to WebSocket clients */
  private suspend fun broadcastTraversalOrderError(
      requestId: String?,
      error: String?,
      totalTimeMs: Long,
  ) {
    if (!::webSocketServer.isInitialized || !webSocketServer.isRunning()) {
      Log.d(TAG, "WebSocket server not running, skipping traversal order error broadcast")
      return
    }

    try {
      webSocketServer.broadcast(
          buildString {
            append("""{"type":"traversal_order_result","timestamp":${System.currentTimeMillis()}""")
            if (requestId != null) {
              append(""","requestId":"$requestId"""")
            }
            append(""","totalTimeMs":$totalTimeMs""")
            append(""","error":"${error ?: "Unknown error"}"""")
            append("}")
          }
      )
      Log.d(
          TAG,
          "Broadcasted traversal order error to ${webSocketServer.getConnectionCount()} clients",
      )
    } catch (e: Exception) {
      Log.e(TAG, "Error broadcasting traversal order error", e)
    }
  }
}
