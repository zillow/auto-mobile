@file:OptIn(ExperimentalFoundationApi::class, androidx.compose.ui.ExperimentalComposeUiApi::class, androidx.compose.foundation.layout.ExperimentalLayoutApi::class)

package dev.jasonpearson.automobile.ide

import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectDragGesturesAfterLongPress
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.input.pointer.PointerEventType
import androidx.compose.ui.input.pointer.PointerIcon
import androidx.compose.ui.input.pointer.onPointerEvent
import androidx.compose.ui.input.pointer.pointerHoverIcon
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.layout.positionInParent
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Popup
import androidx.compose.ui.window.PopupProperties
import org.jetbrains.jewel.foundation.theme.JewelTheme
import org.jetbrains.jewel.ui.component.Text
import org.jetbrains.jewel.ui.component.Tooltip
import com.intellij.notification.NotificationGroupManager
import com.intellij.notification.NotificationType
import com.intellij.openapi.diagnostic.Logger
import dev.jasonpearson.automobile.ide.datasource.DataSourceMode
import dev.jasonpearson.automobile.ide.datasource.DataSourceFactory
import dev.jasonpearson.automobile.ide.diagnostics.DiagnosticsDashboard
import dev.jasonpearson.automobile.ide.datasource.InstalledApp
import dev.jasonpearson.automobile.ide.datasource.Result
import dev.jasonpearson.automobile.ide.failures.DataSourceResult
import dev.jasonpearson.automobile.ide.failures.FailureNotification
import dev.jasonpearson.automobile.ide.failures.FailuresDashboard
import dev.jasonpearson.automobile.ide.failures.FailureSeverity
import dev.jasonpearson.automobile.ide.failures.FailureType
import dev.jasonpearson.automobile.ide.failures.FakeFailuresDataSource
import dev.jasonpearson.automobile.ide.failures.McpFailuresDataSource
import dev.jasonpearson.automobile.ide.failures.StreamingFailuresDataSource
import dev.jasonpearson.automobile.ide.failures.TimeAggregation
import dev.jasonpearson.automobile.ide.mcp.McpProcess
import dev.jasonpearson.automobile.ide.mcp.McpConnectionType
import dev.jasonpearson.automobile.ide.mcp.FakeMcpProcessDetector
import dev.jasonpearson.automobile.ide.mcp.RealMcpProcessDetector
import dev.jasonpearson.automobile.ide.daemon.AutoMobileClient
import dev.jasonpearson.automobile.ide.daemon.McpResource
import dev.jasonpearson.automobile.ide.daemon.McpTool
import dev.jasonpearson.automobile.ide.daemon.McpHttpClient
import dev.jasonpearson.automobile.ide.daemon.McpDaemonClient
import dev.jasonpearson.automobile.ide.daemon.DaemonSocketPaths
import dev.jasonpearson.automobile.ide.daemon.ObservationStreamClient
import dev.jasonpearson.automobile.ide.daemon.FailuresPushSocketClient
import dev.jasonpearson.automobile.ide.failures.FailuresVerticalPanel
import dev.jasonpearson.automobile.ide.failures.DateRange
import dev.jasonpearson.automobile.ide.layout.LayoutInspectorDashboard
import dev.jasonpearson.automobile.ide.performance.PerformanceVerticalPanel
import dev.jasonpearson.automobile.ide.settings.AutoMobileSettings
import dev.jasonpearson.automobile.ide.tabs.HorizontalTab
import dev.jasonpearson.automobile.ide.tabs.HorizontalTabBar
import dev.jasonpearson.automobile.ide.navigation.NavigationDashboard
import dev.jasonpearson.automobile.ide.performance.PerformanceDashboard
import dev.jasonpearson.automobile.ide.storage.StorageDashboard
import dev.jasonpearson.automobile.ide.storage.StoragePlatform
import dev.jasonpearson.automobile.ide.test.TestDashboard

private val LOG = Logger.getInstance("AutoMobileToolWindow")

private fun showNotification(
    title: String,
    content: String,
    type: NotificationType = NotificationType.INFORMATION,
    actionText: String? = null,
    onAction: (() -> Unit)? = null,
) {
    try {
        val notification = NotificationGroupManager.getInstance()
            .getNotificationGroup("AutoMobile")
            .createNotification(title, content, type)

        if (actionText != null && onAction != null) {
            notification.addAction(object : com.intellij.notification.NotificationAction(actionText) {
                override fun actionPerformed(e: com.intellij.openapi.actionSystem.AnActionEvent, notification: com.intellij.notification.Notification) {
                    onAction()
                    notification.expire()
                }
            })
        }

        notification.notify(null)
    } catch (e: Exception) {
        LOG.error("Failed to show notification: $title - $content", e)
    }
}

enum class Dashboard(val title: String, val icon: String) {
  Navigation("Navigation", "🧭"),
  Test("Test", "🧪"),
  Performance("Performance", "⚡"),
  Layout("Layout", "📐"),
  Storage("Storage", "💾"),
  Failures("Failures", "💥"),
}

// Device types for icons
enum class DeviceType { AndroidEmulator, AndroidPhysical, iOSSimulator, iOSPhysical }

data class BootedDevice(
    val id: String,
    val name: String,
    val type: DeviceType,
    val status: String = "Running",
    val foregroundApp: String? = null,
    val connectedAt: Long = System.currentTimeMillis(),
)

data class AvailableEmulator(
    val id: String,
    val name: String,
    val type: DeviceType,
    val apiLevel: String? = null,
)

data class SystemImage(
    val id: String,
    val name: String,
    val platform: String, // "Android" or "iOS"
    val apiLevel: String,
)

// Common launcher package names
private val ANDROID_LAUNCHERS = listOf(
    "com.google.android.apps.nexuslauncher",  // Pixel Launcher
    "com.android.launcher3",                   // AOSP Launcher
    "com.sec.android.app.launcher",            // Samsung One UI
    "com.huawei.android.launcher",             // Huawei
    "com.miui.home",                           // Xiaomi MIUI
)
private const val IOS_SPRINGBOARD = "com.apple.springboard"

/**
 * Select the default app to show in the navigation graph.
 * Priority: foreground app > launcher/springboard > first app in list
 */
private fun selectDefaultApp(apps: List<InstalledApp>, deviceType: DeviceType?): String? {
    // First priority: foreground app
    apps.find { it.isForeground }?.let { return it.packageName }

    // Second priority: launcher (Android) or springboard (iOS)
    val isIOS = deviceType == DeviceType.iOSSimulator || deviceType == DeviceType.iOSPhysical
    if (isIOS) {
        apps.find { it.packageName == IOS_SPRINGBOARD }?.let { return it.packageName }
    } else {
        // Android - try common launcher packages
        for (launcher in ANDROID_LAUNCHERS) {
            apps.find { it.packageName == launcher }?.let { return it.packageName }
        }
    }

    // Fallback: first app in list
    return apps.firstOrNull()?.packageName
}

@Composable
fun AutoMobileToolWindowContent() {
  var selectedIndex by remember { mutableIntStateOf(0) }
  val dashboardOrder = remember { mutableStateListOf(*Dashboard.entries.toTypedArray()) }
  var draggedIndex by remember { mutableStateOf<Int?>(null) }
  var dropTargetIndex by remember { mutableStateOf<Int?>(null) }

  // New layout state - vertical panels (Failures, Performance) on right side
  var isFailuresPanelCollapsed by remember { mutableStateOf(true) }
  var isPerformancePanelCollapsed by remember { mutableStateOf(true) }
  var failuresPanelWidthPx by remember { mutableFloatStateOf(450f) }  // 300 * 1.5
  var performancePanelWidthPx by remember { mutableFloatStateOf(450f) }  // 300 * 1.5

  // Horizontal tabs at bottom (Navigation, Test Runs, Storage, Diagnostics)
  val horizontalTabs = remember {
      listOf(
          HorizontalTab("navigation", "Navigation", "🧭"),
          HorizontalTab("test_runs", "Test Runs", "🧪"),
          HorizontalTab("storage", "Storage", "💾"),
          HorizontalTab("diagnostics", "Diagnostics", "🩺"),
      )
  }
  var selectedHorizontalTabId by remember { mutableStateOf<String?>(null) }

  // Track live performance metrics for collapsed Performance panel
  var currentFps by remember { mutableStateOf<Float?>(null) }
  var currentFrameTimeMs by remember { mutableStateOf<Float?>(null) }
  var currentJankFrames by remember { mutableStateOf<Int?>(null) }
  var currentMemoryMb by remember { mutableStateOf<Float?>(null) }
  var currentTouchLatencyMs by remember { mutableStateOf<Float?>(null) }
  var perfUpdateCounter by remember { mutableIntStateOf(0) }

  // Track failure counts by type for collapsed Failures panel
  var crashCount by remember { mutableIntStateOf(0) }
  var anrCount by remember { mutableIntStateOf(0) }
  var toolFailureCount by remember { mutableIntStateOf(0) }
  var nonFatalCount by remember { mutableIntStateOf(0) }
  var hasNewCriticalFailure by remember { mutableStateOf(false) }

  // Load persisted date range setting
  val settings = remember { AutoMobileSettings.getInstance() }
  var failuresDateRange by remember {
    val saved = settings.failuresDateRange
    val initial = DateRange.entries.find { it.label == saved } ?: DateRange.TwentyFourHours
    mutableStateOf(initial)
  }



  // Mock booted devices - will be replaced with real data
  val activeDeviceIdState = remember { mutableStateOf<String?>(null) }  // null = show MCP panel in Real mode
  val isDevicePanelExpandedState = remember { mutableStateOf(true) }  // Start expanded to show MCP servers
  var activeDeviceId by activeDeviceIdState
  var isDevicePanelExpanded by isDevicePanelExpandedState

  // Track when user explicitly navigates to device panel (to suppress auto-selection)
  var userNavigatedToDevices by remember { mutableStateOf(false) }

  // Log state changes for debugging
  LaunchedEffect(activeDeviceId, isDevicePanelExpanded) {
      LOG.info("State changed: activeDeviceId=$activeDeviceId, isDevicePanelExpanded=$isDevicePanelExpanded")
  }

  // Data source mode (Fake/Real) - global toggle for all dashboards
  var dataSourceMode by remember { mutableStateOf(DataSourceMode.Real) }

  // Pending failure ID for deep linking from notifications
  var pendingFailureId by remember { mutableStateOf<String?>(null) }

  // App selector state (for Navigation dashboard filtering)
  var selectedAppId by remember { mutableStateOf<String?>(null) }
  var installedApps by remember { mutableStateOf<List<InstalledApp>>(emptyList()) }
  var isAppListLoading by remember { mutableStateOf(false) }
  var appDropdownExpanded by remember { mutableStateOf(false) }

  // Mock devices list (only used in Fake mode)
  val mockBootedDevices = remember {
    listOf(
        BootedDevice("pixel8", "Pixel 8 API 35", DeviceType.AndroidEmulator, "Running", "com.example.myapp", System.currentTimeMillis() - 300000),
        BootedDevice("pixel7", "Pixel 7 API 34", DeviceType.AndroidEmulator, "Running", "com.android.launcher3", System.currentTimeMillis() - 600000),
        BootedDevice("iphone15", "iPhone 15 Pro", DeviceType.iOSSimulator, "Booted", "com.apple.springboard", System.currentTimeMillis() - 180000),
    )
  }

  // Real device info (when connected to MCP)
  var realDevice by remember { mutableStateOf<BootedDevice?>(null) }

  // Connected MCP process (for creating clients)
  var connectedMcpProcess by remember { mutableStateOf<McpProcess?>(null) }

  // Log when connectedMcpProcess changes
  LaunchedEffect(connectedMcpProcess) {
      LOG.info("connectedMcpProcess changed to: ${connectedMcpProcess?.let { "${it.name} (PID ${it.pid}, ${it.connectionType})" } ?: "null"}")
  }

  // Client provider function for dashboards to access MCP data
  val clientProvider: (() -> AutoMobileClient)? = remember(connectedMcpProcess) {
      LOG.info("clientProvider being computed, connectedMcpProcess=${connectedMcpProcess?.let { "${it.name} (PID ${it.pid})" } ?: "null"}")
      connectedMcpProcess?.let { process ->
          {
              when (process.connectionType) {
                  McpConnectionType.UnixSocket -> {
                      val socketPath = process.socketPath ?: DaemonSocketPaths.socketPath()
                      McpDaemonClient(socketPath)
                  }
                  McpConnectionType.StreamableHttp -> {
                      val port = process.port ?: 3000
                      McpHttpClient("http://localhost:$port/auto-mobile/streamable")
                  }
                  McpConnectionType.Stdio -> {
                      throw UnsupportedOperationException("Cannot connect to STDIO process externally")
                  }
              }
          }
      }
  }

  // Observation stream client for real-time hierarchy/screenshot updates
  // Only created when a device is connected; disposed when device disconnects
  var observationStreamClient by remember { mutableStateOf<ObservationStreamClient?>(null) }

  // Push socket client for real-time failure notifications
  // Only created when a device is connected in Real mode; disposed when device disconnects
  var failuresPushClient by remember { mutableStateOf<FailuresPushSocketClient?>(null) }

  // Streaming failures data source for real-time failure notifications
  // Only created in Real mode when the Failures panel is expanded
  val streamingFailuresDataSource = remember(dataSourceMode, isFailuresPanelCollapsed) {
      if (dataSourceMode == DataSourceMode.Real && !isFailuresPanelCollapsed)
          StreamingFailuresDataSource() else null
  }

  // Fetch initial failure counts (deferred until a device is connected)
  LaunchedEffect(dataSourceMode, failuresDateRange, clientProvider, activeDeviceId) {
    if (dataSourceMode == DataSourceMode.Real && clientProvider == null) return@LaunchedEffect
    if (dataSourceMode == DataSourceMode.Fake && activeDeviceId == null) return@LaunchedEffect
    kotlinx.coroutines.withContext(kotlinx.coroutines.Dispatchers.IO) {
      try {
        val dataSource = when (dataSourceMode) {
          DataSourceMode.Fake -> FakeFailuresDataSource()
          DataSourceMode.Real -> clientProvider?.let { McpFailuresDataSource(it) }
        }
        if (dataSource != null) {
          // Use appropriate aggregation for the selected date range
          val aggregation = when (failuresDateRange) {
            DateRange.OneHour -> TimeAggregation.Minute
            DateRange.TwentyFourHours -> TimeAggregation.Hour
            DateRange.ThreeDays -> TimeAggregation.Hour
            DateRange.SevenDays -> TimeAggregation.Day
            DateRange.ThirtyDays -> TimeAggregation.Day
          }
          when (val result = dataSource.getTimelineData(failuresDateRange, aggregation)) {
            is DataSourceResult.Success -> {
              val data = result.data
              crashCount = data.dataPoints.sumOf { it.crashes }
              anrCount = data.dataPoints.sumOf { it.anrs }
              toolFailureCount = data.dataPoints.sumOf { it.toolFailures }
              nonFatalCount = data.dataPoints.sumOf { it.nonfatals }
            }
            is DataSourceResult.Error -> {
              // Keep zeros on error
            }
          }
        }
      } catch (e: Exception) {
        LOG.warn("Failed to fetch initial failure counts", e)
      }
    }
  }

  // Create, connect, and dispose socket clients based on active device and data source mode.
  // Clients are only allocated when a device is connected, eliminating startup overhead.
  DisposableEffect(activeDeviceId, dataSourceMode) {
      val deviceId = activeDeviceId
      var obsClient: ObservationStreamClient? = null
      var failClient: FailuresPushSocketClient? = null

      if (deviceId != null) {
          obsClient = ObservationStreamClient()
          LOG.info("Connecting observation stream for device: $deviceId (client: ${obsClient.hashCode()})")
          obsClient.connect(deviceId)
          observationStreamClient = obsClient

          if (dataSourceMode == DataSourceMode.Real) {
              failClient = FailuresPushSocketClient()
              LOG.info("Connecting failures push client")
              failClient.connect()
              failuresPushClient = failClient
          }
      }

      onDispose {
          if (obsClient != null) {
              LOG.info("Disposing observation stream client (was connected to: $deviceId)")
              observationStreamClient = null
              obsClient.dispose()
          }
          if (failClient != null) {
              LOG.info("Disposing failures push client")
              failuresPushClient = null
              failClient.dispose()
          }
      }
  }

  // Periodic connection health check - reconnect if connection dropped
  LaunchedEffect(observationStreamClient) {
      val client = observationStreamClient ?: return@LaunchedEffect
      val deviceId = activeDeviceId ?: return@LaunchedEffect
      while (true) {
          kotlinx.coroutines.delay(5000)
          if (!client.isConnected()) {
              LOG.info("Observation stream disconnected, attempting reconnect for device: $deviceId")
              client.connect(deviceId)
          }
      }
  }

  // Periodic connection health check for failures push - reconnect if dropped
  LaunchedEffect(failuresPushClient) {
      val client = failuresPushClient ?: return@LaunchedEffect
      while (true) {
          kotlinx.coroutines.delay(5000)
          if (!client.isConnected()) {
              LOG.info("Failures push disconnected, attempting reconnect")
              client.connect()
          }
      }
  }

  // Listen for hierarchy updates to update foreground app state in real-time
  LaunchedEffect(observationStreamClient) {
      val client = observationStreamClient ?: return@LaunchedEffect
      client.hierarchyUpdates.collect { update ->
          val newForegroundApp = update.packageName
          if (newForegroundApp != null && installedApps.isNotEmpty()) {
              // Check if foreground app changed
              val currentForeground = installedApps.find { it.isForeground }?.packageName
              if (currentForeground != newForegroundApp) {
                  LOG.info("Foreground app changed: $currentForeground -> $newForegroundApp")
                  // Update the installed apps list with new foreground state
                  installedApps = installedApps.map { app ->
                      app.copy(isForeground = app.packageName == newForegroundApp)
                  }
              }
          }
      }
  }

  // Listen for performance updates to update collapsed Performance panel summary
  LaunchedEffect(observationStreamClient) {
      val client = observationStreamClient ?: return@LaunchedEffect
      client.performanceUpdates.collect { update ->
          currentFps = update.fps
          currentFrameTimeMs = update.frameTimeMs
          currentJankFrames = update.jankFrames
          currentMemoryMb = update.memoryUsageMb
          currentTouchLatencyMs = update.touchLatencyMs
          perfUpdateCounter++
      }
  }

  // Load installed apps with periodic polling (every 5 seconds) to keep FG state updated
  LaunchedEffect(dataSourceMode, clientProvider, activeDeviceId) {
      if (dataSourceMode == DataSourceMode.Real && clientProvider != null && activeDeviceId != null) {
          // Initial load
          isAppListLoading = true
          var isFirstLoad = true

          while (true) {
              kotlinx.coroutines.withContext(kotlinx.coroutines.Dispatchers.IO) {
                  try {
                      val appListDataSource = DataSourceFactory.createAppListDataSource(
                          dataSourceMode,
                          clientProvider,
                          activeDeviceId
                      )
                      when (val result = appListDataSource.getInstalledApps()) {
                          is Result.Success -> {
                              if (isFirstLoad) {
                                  LOG.info("Loaded ${result.data.size} installed apps")
                              }
                              installedApps = result.data
                              // Auto-select foreground app if none selected (only on first load)
                              if (isFirstLoad && selectedAppId == null) {
                                  selectedAppId = selectDefaultApp(result.data, realDevice?.type)
                                  LOG.info("Auto-selected app: $selectedAppId")
                              }
                          }
                          is Result.Error -> {
                              if (isFirstLoad) {
                                  LOG.warn("Failed to load installed apps: ${result.message}")
                              }
                          }
                          is Result.Loading -> {}
                      }
                  } catch (e: Exception) {
                      if (isFirstLoad) {
                          LOG.error("Exception loading installed apps", e)
                      }
                  } finally {
                      if (isFirstLoad) {
                          isAppListLoading = false
                          isFirstLoad = false
                      }
                  }
              }
              // Poll every 5 seconds
              kotlinx.coroutines.delay(5000)
          }
      } else if (dataSourceMode == DataSourceMode.Fake) {
          // Load fake apps for development (no polling needed)
          kotlinx.coroutines.withContext(kotlinx.coroutines.Dispatchers.IO) {
              val fakeAppListDataSource = DataSourceFactory.createAppListDataSource(dataSourceMode, null, null)
              when (val result = fakeAppListDataSource.getInstalledApps()) {
                  is Result.Success -> {
                      installedApps = result.data
                      if (selectedAppId == null) {
                          selectedAppId = selectDefaultApp(result.data, null)
                      }
                  }
                  else -> {}
              }
          }
      }
  }

  // Devices list switches based on mode
  val bootedDevices = if (dataSourceMode == DataSourceMode.Fake) {
    mockBootedDevices
  } else {
    // In Real mode, show connected MCP device if available
    listOfNotNull(realDevice)
  }

  // Compute platform based on device type for iOS/Android-specific data flow
  val isIOSDevice = realDevice?.type == DeviceType.iOSSimulator || realDevice?.type == DeviceType.iOSPhysical
  val platformString = if (isIOSDevice) "ios" else "android"
  val storagePlatform = if (isIOSDevice) StoragePlatform.iOS else StoragePlatform.Android

  val availableEmulators = remember {
    listOf(
        AvailableEmulator("pixel6", "Pixel 6 API 33", DeviceType.AndroidEmulator, "33"),
        AvailableEmulator("pixel5", "Pixel 5 API 31", DeviceType.AndroidEmulator, "31"),
        AvailableEmulator("iphone14", "iPhone 14", DeviceType.iOSSimulator),
        AvailableEmulator("ipad", "iPad Pro (12.9-inch)", DeviceType.iOSSimulator),
    )
  }
  val systemImages = remember {
    listOf(
        SystemImage("android-35", "Android 15 (VanillaIceCream)", "Android", "35"),
        SystemImage("android-34", "Android 14 (UpsideDownCake)", "Android", "34"),
        SystemImage("ios-17", "iOS 17.2", "iOS", "17.2"),
        SystemImage("ios-16", "iOS 16.4", "iOS", "16.4"),
    )
  }

  // Test flow replay state
  var testFlowScreens by remember { mutableStateOf<List<String>>(emptyList()) }
  var currentReplayIndex by remember { mutableIntStateOf(0) }
  var isReplaying by remember { mutableStateOf(false) }

  // Navigation focus mode state (when zoomed and content extends beyond canvas)
  var isNavigationFocused by remember { mutableStateOf(false) }

  // Setup state - true when AutoMobile service/daemon not detected or accessibility service not running
  // TODO: Replace with actual service detection
  var needsSetup by remember { mutableStateOf(false) }

  // Animate through the test flow screens
  androidx.compose.runtime.LaunchedEffect(isReplaying, testFlowScreens) {
    if (isReplaying && testFlowScreens.isNotEmpty()) {
      currentReplayIndex = 0
      while (isReplaying && currentReplayIndex < testFlowScreens.size) {
        kotlinx.coroutines.delay(800)  // Show each screen for 800ms
        if (currentReplayIndex < testFlowScreens.size - 1) {
          currentReplayIndex++
        } else {
          // Reached end - restart or stop
          kotlinx.coroutines.delay(1000)  // Pause at end
          currentReplayIndex = 0  // Loop back
        }
      }
    }
  }

  // Compute the current highlighted screens for replay (show path up to current index)
  val replayHighlightedScreens = remember(testFlowScreens, currentReplayIndex, isReplaying) {
    if (isReplaying && testFlowScreens.isNotEmpty()) {
      testFlowScreens.take(currentReplayIndex + 1)
    } else {
      testFlowScreens
    }
  }

  val colors = JewelTheme.globalColors
  val isCurrentlyOnNavigation = selectedHorizontalTabId == "navigation"

  // Header should fade when navigation nodes exceed bounds and user isn't hovering header
  var isHeaderHovered by remember { mutableStateOf(false) }
  val headerShouldFade = isNavigationFocused && isCurrentlyOnNavigation && !isHeaderHovered
  val headerAlpha = if (headerShouldFade) 0.2f else 1f

  // Track header height for padding non-navigation content
  var headerHeight by remember { mutableStateOf(0) }
  val density = LocalDensity.current
  val headerHeightDp = with(density) { headerHeight.toDp() }

  // Min/max widths for vertical panels
  val minPanelWidthPx = with(density) { 225.dp.toPx() }  // 150dp * 1.5
  val maxPanelWidthPx = with(density) { 500.dp.toPx() }

  Column(modifier = Modifier.fillMaxSize()) {
    // Header (rendered on top with solid background)
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .graphicsLayer { alpha = headerAlpha }
            .onPointerEvent(PointerEventType.Enter) { isHeaderHovered = true }
            .onPointerEvent(PointerEventType.Exit) { isHeaderHovered = false }
            .onGloballyPositioned { coordinates ->
                headerHeight = coordinates.size.height
            }
    ) {
      GlobalShellHeader(
          devices = bootedDevices,
          activeDeviceId = activeDeviceId,
          onDeviceSelected = { deviceId ->
              if (deviceId.isEmpty() || deviceId == activeDeviceId) {
                  // Empty string or tapping active device deactivates it and shows panel
                  activeDeviceId = null
                  isDevicePanelExpanded = true
                  userNavigatedToDevices = true  // User explicitly wants to browse devices
              } else {
                  activeDeviceId = deviceId
                  isDevicePanelExpanded = false
                  userNavigatedToDevices = false  // Reset when device selected
              }
          },
          isDevicePanelExpanded = isDevicePanelExpanded,
          availableEmulators = availableEmulators,
          systemImages = systemImages,
          onBootEmulator = { emulatorId ->
              // TODO: Boot emulator
          },
          onCreateEmulator = { imageId ->
              // TODO: Create emulator from system image
          },
          onCollapsePanel = {
              isDevicePanelExpanded = false
          },
          needsSetup = needsSetup,
          onSetupClick = {
              // TODO: Open setup wizard/dialog
          },
          dataSourceMode = dataSourceMode,
          onDataSourceModeChanged = { mode ->
              LOG.info("Data source mode changed to: $mode")
              dataSourceMode = mode
              when (mode) {
                  DataSourceMode.Real -> {
                      // Deselect device to show MCP processes list
                      LOG.info("Switching to Real mode: clearing activeDeviceId, expanding panel")
                      activeDeviceId = null
                      isDevicePanelExpanded = true
                  }
                  DataSourceMode.Fake -> {
                      // Auto-select first device if available, collapse panel
                      if (mockBootedDevices.isNotEmpty()) {
                          LOG.info("Switching to Fake mode: selecting device ${mockBootedDevices.first().id}")
                          activeDeviceId = mockBootedDevices.first().id
                          isDevicePanelExpanded = false
                      }
                  }
              }
          },
          onMcpDeviceSelected = { deviceId, deviceName ->
              LOG.info("MCP device selected: $deviceId (name: $deviceName)")
              // Store the real device info - detect type from device name
              val name = deviceName ?: deviceId
              val isIOS = name.contains("iPhone", ignoreCase = true) ||
                          name.contains("iPad", ignoreCase = true) ||
                          name.contains("iOS", ignoreCase = true) ||
                          name.contains("Apple", ignoreCase = true)
              val deviceType = if (isIOS) DeviceType.iOSSimulator else DeviceType.AndroidEmulator
              realDevice = BootedDevice(
                  id = deviceId,
                  name = name,
                  type = deviceType,
                  status = "Connected",
                  foregroundApp = null,
                  connectedAt = System.currentTimeMillis()
              )
              activeDeviceIdState.value = deviceId
              isDevicePanelExpandedState.value = false
              userNavigatedToDevices = false  // Reset when device selected
              showNotification("Device Connected", "Connected to device: $deviceName", NotificationType.INFORMATION)
          },
          onProcessConnected = { process ->
              LOG.info("onProcessConnected called with: ${process?.let { "${it.name} (PID ${it.pid}, ${it.connectionType})" } ?: "null"}")
              connectedMcpProcess = process
          },
          suppressAutoSelect = userNavigatedToDevices,
          // App selector props (kept for backwards compatibility)
          installedApps = installedApps,
          selectedAppId = selectedAppId,
          isAppListLoading = isAppListLoading,
          appDropdownExpanded = appDropdownExpanded,
          onAppDropdownExpandedChange = { appDropdownExpanded = it },
          onAppSelected = { appId ->
              selectedAppId = appId
              appDropdownExpanded = false
              LOG.info("App selected: $appId")
          },
      )
    }

    // Main content area - only show when a device is selected
    // Wrapped in a scrollable column so expanding horizontal tabs doesn't compress the layout
    if (!isDevicePanelExpanded && activeDeviceId != null) {
      BoxWithConstraints(
          modifier = Modifier.weight(1f)
      ) {
        // Calculate height for main content so horizontal tabs are at bottom
        // Subtract ~40dp for horizontal tab bar height
        val horizontalTabBarHeight = 40.dp
        val mainContentHeight = maxHeight - horizontalTabBarHeight

        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
        ) {
          // Main content: Layout Inspector (central) + Failures/Performance (right vertical panels)
          Row(
              modifier = Modifier
                  .fillMaxWidth()
                  .height(mainContentHeight)  // Dynamic height based on window size
          ) {
            // Central Layout Inspector (expands to fill available space)
            // observationStreamClient is guaranteed non-null here because this block
            // is only composed when activeDeviceId != null (see guard at line 711)
            LayoutInspectorDashboard(
                modifier = Modifier.weight(1f),
                dataSourceMode = dataSourceMode,
                clientProvider = clientProvider,
                observationStreamClient = observationStreamClient!!,
                platform = platformString,
            )

            // Right vertical panels: Failures and Performance
            FailuresVerticalPanel(
                isCollapsed = isFailuresPanelCollapsed,
                onToggle = { isFailuresPanelCollapsed = !isFailuresPanelCollapsed },
                widthPx = failuresPanelWidthPx,
                onWidthChange = { delta ->
                    failuresPanelWidthPx = (failuresPanelWidthPx - delta).coerceIn(minPanelWidthPx, maxPanelWidthPx)
                },
                dateRangeLabel = failuresDateRange.label,
                crashCount = crashCount,
                anrCount = anrCount,
                toolFailureCount = toolFailureCount,
                nonFatalCount = nonFatalCount,
                onNavigateToScreen = { screenName ->
                    // Switch to Navigation and highlight the screen
                    selectedHorizontalTabId = "navigation"
                },
                onNavigateToTest = { testName ->
                    // Switch to Test Runs
                    selectedHorizontalTabId = "test_runs"
                },
                onNavigateToSource = { fileName, lineNumber ->
                    // TODO: Use OpenFileDescriptor to navigate to source
                },
                onNewFailureNotification = { notification ->
                    // Track if it's critical
                    if (notification.severity == FailureSeverity.Critical ||
                        notification.severity == FailureSeverity.High) {
                        hasNewCriticalFailure = true
                    }
                    // Only show notifications for crashes and ANRs
                    val typeLabel = when (notification.type) {
                        FailureType.Crash -> "Crash"
                        FailureType.ANR -> "ANR"
                        else -> null
                    }
                    if (typeLabel != null) {
                        showNotification(
                            title = "New $typeLabel Detected",
                            content = notification.title,
                            type = NotificationType.WARNING,
                            actionText = "View",
                            onAction = {
                                // Expand failures panel and deep link
                                isFailuresPanelCollapsed = false
                                pendingFailureId = notification.groupId
                            },
                        )
                    }
                },
                initialSelectedFailureId = pendingFailureId,
                onFailureSelected = { pendingFailureId = null },
                onDateRangeChanged = { newRange ->
                    failuresDateRange = newRange
                    // Persist to settings
                    settings.failuresDateRange = newRange.label
                },
                onFailureCountsChanged = { newCrashCount, newAnrCount, newToolFailureCount, newNonFatalCount ->
                    crashCount = newCrashCount
                    anrCount = newAnrCount
                    toolFailureCount = newToolFailureCount
                    nonFatalCount = newNonFatalCount
                },
                initialDateRange = failuresDateRange,
                dataSourceMode = dataSourceMode,
                clientProvider = clientProvider,
                streamingDataSource = streamingFailuresDataSource,
                failuresPushClient = failuresPushClient,
            )

            PerformanceVerticalPanel(
                isCollapsed = isPerformancePanelCollapsed,
                onToggle = { isPerformancePanelCollapsed = !isPerformancePanelCollapsed },
                widthPx = performancePanelWidthPx,
                onWidthChange = { delta ->
                    performancePanelWidthPx = (performancePanelWidthPx - delta).coerceIn(minPanelWidthPx, maxPanelWidthPx)
                },
                currentFps = currentFps,
                currentFrameTimeMs = currentFrameTimeMs,
                currentJankFrames = currentJankFrames,
                currentMemoryMb = currentMemoryMb,
                currentTouchLatencyMs = currentTouchLatencyMs,
                updateCounter = perfUpdateCounter,
                onNavigateToScreen = { screenName ->
                    selectedHorizontalTabId = "navigation"
                },
                onNavigateToTest = { testName ->
                    selectedHorizontalTabId = "test_runs"
                },
                dataSourceMode = dataSourceMode,
                clientProvider = clientProvider,
                observationStreamClient = observationStreamClient,
            )
          }

          // Bottom horizontal tabs (Navigation, Test Runs, Storage)
          HorizontalTabBar(
              tabs = horizontalTabs,
              selectedTabId = selectedHorizontalTabId,
              onTabSelected = { tabId ->
                  selectedHorizontalTabId = tabId
              },
          )

          // Expanded horizontal tab content
          if (selectedHorizontalTabId != null) {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(350.dp)  // Fixed height for horizontal tab content
            ) {
              when (selectedHorizontalTabId) {
                "navigation" -> NavigationDashboard(
                    highlightedScreens = replayHighlightedScreens,
                    onHighlightCleared = {
                        testFlowScreens = emptyList()
                        isReplaying = false
                    },
                    onFocusModeChanged = { focused ->
                        isNavigationFocused = focused
                    },
                    headerHeightPx = headerHeight.toFloat(),
                    dataSourceMode = dataSourceMode,
                    clientProvider = clientProvider,
                    selectedAppId = selectedAppId,
                    observationStreamClient = observationStreamClient,
                )
                "test_runs" -> TestDashboard(
                    onOpenFile = { filePath ->
                        // TODO: Open file in IDE editor
                    },
                    onNavigateToGraph = { screens ->
                        // Set up test flow replay
                        testFlowScreens = screens
                        isReplaying = true
                        currentReplayIndex = 0
                        selectedHorizontalTabId = "navigation"  // Switch to Navigation tab
                    },
                    dataSourceMode = dataSourceMode,
                    clientProvider = clientProvider,
                    observationStreamClient = observationStreamClient,
                )
                "storage" -> StorageDashboard(
                    dataSourceMode = dataSourceMode,
                    clientProvider = clientProvider,
                    deviceId = activeDeviceId,
                    packageName = selectedAppId,
                    platform = storagePlatform,
                )
                "diagnostics" -> DiagnosticsDashboard(
                    connectedMcpProcess = connectedMcpProcess,
                    dataSourceMode = dataSourceMode,
                )
              }
            }
          } else {
            // Empty state when no tab is selected
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(200.dp),
                contentAlignment = Alignment.Center,
            ) {
              Text(
                  "Select a tab above to view content",
                  fontSize = 12.sp,
                  color = colors.text.normal.copy(alpha = 0.4f),
              )
            }
          }
        } // end scrollable Column
      }
    }
  }
}

@Composable
private fun GlobalShellHeader(
    devices: List<BootedDevice>,
    activeDeviceId: String?,
    onDeviceSelected: (String) -> Unit,
    isDevicePanelExpanded: Boolean = false,
    availableEmulators: List<AvailableEmulator> = emptyList(),
    systemImages: List<SystemImage> = emptyList(),
    onBootEmulator: (String) -> Unit = {},
    onCreateEmulator: (String) -> Unit = {},
    onCollapsePanel: () -> Unit = {},
    needsSetup: Boolean = false,
    onSetupClick: () -> Unit = {},
    dataSourceMode: DataSourceMode = DataSourceMode.Fake,
    onDataSourceModeChanged: (DataSourceMode) -> Unit = {},
    onMcpDeviceSelected: (deviceId: String, deviceName: String?) -> Unit = { _, _ -> },
    onProcessConnected: (McpProcess?) -> Unit = {},
    suppressAutoSelect: Boolean = false,
    // App selector props (kept for backwards compatibility, but FG toggle is preferred)
    installedApps: List<InstalledApp> = emptyList(),
    selectedAppId: String? = null,
    isAppListLoading: Boolean = false,
    appDropdownExpanded: Boolean = false,
    onAppDropdownExpandedChange: (Boolean) -> Unit = {},
    onAppSelected: (String?) -> Unit = {},
) {
  val colors = JewelTheme.globalColors

  Column(
      modifier = Modifier
          .fillMaxWidth()
          .background(JewelTheme.globalColors.panelBackground),
  ) {
    FlowRow(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 8.dp, vertical = 4.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalArrangement = Arrangement.spacedBy(4.dp),
    ) {
      // Left side: Device selection
      if (dataSourceMode == DataSourceMode.Fake) {
        Row(
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
          Text(
              "Devices:",
              fontSize = 11.sp,
              maxLines = 1,
              softWrap = false,
              color = colors.text.normal.copy(alpha = 0.5f),
          )

          // Device icons
          Row(
              horizontalArrangement = Arrangement.spacedBy(4.dp),
              verticalAlignment = Alignment.CenterVertically,
          ) {
            devices.forEach { device ->
              DeviceIcon(
                  device = device,
                  isActive = device.id == activeDeviceId,
                  onClick = { onDeviceSelected(device.id) },
              )
            }
          }
        }
      } else {
        // Real mode: show MCP server indicator or empty space
        Row(
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
          // Show "Devices:" when a device is selected, "MCP Servers" otherwise
          if (activeDeviceId != null) {
            Text(
                "Devices:",
                fontSize = 11.sp,
                maxLines = 1,
                softWrap = false,
                color = Color(0xFF2196F3),
                modifier = Modifier
                    .clickable {
                        // Clicking "Devices:" expands the device panel
                        // We need to deselect the device and expand the panel
                        onDeviceSelected("")
                    }
                    .pointerHoverIcon(PointerIcon.Hand),
            )

            // Show device buttons next to "Devices:" using emojis with tooltips
            devices.forEach { device ->
              val isActive = device.id == activeDeviceId
              val deviceEmoji = when (device.type) {
                  DeviceType.AndroidEmulator, DeviceType.AndroidPhysical -> "\uD83E\uDD16"  // 🤖
                  DeviceType.iOSSimulator, DeviceType.iOSPhysical -> "\uD83C\uDF4E"  // 🍎
              }
              Tooltip(
                  tooltip = {
                      Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                          Text(device.name, fontSize = 12.sp)
                          Text(
                              "Status: ${device.status}",
                              fontSize = 10.sp,
                              color = colors.text.normal.copy(alpha = 0.6f),
                          )
                          device.foregroundApp?.let { app ->
                              Text(
                                  "App: $app",
                                  fontSize = 10.sp,
                                  color = colors.text.normal.copy(alpha = 0.6f),
                              )
                          }
                      }
                  },
              ) {
                  Box(
                      modifier = Modifier
                          .background(
                              if (isActive) Color(0xFF2196F3).copy(alpha = 0.15f)
                              else colors.text.normal.copy(alpha = 0.08f),
                              RoundedCornerShape(4.dp),
                          )
                          .clickable {
                              if (device.id == activeDeviceId) {
                                  // Tapping active device expands panel to show more devices
                                  onDeviceSelected("")
                              } else {
                                  onDeviceSelected(device.id)
                              }
                          }
                          .pointerHoverIcon(PointerIcon.Hand)
                          .padding(horizontal = 8.dp, vertical = 4.dp),
                  ) {
                      Text(
                          deviceEmoji,
                          fontSize = 14.sp,
                      )
                  }
              }
            }
          } else {
            Text(
                "🔌",
                fontSize = 14.sp,
            )
            Text(
                "MCP Servers",
                fontSize = 11.sp,
                maxLines = 1,
                softWrap = false,
                color = colors.text.normal.copy(alpha = 0.7f),
            )
          }
        }
      }

      // Right side: Setup button (conditional), Real Data toggle, Live toggle
      Row(
          horizontalArrangement = Arrangement.spacedBy(8.dp),
          verticalAlignment = Alignment.CenterVertically,
      ) {
        // Setup AutoMobile button (shown when service not detected)
        if (needsSetup) {
          Box(
              modifier = Modifier
                  .background(Color(0xFF2196F3).copy(alpha = 0.15f), RoundedCornerShape(4.dp))
                  .clickable(onClick = onSetupClick)
                  .pointerHoverIcon(PointerIcon.Hand)
                  .padding(horizontal = 8.dp, vertical = 4.dp),
          ) {
            Text(
                "Setup",
                fontSize = 10.sp,
                maxLines = 1,
                softWrap = false,
                color = Color(0xFF64B5F6),
            )
          }
        }

        // Real Data switch
        RealDataSwitch(
            isRealData = dataSourceMode == DataSourceMode.Real,
            onToggle = { isReal ->
                onDataSourceModeChanged(if (isReal) DataSourceMode.Real else DataSourceMode.Fake)
            },
        )
      }
    }

    // Device management panel (expanded when no active device selected)
    if (isDevicePanelExpanded) {
      if (dataSourceMode == DataSourceMode.Real) {
        McpProcessesPanel(
            useRealData = true,
            onDeviceSelected = onMcpDeviceSelected,
            onProcessConnected = onProcessConnected,
            suppressAutoSelect = suppressAutoSelect,
        )
      } else {
        McpProcessesPanel(
            useRealData = false,
            onDeviceSelected = onMcpDeviceSelected,
            onProcessConnected = onProcessConnected,
            suppressAutoSelect = suppressAutoSelect,
        )
      }
    }
  }
}

@Composable
private fun DeviceIcon(
    device: BootedDevice,
    isActive: Boolean,
    onClick: () -> Unit,
) {
  val colors = JewelTheme.globalColors
  val bgColor =
      if (isActive) colors.text.normal.copy(alpha = 0.15f)
      else colors.text.normal.copy(alpha = 0.05f)
  val borderColor =
      if (isActive) colors.text.normal.copy(alpha = 0.4f)
      else Color.Transparent
  val iconColor =
      if (isActive) colors.text.normal
      else colors.text.normal.copy(alpha = 0.4f)

  Tooltip(
      tooltip = {
        Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
          Text(device.name, fontSize = 12.sp)
          Text(
              "Status: ${device.status}",
              fontSize = 11.sp,
              color = colors.text.normal.copy(alpha = 0.7f),
          )
          device.foregroundApp?.let { app ->
            Text(
                "App: $app",
                fontSize = 11.sp,
                color = colors.text.normal.copy(alpha = 0.7f),
            )
          }
        }
      },
  ) {
    Box(
        modifier =
            Modifier.size(28.dp)
                .background(bgColor, shape = RoundedCornerShape(6.dp))
                .then(
                    if (borderColor != Color.Transparent)
                        Modifier.border(1.5.dp, borderColor, RoundedCornerShape(6.dp))
                    else Modifier
                )
                .clickable(onClick = onClick)
                .pointerHoverIcon(PointerIcon.Hand),
        contentAlignment = Alignment.Center,
    ) {
      // Simple device icon representation
      when (device.type) {
        DeviceType.AndroidEmulator, DeviceType.AndroidPhysical -> AndroidDeviceIcon(color = iconColor)
        DeviceType.iOSSimulator, DeviceType.iOSPhysical -> AppleDeviceIcon(color = iconColor)
      }
    }
  }
}

@Composable
private fun AndroidDeviceIcon(color: Color) {
  // Simple Android robot head shape
  Box(modifier = Modifier.size(16.dp)) {
    // Body (rounded rectangle)
    Box(
        modifier =
            Modifier.align(Alignment.BottomCenter)
                .size(width = 12.dp, height = 10.dp)
                .background(color, RoundedCornerShape(topStart = 2.dp, topEnd = 2.dp, bottomStart = 3.dp, bottomEnd = 3.dp))
    )
    // Head (smaller rounded rect on top)
    Box(
        modifier =
            Modifier.align(Alignment.TopCenter)
                .offset(y = 1.dp)
                .size(width = 10.dp, height = 5.dp)
                .background(color, RoundedCornerShape(topStart = 3.dp, topEnd = 3.dp))
    )
  }
}

@Composable
private fun AppleDeviceIcon(color: Color) {
  // Simple iPhone shape (rounded rectangle with notch hint)
  Box(
      modifier =
          Modifier.size(width = 10.dp, height = 16.dp)
              .background(color, RoundedCornerShape(2.dp))
  )
}

@Composable
private fun RealDataSwitch(
    isRealData: Boolean,
    onToggle: (Boolean) -> Unit,
) {
    val colors = JewelTheme.globalColors
    val trackColor = if (isRealData) Color(0xFF4CAF50) else colors.text.normal.copy(alpha = 0.3f)
    val thumbColor = Color.White

    Row(
        horizontalArrangement = Arrangement.spacedBy(6.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            "Real Data",
            fontSize = 11.sp,
            maxLines = 1,
            softWrap = false,
            color = if (isRealData) colors.text.normal else colors.text.normal.copy(alpha = 0.5f),
        )
        Box(
            modifier = Modifier
                .width(32.dp)
                .height(18.dp)
                .clip(RoundedCornerShape(9.dp))
                .background(trackColor)
                .clickable { onToggle(!isRealData) }
                .pointerHoverIcon(PointerIcon.Hand)
                .padding(2.dp),
        ) {
            Box(
                modifier = Modifier
                    .size(14.dp)
                    .offset(x = if (isRealData) 14.dp else 0.dp)
                    .clip(CircleShape)
                    .background(thumbColor),
            )
        }
    }
}


@Composable
private fun DraggableTabs(
    tabs: List<Dashboard>,
    selectedIndex: Int,
    onTabSelected: (Int) -> Unit,
    onReorder: (fromIndex: Int, toIndex: Int) -> Unit,
    draggedIndex: Int?,
    onDragStart: (Int) -> Unit,
    onDragEnd: () -> Unit,
    dropTargetIndex: Int?,
    onDropTargetChanged: (Int?) -> Unit,
) {
    LOG.debug("DraggableTabs rendered with ${tabs.size} tabs, selectedIndex=$selectedIndex")
    val colors = JewelTheme.globalColors
    var tabPositions by remember { mutableStateOf<Map<Int, Float>>(emptyMap()) }
    var dragOffset by remember { mutableStateOf(0f) }

    BoxWithConstraints(
        modifier = Modifier
            .fillMaxWidth()
            .background(JewelTheme.globalColors.panelBackground)
    ) {
        // Three modes: icons only (< 300dp), icon + text (300-600dp), text only (> 600dp)
        val useIconsOnly = maxWidth < 300.dp
        val useIconsWithText = maxWidth >= 300.dp && maxWidth < 600.dp

        Row(
            modifier = Modifier.padding(horizontal = 4.dp),
            horizontalArrangement = Arrangement.Start,
        ) {
            tabs.forEachIndexed { index, dashboard ->
                val isSelected = index == selectedIndex
                val isDragged = index == draggedIndex
                val isDropTarget = index == dropTargetIndex && draggedIndex != null && draggedIndex != index

                Box(
                    modifier = Modifier
                        .padding(vertical = 4.dp, horizontal = 2.dp)
                        .then(
                            if (isDragged) Modifier.offset(x = dragOffset.dp)
                            else Modifier
                        )
                        .background(
                            when {
                                isDropTarget -> colors.text.normal.copy(alpha = 0.15f)
                                isSelected -> colors.text.normal.copy(alpha = 0.1f)
                                else -> Color.Transparent
                            },
                            RoundedCornerShape(6.dp)
                        )
                        .then(
                            if (isDropTarget)
                                Modifier.border(1.5.dp, Color(0xFF2196F3).copy(alpha = 0.5f), RoundedCornerShape(6.dp))
                            else Modifier
                        )
                        .clickable {
                            LOG.debug("Tab clicked via clickable: $index (${tabs[index]})")
                            onTabSelected(index)
                        }
                        .pointerInput("drag-$index") {
                            detectDragGesturesAfterLongPress(
                                onDragStart = { onDragStart(index) },
                                onDragEnd = {
                                    if (draggedIndex != null && dropTargetIndex != null && draggedIndex != dropTargetIndex) {
                                        onReorder(draggedIndex, dropTargetIndex)
                                    }
                                    dragOffset = 0f
                                    onDragEnd()
                                },
                                onDragCancel = {
                                    dragOffset = 0f
                                    onDragEnd()
                                },
                                onDrag = { change, dragAmount ->
                                    change.consume()
                                    dragOffset += dragAmount.x / 2  // Scale down for smoother feel

                                    // Calculate which tab we're over based on position
                                    val positions = tabPositions.toList().sortedBy { it.second }
                                    val draggedPos = (tabPositions[index] ?: 0f) + dragOffset
                                    var newTarget: Int? = null
                                    for (i in positions.indices) {
                                        val (tabIdx, pos) = positions[i]
                                        val nextPos = positions.getOrNull(i + 1)?.second ?: (pos + 80f)
                                        if (draggedPos >= pos && draggedPos < nextPos) {
                                            newTarget = tabIdx
                                            break
                                        }
                                    }
                                    if (newTarget != null && newTarget != draggedIndex) {
                                        onDropTargetChanged(newTarget)
                                    } else if (newTarget == draggedIndex) {
                                        onDropTargetChanged(null)
                                    }
                                }
                            )
                        }
                        .pointerHoverIcon(PointerIcon.Hand)
                        .padding(horizontal = if (useIconsOnly) 8.dp else 10.dp, vertical = 6.dp)
                        .onGloballyPositioned { coordinates ->
                            tabPositions = tabPositions + (index to coordinates.positionInParent().x)
                        },
                    contentAlignment = Alignment.Center,
                ) {
                    val textColor = when {
                        isDragged -> colors.text.normal.copy(alpha = 0.8f)
                        isSelected -> colors.text.normal
                        else -> colors.text.normal.copy(alpha = 0.6f)
                    }

                    when {
                        useIconsOnly -> {
                            Tooltip(tooltip = { Text(dashboard.title, fontSize = 11.sp) }) {
                                Text(dashboard.icon, fontSize = 14.sp)
                            }
                        }
                        useIconsWithText -> {
                            Row(
                                horizontalArrangement = Arrangement.spacedBy(4.dp),
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                Text(dashboard.icon, fontSize = 12.sp)
                                Text(
                                    dashboard.title,
                                    fontSize = 11.sp,
                                    maxLines = 1,
                                    softWrap = false,
                                    color = textColor,
                                )
                            }
                        }
                        else -> {
                            Text(
                                dashboard.title,
                                fontSize = 12.sp,
                                maxLines = 1,
                                softWrap = false,
                                color = textColor,
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun DeviceManagementPanel(
    bootedDevices: List<BootedDevice>,
    availableEmulators: List<AvailableEmulator>,
    systemImages: List<SystemImage>,
    onDeviceSelected: (String) -> Unit,
    onBootEmulator: (String) -> Unit,
    onCreateEmulator: (String) -> Unit,
) {
    val colors = JewelTheme.globalColors

    // Split devices by platform
    val androidDevices = bootedDevices.filter {
        it.type == DeviceType.AndroidEmulator || it.type == DeviceType.AndroidPhysical
    }.sortedByDescending { it.connectedAt }

    val iosDevices = bootedDevices.filter {
        it.type == DeviceType.iOSSimulator || it.type == DeviceType.iOSPhysical
    }.sortedByDescending { it.connectedAt }

    val androidEmulators = availableEmulators.filter {
        it.type == DeviceType.AndroidEmulator
    }
    val iosSimulators = availableEmulators.filter {
        it.type == DeviceType.iOSSimulator
    }

    val androidImages = systemImages.filter { it.platform == "Android" }
    val iosImages = systemImages.filter { it.platform == "iOS" }

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .background(colors.text.normal.copy(alpha = 0.02f))
            .padding(8.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        // Active Devices section
        if (androidDevices.isNotEmpty() || iosDevices.isNotEmpty()) {
            DeviceSectionHeader("Active Devices")
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(16.dp),
            ) {
                // Android column
                Column(
                    modifier = Modifier.weight(1f),
                    verticalArrangement = Arrangement.spacedBy(4.dp),
                ) {
                    Text("Android", fontSize = 10.sp, color = colors.text.normal.copy(alpha = 0.5f))
                    if (androidDevices.isEmpty()) {
                        Text("None", fontSize = 11.sp, color = colors.text.normal.copy(alpha = 0.3f))
                    } else {
                        androidDevices.forEach { device ->
                            DeviceListItem(
                                name = device.name,
                                status = device.status,
                                icon = if (device.type == DeviceType.AndroidPhysical) "📱" else "📲",
                                onClick = { onDeviceSelected(device.id) },
                            )
                        }
                    }
                }

                // iOS column
                Column(
                    modifier = Modifier.weight(1f),
                    verticalArrangement = Arrangement.spacedBy(4.dp),
                ) {
                    Text("iOS", fontSize = 10.sp, color = colors.text.normal.copy(alpha = 0.5f))
                    if (iosDevices.isEmpty()) {
                        Text("None", fontSize = 11.sp, color = colors.text.normal.copy(alpha = 0.3f))
                    } else {
                        iosDevices.forEach { device ->
                            DeviceListItem(
                                name = device.name,
                                status = device.status,
                                icon = if (device.type == DeviceType.iOSPhysical) "📱" else "📲",
                                onClick = { onDeviceSelected(device.id) },
                            )
                        }
                    }
                }
            }
        }

        // Available Emulators/Simulators section
        if (androidEmulators.isNotEmpty() || iosSimulators.isNotEmpty()) {
            DeviceSectionHeader("Available to Boot")
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(16.dp),
            ) {
                // Android emulators
                Column(
                    modifier = Modifier.weight(1f),
                    verticalArrangement = Arrangement.spacedBy(4.dp),
                ) {
                    if (androidEmulators.isNotEmpty()) {
                        androidEmulators.forEach { emulator ->
                            EmulatorListItem(
                                name = emulator.name,
                                apiLevel = emulator.apiLevel,
                                icon = "🤖",
                                onClick = { onBootEmulator(emulator.id) },
                            )
                        }
                    }
                }

                // iOS simulators
                Column(
                    modifier = Modifier.weight(1f),
                    verticalArrangement = Arrangement.spacedBy(4.dp),
                ) {
                    if (iosSimulators.isNotEmpty()) {
                        iosSimulators.forEach { simulator ->
                            EmulatorListItem(
                                name = simulator.name,
                                apiLevel = null,
                                icon = "🍎",
                                onClick = { onBootEmulator(simulator.id) },
                            )
                        }
                    }
                }
            }
        }

        // System Images section
        if (androidImages.isNotEmpty() || iosImages.isNotEmpty()) {
            DeviceSectionHeader("System Images")
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(16.dp),
            ) {
                // Android images
                Column(
                    modifier = Modifier.weight(1f),
                    verticalArrangement = Arrangement.spacedBy(4.dp),
                ) {
                    if (androidImages.isNotEmpty()) {
                        androidImages.forEach { image ->
                            SystemImageListItem(
                                name = image.name,
                                apiLevel = image.apiLevel,
                                icon = "💿",
                                onClick = { onCreateEmulator(image.id) },
                            )
                        }
                    }
                }

                // iOS images
                Column(
                    modifier = Modifier.weight(1f),
                    verticalArrangement = Arrangement.spacedBy(4.dp),
                ) {
                    if (iosImages.isNotEmpty()) {
                        iosImages.forEach { image ->
                            SystemImageListItem(
                                name = image.name,
                                apiLevel = image.apiLevel,
                                icon = "💿",
                                onClick = { onCreateEmulator(image.id) },
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun DeviceSectionHeader(title: String) {
    val colors = JewelTheme.globalColors
    Text(
        title,
        fontSize = 11.sp,
        color = colors.text.normal.copy(alpha = 0.6f),
    )
}

@Composable
private fun DeviceListItem(
    name: String,
    status: String,
    icon: String,
    onClick: () -> Unit,
) {
    val colors = JewelTheme.globalColors

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(colors.text.normal.copy(alpha = 0.05f), RoundedCornerShape(4.dp))
            .clickable(onClick = onClick)
            .pointerHoverIcon(PointerIcon.Hand)
            .padding(horizontal = 8.dp, vertical = 6.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(icon, fontSize = 14.sp)
        Column(modifier = Modifier.weight(1f)) {
            Text(name, fontSize = 11.sp, maxLines = 1)
            Text(
                status,
                fontSize = 9.sp,
                color = Color(0xFF4CAF50),
            )
        }
    }
}

@Composable
private fun EmulatorListItem(
    name: String,
    apiLevel: String?,
    icon: String,
    onClick: () -> Unit,
) {
    val colors = JewelTheme.globalColors

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(colors.text.normal.copy(alpha = 0.03f), RoundedCornerShape(4.dp))
            .clickable(onClick = onClick)
            .pointerHoverIcon(PointerIcon.Hand)
            .padding(horizontal = 8.dp, vertical = 6.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(icon, fontSize = 14.sp)
        Column(modifier = Modifier.weight(1f)) {
            Text(name, fontSize = 11.sp, maxLines = 1)
            if (apiLevel != null) {
                Text(
                    "API $apiLevel",
                    fontSize = 9.sp,
                    color = colors.text.normal.copy(alpha = 0.5f),
                )
            }
        }
        Text("Boot", fontSize = 10.sp, color = Color(0xFF2196F3))
    }
}

@Composable
private fun SystemImageListItem(
    name: String,
    apiLevel: String,
    icon: String,
    onClick: () -> Unit,
) {
    val colors = JewelTheme.globalColors

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(colors.text.normal.copy(alpha = 0.03f), RoundedCornerShape(4.dp))
            .clickable(onClick = onClick)
            .pointerHoverIcon(PointerIcon.Hand)
            .padding(horizontal = 8.dp, vertical = 6.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(icon, fontSize = 14.sp)
        Column(modifier = Modifier.weight(1f)) {
            Text(name, fontSize = 11.sp, maxLines = 1)
            Text(
                "API $apiLevel",
                fontSize = 9.sp,
                color = colors.text.normal.copy(alpha = 0.5f),
            )
        }
        Text("Create", fontSize = 10.sp, color = Color(0xFF2196F3))
    }
}

// Test result state
data class TestResult(
    val pid: Int,
    val success: Boolean,
    val latencyMs: Long? = null,
    val error: String? = null,
    val timestamp: Long = System.currentTimeMillis(),
)

@Composable
private fun McpProcessesPanel(
    useRealData: Boolean = false,
    onDeviceSelected: (deviceId: String, deviceName: String?) -> Unit = { _, _ -> },
    onProcessConnected: (McpProcess?) -> Unit = {},  // Called when MCP process connection changes
    suppressAutoSelect: Boolean = false,  // When true, don't auto-select device (user wants to browse)
) {
    val colors = JewelTheme.globalColors

    // Use appropriate detector based on mode
    val detector = remember(useRealData) {
        if (useRealData) RealMcpProcessDetector() else FakeMcpProcessDetector()
    }

    // Detect processes (with refresh capability)
    var refreshCounter by remember { mutableIntStateOf(0) }
    var processes by remember { mutableStateOf<List<McpProcess>>(emptyList()) }
    var isLoading by remember { mutableStateOf(true) }

    LaunchedEffect(useRealData, refreshCounter) {
        isLoading = true
        processes = detector.detectProcesses()
        isLoading = false
        LOG.debug("[McpProcessesPanel] Detected ${processes.size} MCP processes (useRealData=$useRealData)")
        processes.forEach { p ->
            LOG.debug("[McpProcessesPanel]   - ${p.name} (PID ${p.pid}, ${p.connectionType}, socket=${p.socketPath}, port=${p.port})")
        }
    }

    // State for connected server
    var connectedProcess by remember { mutableStateOf<McpProcess?>(null) }

    // Notify parent when connected process changes
    LaunchedEffect(connectedProcess) {
        LOG.debug("[McpProcessesPanel] LaunchedEffect(connectedProcess) triggered, connectedProcess=${connectedProcess?.let { "${it.name} (PID ${it.pid})" } ?: "null"}")
        onProcessConnected(connectedProcess)
    }

    // Auto-connect to the first Unix Socket process if there's only one
    LaunchedEffect(processes) {
        val socketProcesses = processes.filter { it.connectionType == McpConnectionType.UnixSocket }
        if (socketProcesses.size == 1 && connectedProcess == null) {
            val autoConnectProcess = socketProcesses.first()
            LOG.debug("[McpProcessesPanel] Auto-connecting to ${autoConnectProcess.name} (PID ${autoConnectProcess.pid})")
            connectedProcess = autoConnectProcess
            // Call directly - don't rely on LaunchedEffect(connectedProcess) which may not
            // fire before component is removed from composition due to device auto-selection
            onProcessConnected(autoConnectProcess)
        }
    }

    // State for details panel
    var detailsProcess by remember { mutableStateOf<McpProcess?>(null) }

    // State for test results
    var testResults by remember { mutableStateOf<Map<Int, TestResult>>(emptyMap()) }
    var testingPid by remember { mutableStateOf<Int?>(null) }

    // State for daemon spawning
    var isDaemonStarting by remember { mutableStateOf(false) }
    var daemonStartError by remember { mutableStateOf<String?>(null) }

    // State for device booting
    var bootingDeviceIds by remember { mutableStateOf<Set<String>>(emptySet()) }
    var bootErrors by remember { mutableStateOf<Map<String, String>>(emptyMap()) }

    // State for device selection
    var selectingDevice by remember { mutableStateOf<dev.jasonpearson.automobile.ide.mcp.BootedDeviceInfo?>(null) }
    var selectError by remember { mutableStateOf<String?>(null) }

    // State for devices (fetched from connected MCP server)
    var bootedDevices by remember { mutableStateOf<List<dev.jasonpearson.automobile.ide.mcp.BootedDeviceInfo>>(emptyList()) }
    var deviceImages by remember { mutableStateOf<List<dev.jasonpearson.automobile.ide.mcp.DeviceImageInfo>>(emptyList()) }
    var devicesLoading by remember { mutableStateOf(false) }
    var devicesError by remember { mutableStateOf<String?>(null) }

    // Fetch devices when connected
    LaunchedEffect(connectedProcess) {
        val process = connectedProcess
        if (process != null) {
            devicesLoading = true
            devicesError = null
            try {
                LOG.debug("[AutoMobile IDE] Creating MCP client for process: ${process.name}, type: ${process.connectionType}, socket: ${process.socketPath}, port: ${process.port}")

                val client = if (useRealData) {
                    dev.jasonpearson.automobile.ide.mcp.McpResourceClientFactory.create(process)
                } else {
                    dev.jasonpearson.automobile.ide.mcp.McpResourceClientFactory.createFake()
                }

                LOG.debug("[AutoMobile IDE] Fetching booted devices from automobile:devices/booted")
                // Fetch booted devices
                when (val result = client.readResource("automobile:devices/booted")) {
                    is dev.jasonpearson.automobile.ide.mcp.ResourceReadResult.Success -> {
                        LOG.debug("[AutoMobile IDE] Successfully fetched booted devices: ${result.content.take(200)}...")
                        val parsed = dev.jasonpearson.automobile.ide.mcp.DeviceResourceParser.parseBootedDevices(result.content)
                        bootedDevices = parsed?.devices ?: emptyList()
                        LOG.debug("[AutoMobile IDE] Parsed ${bootedDevices.size} booted devices")
                    }
                    is dev.jasonpearson.automobile.ide.mcp.ResourceReadResult.Error -> {
                        LOG.debug("[AutoMobile IDE] Error fetching booted devices: ${result.message}")
                        devicesError = result.message
                    }
                }

                LOG.debug("[AutoMobile IDE] Fetching device images from automobile:devices/images")
                // Fetch device images
                when (val result = client.readResource("automobile:devices/images")) {
                    is dev.jasonpearson.automobile.ide.mcp.ResourceReadResult.Success -> {
                        LOG.debug("[AutoMobile IDE] Successfully fetched device images: ${result.content.take(200)}...")
                        val parsed = dev.jasonpearson.automobile.ide.mcp.DeviceResourceParser.parseDeviceImages(result.content)
                        deviceImages = parsed?.images ?: emptyList()
                        LOG.debug("[AutoMobile IDE] Parsed ${deviceImages.size} device images")
                    }
                    is dev.jasonpearson.automobile.ide.mcp.ResourceReadResult.Error -> {
                        LOG.debug("[AutoMobile IDE] Error fetching device images: ${result.message}")
                        // Don't overwrite error from booted devices
                        if (devicesError == null) devicesError = result.message
                    }
                }

                client.close()
            } catch (e: Exception) {
                val stackTrace = e.stackTraceToString()
                LOG.debug("[AutoMobile IDE] Exception fetching devices: ${e.javaClass.name}: ${e.message}")
                LOG.debug("[AutoMobile IDE] Stack trace:\n$stackTrace")
                devicesError = "${e.javaClass.simpleName}: ${e.message}\n\nStack trace:\n${stackTrace.lines().take(5).joinToString("\n")}"
            }
            devicesLoading = false
        } else {
            // Clear device data when disconnected
            bootedDevices = emptyList()
            deviceImages = emptyList()
            devicesError = null
        }
    }

    // Auto-select the first device if there's only one (unless suppressed by user navigation)
    LaunchedEffect(bootedDevices, suppressAutoSelect) {
        if (!suppressAutoSelect && bootedDevices.size == 1 && selectingDevice == null) {
            val autoSelectDevice = bootedDevices.first()
            LOG.debug("[McpProcessesPanel] Auto-selecting device: ${autoSelectDevice.name} (${autoSelectDevice.deviceId})")
            selectingDevice = autoSelectDevice
            onDeviceSelected(autoSelectDevice.deviceId, autoSelectDevice.name)
        }
    }

    // Handlers
    val onConnect: (McpProcess) -> Unit = { process ->
        // Toggle: if already connected to this process, disconnect; otherwise connect
        val wasConnected = connectedProcess?.pid == process.pid
        connectedProcess = if (wasConnected) null else process
        LOG.debug("[McpProcessesPanel] Connect button clicked for ${process.name} (PID ${process.pid})")
        LOG.debug("[McpProcessesPanel] ${if (wasConnected) "Disconnecting from" else "Connecting to"} process")
        LOG.debug("[McpProcessesPanel] connectedProcess is now: ${connectedProcess?.name ?: "null"}")
    }

    val onDetails: (McpProcess) -> Unit = { process ->
        detailsProcess = if (detailsProcess?.pid == process.pid) null else process
    }

    val onTest: (McpProcess) -> Unit = { process ->
        testingPid = process.pid
    }

    val onStartDaemon: () -> Unit = {
        isDaemonStarting = true
        daemonStartError = null
    }

    // Launch daemon when requested
    LaunchedEffect(isDaemonStarting) {
        if (isDaemonStarting) {
            try {
                LOG.debug("[AutoMobile IDE] Starting daemon...")
                val processBuilder = ProcessBuilder("auto-mobile", "--daemon", "start")
                processBuilder.redirectErrorStream(true)
                val process = processBuilder.start()

                // Read output
                val output = process.inputStream.bufferedReader().readText()
                val exitCode = process.waitFor()

                if (exitCode == 0) {
                    LOG.debug("[AutoMobile IDE] Daemon started successfully")
                    // Wait a bit for daemon to initialize, then refresh
                    kotlinx.coroutines.delay(2000)
                    refreshCounter++
                } else {
                    LOG.debug("[AutoMobile IDE] Daemon start failed with exit code $exitCode: $output")
                    daemonStartError = "Failed to start daemon (exit code $exitCode)"
                }
            } catch (e: Exception) {
                LOG.debug("[AutoMobile IDE] Exception starting daemon: ${e.message}")
                e.printStackTrace()
                daemonStartError = "Error starting daemon: ${e.message}"
            }
            isDaemonStarting = false
        }
    }

    // Boot devices when requested
    LaunchedEffect(bootingDeviceIds.hashCode()) {
        bootingDeviceIds.forEach { deviceKey ->
            try {
                val image = deviceImages.find { (it.deviceId ?: it.name) == deviceKey }
                if (image == null || connectedProcess == null) {
                    bootingDeviceIds = bootingDeviceIds - deviceKey
                    return@forEach
                }

                LOG.debug("[AutoMobile IDE] Booting device: ${image.name}")
                val client = dev.jasonpearson.automobile.ide.daemon.McpClientFactory.createPreferred(null)

                val result = client.startDevice(
                    name = image.name,
                    platform = image.platform,
                    deviceId = image.deviceId,
                )

                if (result.success) {
                    LOG.debug("[AutoMobile IDE] Device booted successfully: ${image.name}")
                    // Refresh device list after successful boot
                    kotlinx.coroutines.delay(3000)
                    refreshCounter++
                } else {
                    LOG.debug("[AutoMobile IDE] Failed to boot device: ${result.message}")
                    bootErrors = bootErrors + (deviceKey to (result.message ?: "Failed to boot"))
                }
            } catch (e: Exception) {
                LOG.debug("[AutoMobile IDE] Exception booting device: ${e.message}")
                e.printStackTrace()
                bootErrors = bootErrors + (deviceKey to (e.message ?: "Error booting device"))
            }
            bootingDeviceIds = bootingDeviceIds - deviceKey
        }
    }

    // Select device when requested
    LaunchedEffect(selectingDevice) {
        LOG.debug("[AutoMobile IDE] LaunchedEffect triggered. selectingDevice: ${selectingDevice?.name}, connectedProcess: ${connectedProcess?.name}")
        val device = selectingDevice
        if (device != null && connectedProcess != null) {
            try {
                LOG.debug("[AutoMobile IDE] Selecting device: ${device.name}, deviceId: ${device.deviceId}, platform: ${device.platform}")
                val client = dev.jasonpearson.automobile.ide.daemon.McpClientFactory.createPreferred(null)
                LOG.debug("[AutoMobile IDE] Created client: $client")

                val result = client.setActiveDevice(device.deviceId, device.platform)
                LOG.debug("[AutoMobile IDE] setActiveDevice result: success=${result.success}, message=${result.message}")

                if (result.success) {
                    LOG.debug("[AutoMobile IDE] Device selected successfully: ${device.name}")
                    selectError = null
                } else {
                    LOG.debug("[AutoMobile IDE] Failed to select device: ${result.message}")
                    selectError = result.message
                }
            } catch (e: Exception) {
                LOG.debug("[AutoMobile IDE] Exception selecting device: ${e.message}")
                e.printStackTrace()
                selectError = e.message ?: "Error selecting device"
            }
            selectingDevice = null
            LOG.debug("[AutoMobile IDE] Reset selectingDevice to null")
        } else {
            LOG.debug("[AutoMobile IDE] Skipping selection - device: ${device?.name}, connectedProcess: ${connectedProcess?.name}")
        }
    }

    // Handle test execution via LaunchedEffect
    LaunchedEffect(testingPid) {
        if (testingPid != null) {
            kotlinx.coroutines.delay(500) // Simulate network latency
            val success = (0..10).random() > 2 // 80% success rate for demo
            val result = if (success) {
                TestResult(
                    pid = testingPid!!,
                    success = true,
                    latencyMs = (20..150).random().toLong(),
                )
            } else {
                TestResult(
                    pid = testingPid!!,
                    success = false,
                    error = "Connection refused",
                )
            }
            testResults = testResults + (testingPid!! to result)
            testingPid = null
        }
    }

    // Group by connection type
    val streamableProcesses = processes.filter { it.connectionType == McpConnectionType.StreamableHttp }
    val socketProcesses = processes.filter { it.connectionType == McpConnectionType.UnixSocket }
    val stdioProcesses = processes.filter { it.connectionType == McpConnectionType.Stdio }

    LOG.debug("[McpProcessesPanel] Process breakdown: streamable=${streamableProcesses.size}, socket=${socketProcesses.size}, stdio=${stdioProcesses.size}")

    val scrollState = rememberScrollState()

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .verticalScroll(scrollState)
            .background(colors.text.normal.copy(alpha = 0.02f))
            .padding(12.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        // Header with Start Daemon button
        if (useRealData && socketProcesses.isEmpty() && !isDaemonStarting) {
            Box(
                modifier = Modifier
                    .background(Color(0xFF4CAF50).copy(alpha = 0.15f), RoundedCornerShape(4.dp))
                    .clickable { onStartDaemon() }
                    .pointerHoverIcon(PointerIcon.Hand)
                    .padding(horizontal = 8.dp, vertical = 4.dp),
            ) {
                Text(
                    "Start Daemon",
                    fontSize = 10.sp,
                    color = Color(0xFF4CAF50),
                )
            }
        }
        if (isDaemonStarting) {
            Text(
                "Starting...",
                fontSize = 10.sp,
                color = Color(0xFF2196F3),
            )
        }

        // Daemon start error
        if (daemonStartError != null) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(Color(0xFFE53935).copy(alpha = 0.1f), RoundedCornerShape(6.dp))
                    .padding(12.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text("⚠", fontSize = 14.sp, color = Color(0xFFE53935))
                Text(
                    daemonStartError!!,
                    fontSize = 11.sp,
                    color = Color(0xFFE53935),
                    modifier = Modifier.weight(1f),
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
                Text(
                    "✕",
                    fontSize = 14.sp,
                    color = Color(0xFFE53935).copy(alpha = 0.5f),
                    modifier = Modifier
                        .clickable { daemonStartError = null }
                        .pointerHoverIcon(PointerIcon.Hand),
                )
            }
        }

        if (isLoading && processes.isEmpty()) {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(32.dp),
                contentAlignment = Alignment.Center,
            ) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Text("⟳", fontSize = 24.sp, color = Color(0xFF2196F3))
                    Text(
                        "Detecting MCP servers...",
                        fontSize = 12.sp,
                        color = colors.text.normal.copy(alpha = 0.5f),
                        modifier = Modifier.padding(top = 8.dp),
                    )
                }
            }
        } else if (processes.isEmpty()) {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(32.dp),
                contentAlignment = Alignment.Center,
            ) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Text(if (useRealData) "🔍" else "📋", fontSize = 24.sp)
                    Text(
                        if (useRealData) "No AutoMobile servers detected"
                        else "Mock MCP Servers",
                        fontSize = 12.sp,
                        color = colors.text.normal.copy(alpha = 0.5f),
                        modifier = Modifier.padding(top = 8.dp),
                    )
                    if (useRealData) {
                        Text(
                            "Start a daemon to enable MCP features",
                            fontSize = 10.sp,
                            color = colors.text.normal.copy(alpha = 0.4f),
                            modifier = Modifier.padding(top = 4.dp),
                        )
                        Row(
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                            modifier = Modifier.padding(top = 12.dp),
                        ) {
                            Box(
                                modifier = Modifier
                                    .background(Color(0xFF4CAF50).copy(alpha = 0.15f), RoundedCornerShape(4.dp))
                                    .clickable(enabled = !isDaemonStarting) { onStartDaemon() }
                                    .pointerHoverIcon(if (isDaemonStarting) PointerIcon.Default else PointerIcon.Hand)
                                    .padding(horizontal = 12.dp, vertical = 6.dp),
                            ) {
                                Text(
                                    if (isDaemonStarting) "Starting..." else "Start Daemon",
                                    fontSize = 11.sp,
                                    color = Color(0xFF4CAF50),
                                )
                            }
                            Text(
                                "↻ Refresh",
                                fontSize = 10.sp,
                                color = Color(0xFF2196F3),
                                modifier = Modifier
                                    .clickable { refreshCounter++ }
                                    .pointerHoverIcon(PointerIcon.Hand),
                            )
                        }
                    } else {
                        Text(
                            "Switch to Real mode to detect actual servers",
                            fontSize = 10.sp,
                            color = colors.text.normal.copy(alpha = 0.4f),
                            modifier = Modifier.padding(top = 4.dp),
                        )
                    }
                }
            }
        } else {
            // Streamable HTTP servers
            if (streamableProcesses.isNotEmpty()) {
                ProcessSection(
                    title = "Streamable HTTP",
                    icon = "🌐",
                    processes = streamableProcesses,
                    connectedPid = connectedProcess?.pid,
                    testResults = testResults,
                    testingPid = testingPid,
                    detailsPid = detailsProcess?.pid,
                    onConnect = onConnect,
                    onDetails = onDetails,
                    onTest = onTest,
                )
            }

            // Unix Socket servers
            if (socketProcesses.isNotEmpty()) {
                ProcessSection(
                    title = "Unix Socket",
                    icon = "🔌",
                    processes = socketProcesses,
                    connectedPid = connectedProcess?.pid,
                    testResults = testResults,
                    testingPid = testingPid,
                    detailsPid = detailsProcess?.pid,
                    onConnect = onConnect,
                    onDetails = onDetails,
                    onTest = onTest,
                )
            }

            // Devices section (when connected)
            LOG.debug("[McpProcessesPanel] connectedProcess=$connectedProcess, bootedDevices.size=${bootedDevices.size}")
            if (connectedProcess != null) {
                LOG.debug("[McpProcessesPanel] Showing DevicesSection")
                DevicesSection(
                    bootedDevices = bootedDevices,
                    deviceImages = deviceImages,
                    isLoading = devicesLoading,
                    error = devicesError,
                    bootingDeviceIds = bootingDeviceIds,
                    bootErrors = bootErrors,
                    onSelectDevice = { device ->
                        LOG.debug("[AutoMobile IDE] Select clicked for device: ${device.name}, deviceId: ${device.deviceId}, platform: ${device.platform}")
                        selectingDevice = device
                        selectError = null
                        LOG.debug("[AutoMobile IDE] Set selectingDevice to: ${device.name}")
                        // Notify parent to transition to dashboard view
                        onDeviceSelected(device.deviceId, device.name)
                    },
                    onBootDevice = { image ->
                        val deviceKey = image.deviceId ?: image.name
                        bootingDeviceIds = bootingDeviceIds + deviceKey
                        bootErrors = bootErrors - deviceKey
                    },
                )
            }

            // Potential ports info
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(colors.text.normal.copy(alpha = 0.03f), RoundedCornerShape(6.dp))
                    .padding(12.dp),
            ) {
                Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Text(
                        "Connection Info",
                        fontSize = 11.sp,
                        maxLines = 1,
                        softWrap = false,
                        fontWeight = androidx.compose.ui.text.font.FontWeight.Medium,
                        color = colors.text.normal.copy(alpha = 0.7f),
                    )
                    Row(horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                        Column {
                            Text("Active Ports", fontSize = 9.sp, maxLines = 1, softWrap = false, color = colors.text.normal.copy(alpha = 0.5f))
                            Text(
                                streamableProcesses.mapNotNull { it.port }.joinToString(", ") { ":$it" }.ifEmpty { "None" },
                                fontSize = 11.sp,
                                color = colors.text.normal,
                                maxLines = 1,
                                softWrap = false,
                                overflow = TextOverflow.Ellipsis,
                            )
                        }
                        Column {
                            Text("Socket Paths", fontSize = 9.sp, maxLines = 1, softWrap = false, color = colors.text.normal.copy(alpha = 0.5f))
                            Text(
                                socketProcesses.mapNotNull { it.socketPath }.joinToString(", ").ifEmpty { "None" },
                                fontSize = 11.sp,
                                color = colors.text.normal,
                                maxLines = 1,
                                softWrap = false,
                                overflow = TextOverflow.Ellipsis,
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun ProcessSection(
    title: String,
    icon: String,
    processes: List<McpProcess>,
    connectedPid: Int?,
    testResults: Map<Int, TestResult>,
    testingPid: Int?,
    detailsPid: Int?,
    onConnect: (McpProcess) -> Unit,
    onDetails: (McpProcess) -> Unit,
    onTest: (McpProcess) -> Unit,
) {
    val colors = JewelTheme.globalColors

    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Row(
            horizontalArrangement = Arrangement.spacedBy(6.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(icon, fontSize = 12.sp)
            Text(
                title,
                fontSize = 11.sp,
                maxLines = 1,
                softWrap = false,
                fontWeight = androidx.compose.ui.text.font.FontWeight.Medium,
                color = colors.text.normal.copy(alpha = 0.7f),
            )
            Box(
                modifier = Modifier
                    .background(Color(0xFF4CAF50).copy(alpha = 0.2f), RoundedCornerShape(4.dp))
                    .padding(horizontal = 6.dp, vertical = 2.dp),
            ) {
                Text(
                    "${processes.size}",
                    fontSize = 9.sp,
                    color = Color(0xFF4CAF50),
                )
            }
        }

        processes.forEach { process ->
            McpProcessItem(
                process = process,
                isConnected = connectedPid == process.pid,
                testResult = testResults[process.pid],
                isTesting = testingPid == process.pid,
                showDetails = detailsPid == process.pid,
                onConnect = onConnect,
                onDetails = onDetails,
                onTest = onTest,
            )
        }
    }
}

@Composable
private fun McpProcessItem(
    process: McpProcess,
    isConnected: Boolean = false,
    testResult: TestResult? = null,
    isTesting: Boolean = false,
    showDetails: Boolean = false,
    onConnect: (McpProcess) -> Unit = {},
    onDetails: (McpProcess) -> Unit = {},
    onTest: (McpProcess) -> Unit = {},
) {
    val colors = JewelTheme.globalColors
    val uptimeText = formatUptime(process.uptimeMs)

    BoxWithConstraints {
        val isCompressed = maxWidth < 300.dp
        Column {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(
                        if (isConnected) Color(0xFF4CAF50).copy(alpha = 0.1f)
                        else colors.text.normal.copy(alpha = 0.05f),
                        RoundedCornerShape(topStart = 6.dp, topEnd = 6.dp, bottomStart = if (showDetails) 0.dp else 6.dp, bottomEnd = if (showDetails) 0.dp else 6.dp),
                    )
                    .then(
                        if (isConnected) Modifier.border(1.dp, Color(0xFF4CAF50).copy(alpha = 0.3f), RoundedCornerShape(topStart = 6.dp, topEnd = 6.dp, bottomStart = if (showDetails) 0.dp else 6.dp, bottomEnd = if (showDetails) 0.dp else 6.dp))
                        else Modifier
                    )
                    .padding(10.dp),
                horizontalArrangement = Arrangement.spacedBy(12.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
            // Status indicator
            Box(
                modifier = Modifier
                    .size(8.dp)
                    .background(
                        if (isConnected) Color(0xFF4CAF50) else Color(0xFF4CAF50).copy(alpha = 0.5f),
                        CircleShape,
                    ),
            )

            // Process info
            Column(modifier = Modifier.weight(1f)) {
                Row(
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(
                        process.name,
                        fontSize = 12.sp,
                        fontWeight = androidx.compose.ui.text.font.FontWeight.Medium,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                    Text(
                        "PID ${process.pid}",
                        fontSize = 10.sp,
                        maxLines = 1,
                        softWrap = false,
                        color = colors.text.normal.copy(alpha = 0.5f),
                    )
                    if (isConnected) {
                        Text(
                            "● Active",
                            fontSize = 9.sp,
                            maxLines = 1,
                            softWrap = false,
                            color = Color(0xFF4CAF50),
                        )
                    }
                }
                Row(
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    when (process.connectionType) {
                        McpConnectionType.StreamableHttp -> {
                            Text(
                                "http://localhost:${process.port}",
                                fontSize = 10.sp,
                                color = Color(0xFF2196F3),
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                            )
                        }
                        McpConnectionType.UnixSocket -> {
                            Text(
                                process.socketPath ?: "Unknown socket",
                                fontSize = 10.sp,
                                color = Color(0xFF9C27B0),
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                            )
                        }
                        McpConnectionType.Stdio -> {
                            Text(
                                "Standard I/O",
                                fontSize = 10.sp,
                                maxLines = 1,
                                softWrap = false,
                                color = Color(0xFFFF9800),
                            )
                        }
                    }
                    Text("•", fontSize = 10.sp, maxLines = 1, softWrap = false, color = colors.text.normal.copy(alpha = 0.3f))
                    Text(
                        "Up $uptimeText",
                        fontSize = 10.sp,
                        maxLines = 1,
                        softWrap = false,
                        color = colors.text.normal.copy(alpha = 0.5f),
                    )

                    // Test result indicator
                    if (isTesting) {
                        Text(
                            "Testing...",
                            fontSize = 10.sp,
                            maxLines = 1,
                            softWrap = false,
                            color = Color(0xFF2196F3),
                        )
                    } else if (testResult != null) {
                        Text("•", fontSize = 10.sp, maxLines = 1, softWrap = false, color = colors.text.normal.copy(alpha = 0.3f))
                        if (testResult.success) {
                            Text(
                                "✓ ${testResult.latencyMs}ms",
                                fontSize = 10.sp,
                                maxLines = 1,
                                softWrap = false,
                                color = Color(0xFF4CAF50),
                            )
                        } else {
                            Text(
                                "✗ ${testResult.error}",
                                fontSize = 10.sp,
                                color = Color(0xFFE53935),
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                            )
                        }
                    }
                }
            }

            // Action buttons
            Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                // Test button
                Box(
                    modifier = Modifier
                        .background(
                            when {
                                isTesting -> Color(0xFF2196F3).copy(alpha = 0.15f)
                                testResult?.success == true -> Color(0xFF4CAF50).copy(alpha = 0.1f)
                                testResult?.success == false -> Color(0xFFE53935).copy(alpha = 0.1f)
                                else -> colors.text.normal.copy(alpha = 0.08f)
                            },
                            RoundedCornerShape(4.dp),
                        )
                        .clickable(enabled = !isTesting) { onTest(process) }
                        .pointerHoverIcon(if (isTesting) PointerIcon.Default else PointerIcon.Hand)
                        .padding(horizontal = 8.dp, vertical = 6.dp),
                ) {
                    Text(
                        when {
                            isTesting -> "..."
                            isCompressed -> "🧪"
                            else -> "Test"
                        },
                        fontSize = 10.sp,
                        maxLines = 1,
                        softWrap = false,
                        color = when {
                            isTesting -> Color(0xFF2196F3)
                            testResult?.success == true -> Color(0xFF4CAF50)
                            testResult?.success == false -> Color(0xFFE53935)
                            else -> colors.text.normal.copy(alpha = 0.7f)
                        },
                    )
                }

                // Details button
                Box(
                    modifier = Modifier
                        .background(
                            if (showDetails) Color(0xFF9C27B0).copy(alpha = 0.25f)
                            else Color(0xFF9C27B0).copy(alpha = 0.15f),
                            RoundedCornerShape(4.dp),
                        )
                        .clickable { onDetails(process) }
                        .pointerHoverIcon(PointerIcon.Hand)
                        .padding(horizontal = 8.dp, vertical = 6.dp),
                ) {
                    Text(
                        if (isCompressed) "📋" else if (showDetails) "Hide" else "Details",
                        fontSize = 10.sp,
                        maxLines = 1,
                        softWrap = false,
                        color = Color(0xFF9C27B0),
                    )
                }

                // Connect toggle button
                Box(
                    modifier = Modifier
                        .background(
                            if (isConnected) Color(0xFF4CAF50).copy(alpha = 0.3f)
                            else Color(0xFF4CAF50).copy(alpha = 0.15f),
                            RoundedCornerShape(4.dp),
                        )
                        .clickable {
                            LOG.debug("[McpProcessItem] Connect button clicked for ${process.name}")
                            onConnect(process)
                        }
                        .pointerHoverIcon(PointerIcon.Hand)
                        .padding(horizontal = 8.dp, vertical = 6.dp),
                ) {
                    Text(
                        when {
                            isCompressed && isConnected -> "✓"
                            isCompressed -> "🔌"
                            isConnected -> "Connected ✓"
                            else -> "Connect"
                        },
                        fontSize = 10.sp,
                        maxLines = 1,
                        softWrap = false,
                        color = Color(0xFF4CAF50),
                    )
                }
            }
        }

            // Details panel
            if (showDetails) {
                McpProcessDetails(process = process)
            }
        }
    }
}

@Composable
private fun McpProcessDetails(process: McpProcess) {
    val colors = JewelTheme.globalColors
    var resources by remember { mutableStateOf<List<McpResource>?>(null) }
    var tools by remember { mutableStateOf<List<McpTool>?>(null) }
    var resourcesExpanded by remember { mutableStateOf(false) }
    var toolsExpanded by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }

    // Fetch resources and tools from MCP server
    LaunchedEffect(process.pid) {
        kotlinx.coroutines.withContext(kotlinx.coroutines.Dispatchers.IO) {
            try {
                kotlinx.coroutines.withTimeout(5000) {
                    val client = when (process.connectionType) {
                        McpConnectionType.StreamableHttp -> McpHttpClient("http://localhost:${process.port}/auto-mobile/streamable")
                        McpConnectionType.UnixSocket -> McpDaemonClient(process.socketPath ?: "")
                        McpConnectionType.Stdio -> null // STDIO shouldn't appear
                    }

                    if (client != null) {
                        val fetchedResources = client.listResources()
                        val fetchedTools = client.listTools()
                        kotlinx.coroutines.withContext(kotlinx.coroutines.Dispatchers.Main) {
                            resources = fetchedResources
                            tools = fetchedTools
                            error = null
                        }
                    }
                }
            } catch (e: kotlinx.coroutines.TimeoutCancellationException) {
                kotlinx.coroutines.withContext(kotlinx.coroutines.Dispatchers.Main) {
                    error = "Timeout fetching data (5s)"
                }
            } catch (e: Exception) {
                kotlinx.coroutines.withContext(kotlinx.coroutines.Dispatchers.Main) {
                    error = "Failed: ${e.message}"
                }
            }
        }
    }

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .background(
                colors.text.normal.copy(alpha = 0.03f),
                RoundedCornerShape(bottomStart = 6.dp, bottomEnd = 6.dp),
            )
            .padding(12.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        // Connection details
        Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(
                "Connection",
                fontSize = 11.sp,
                maxLines = 1,
                softWrap = false,
                fontWeight = androidx.compose.ui.text.font.FontWeight.Medium,
                color = colors.text.normal.copy(alpha = 0.7f),
            )
            Row(horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                Column {
                    Text("Type", fontSize = 9.sp, maxLines = 1, softWrap = false, color = colors.text.normal.copy(alpha = 0.5f))
                    Text(process.connectionType.label, fontSize = 11.sp, maxLines = 1, softWrap = false)
                }
                Column {
                    Text("Endpoint", fontSize = 9.sp, maxLines = 1, softWrap = false, color = colors.text.normal.copy(alpha = 0.5f))
                    Text(
                        when (process.connectionType) {
                            McpConnectionType.StreamableHttp -> "http://localhost:${process.port}"
                            McpConnectionType.UnixSocket -> process.socketPath ?: "Unknown"
                            McpConnectionType.Stdio -> "stdin/stdout"
                        },
                        fontSize = 11.sp,
                        maxLines = 1,
                        softWrap = false,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
                Column {
                    Text("PID", fontSize = 9.sp, maxLines = 1, softWrap = false, color = colors.text.normal.copy(alpha = 0.5f))
                    Text("${process.pid}", fontSize = 11.sp, maxLines = 1, softWrap = false)
                }
            }
        }

        // Resources
        Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
            val currentError = error
            val currentResources = resources
            val currentResourcesExpanded = resourcesExpanded

            Row(
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier.fillMaxWidth(),
            ) {
                Text(
                    "Resources",
                    fontSize = 11.sp,
                    maxLines = 1,
                    softWrap = false,
                    fontWeight = androidx.compose.ui.text.font.FontWeight.Medium,
                    color = colors.text.normal.copy(alpha = 0.7f),
                )
                if (currentResources != null && currentResources.size > 5) {
                    Text(
                        if (currentResourcesExpanded) "Collapse" else "Expand all",
                        fontSize = 9.sp,
                        color = Color(0xFF2196F3),
                        modifier = Modifier
                            .clickable { resourcesExpanded = !resourcesExpanded }
                            .pointerHoverIcon(PointerIcon.Hand)
                            .padding(horizontal = 4.dp),
                    )
                }
            }
            if (currentError != null) {
                Text(currentError, fontSize = 9.sp, color = Color(0xFFE53935))
            } else if (currentResources == null) {
                Text("Loading...", fontSize = 9.sp, color = colors.text.normal.copy(alpha = 0.5f))
            } else if (currentResources.isEmpty()) {
                Text("No resources", fontSize = 9.sp, color = colors.text.normal.copy(alpha = 0.5f))
            } else {
                val resourcesToShow = if (currentResourcesExpanded) currentResources else currentResources.take(5)
                Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    resourcesToShow.forEach { resource ->
                        Box(
                            modifier = Modifier
                                .background(Color(0xFF2196F3).copy(alpha = 0.1f), RoundedCornerShape(4.dp))
                                .padding(horizontal = 6.dp, vertical = 3.dp),
                        ) {
                            Text(resource.uri, fontSize = 9.sp, color = Color(0xFF2196F3))
                        }
                    }
                    if (!currentResourcesExpanded && currentResources.size > 5) {
                        Text(
                            "+${currentResources.size - 5} more",
                            fontSize = 9.sp,
                            color = Color(0xFF2196F3),
                            modifier = Modifier
                                .clickable { resourcesExpanded = true }
                                .pointerHoverIcon(PointerIcon.Hand)
                                .padding(horizontal = 4.dp),
                        )
                    }
                }
            }
        }

        // Tools
        Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
            val currentError = error
            val currentTools = tools
            val currentToolsExpanded = toolsExpanded

            Row(
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier.fillMaxWidth(),
            ) {
                Text(
                    "Tools",
                    fontSize = 11.sp,
                    maxLines = 1,
                    softWrap = false,
                    fontWeight = androidx.compose.ui.text.font.FontWeight.Medium,
                    color = colors.text.normal.copy(alpha = 0.7f),
                )
                if (currentTools != null && currentTools.size > 8) {
                    Text(
                        if (currentToolsExpanded) "Collapse" else "Expand all",
                        fontSize = 9.sp,
                        color = Color(0xFF9C27B0),
                        modifier = Modifier
                            .clickable { toolsExpanded = !toolsExpanded }
                            .pointerHoverIcon(PointerIcon.Hand)
                            .padding(horizontal = 4.dp),
                    )
                }
            }
            if (currentError != null) {
                Text(currentError, fontSize = 9.sp, color = Color(0xFFE53935))
            } else if (currentTools == null) {
                Text("Loading...", fontSize = 9.sp, color = colors.text.normal.copy(alpha = 0.5f))
            } else if (currentTools.isEmpty()) {
                Text("No tools", fontSize = 9.sp, color = colors.text.normal.copy(alpha = 0.5f))
            } else {
                val toolsToShow = if (currentToolsExpanded) currentTools else currentTools.take(8)
                Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    toolsToShow.chunked(4).forEach { row ->
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            row.forEach { tool ->
                                Box(
                                    modifier = Modifier
                                        .background(Color(0xFF9C27B0).copy(alpha = 0.1f), RoundedCornerShape(4.dp))
                                        .padding(horizontal = 6.dp, vertical = 3.dp),
                                ) {
                                    Text(tool.name, fontSize = 9.sp, color = Color(0xFF9C27B0))
                                }
                            }
                        }
                    }
                    if (!currentToolsExpanded && currentTools.size > 8) {
                        Text(
                            "+${currentTools.size - 8} more",
                            fontSize = 9.sp,
                            color = Color(0xFF9C27B0),
                            modifier = Modifier
                                .clickable { toolsExpanded = true }
                                .pointerHoverIcon(PointerIcon.Hand)
                                .padding(horizontal = 4.dp),
                        )
                    }
                }
            }
        }
    }
}

private fun formatUptime(ms: Long): String {
    return when {
        ms < 60_000 -> "${ms / 1000}s"
        ms < 3600_000 -> "${ms / 60_000}m"
        ms < 86400_000 -> "${ms / 3600_000}h ${(ms % 3600_000) / 60_000}m"
        else -> "${ms / 86400_000}d"
    }
}

@Composable
private fun DevicesSection(
    bootedDevices: List<dev.jasonpearson.automobile.ide.mcp.BootedDeviceInfo>,
    deviceImages: List<dev.jasonpearson.automobile.ide.mcp.DeviceImageInfo>,
    isLoading: Boolean,
    error: String?,
    bootingDeviceIds: Set<String>,
    bootErrors: Map<String, String>,
    onSelectDevice: (dev.jasonpearson.automobile.ide.mcp.BootedDeviceInfo) -> Unit,
    onBootDevice: (dev.jasonpearson.automobile.ide.mcp.DeviceImageInfo) -> Unit,
) {
    val colors = JewelTheme.globalColors

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .background(colors.text.normal.copy(alpha = 0.03f), RoundedCornerShape(6.dp))
            .padding(12.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        // Header
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                "📱 Devices",
                fontSize = 12.sp,
                maxLines = 1,
                softWrap = false,
                fontWeight = androidx.compose.ui.text.font.FontWeight.Medium,
                color = colors.text.normal,
            )
            if (isLoading) {
                Text(
                    "Loading...",
                    fontSize = 10.sp,
                    maxLines = 1,
                    softWrap = false,
                    color = Color(0xFF2196F3),
                )
            }
        }

        if (error != null) {
            Text(
                "⚠️ $error",
                fontSize = 10.sp,
                color = Color(0xFFE53935),
            )
        } else if (!isLoading) {
            // Running devices
            if (bootedDevices.isNotEmpty()) {
                Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Text(
                        "Running (${bootedDevices.size})",
                        fontSize = 10.sp,
                        maxLines = 1,
                        softWrap = false,
                        color = colors.text.normal.copy(alpha = 0.6f),
                    )
                    bootedDevices.forEach { device ->
                        BootedDeviceRow(
                            device = device,
                            onSelect = { onSelectDevice(device) },
                        )
                    }
                }
            }

            // Available images (only show first few to save space)
            if (deviceImages.isNotEmpty()) {
                Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Text(
                        "Available to Boot (${deviceImages.size})",
                        fontSize = 10.sp,
                        maxLines = 1,
                        softWrap = false,
                        color = colors.text.normal.copy(alpha = 0.6f),
                    )
                    deviceImages.take(5).forEach { image ->
                        val deviceKey = image.deviceId ?: image.name
                        DeviceImageRow(
                            image = image,
                            isBooting = deviceKey in bootingDeviceIds,
                            error = bootErrors[deviceKey],
                            onBoot = { onBootDevice(image) },
                        )
                    }
                    if (deviceImages.size > 5) {
                        Text(
                            "+${deviceImages.size - 5} more",
                            fontSize = 9.sp,
                            color = colors.text.normal.copy(alpha = 0.4f),
                        )
                    }
                }
            }

            if (bootedDevices.isEmpty() && deviceImages.isEmpty()) {
                Text(
                    "No devices found",
                    fontSize = 10.sp,
                    maxLines = 1,
                    softWrap = false,
                    color = colors.text.normal.copy(alpha = 0.5f),
                )
            }
        }
    }
}

@Composable
private fun BootedDeviceRow(
    device: dev.jasonpearson.automobile.ide.mcp.BootedDeviceInfo,
    onSelect: () -> Unit,
) {
    val colors = JewelTheme.globalColors
    val platformIcon = if (device.platform == "android") "🤖" else "🍎"
    val typeIcon = if (device.isVirtual) "📱" else "📲"

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(Color(0xFF4CAF50).copy(alpha = 0.1f), RoundedCornerShape(4.dp))
            .clickable(onClick = {
                LOG.debug("[AutoMobile IDE] BootedDeviceRow clicked for: ${device.name}")
                onSelect()
            })
            .pointerHoverIcon(PointerIcon.Hand)
            .padding(8.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text("$platformIcon$typeIcon", fontSize = 12.sp)
        Column(modifier = Modifier.weight(1f)) {
            Text(
                device.name,
                fontSize = 11.sp,
                fontWeight = androidx.compose.ui.text.font.FontWeight.Medium,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Text(
                device.deviceId,
                fontSize = 9.sp,
                color = colors.text.normal.copy(alpha = 0.5f),
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
        Box(
            modifier = Modifier
                .background(Color(0xFF4CAF50).copy(alpha = 0.2f), RoundedCornerShape(4.dp))
                .padding(horizontal = 6.dp, vertical = 2.dp),
        ) {
            Text(
                "Select",
                fontSize = 9.sp,
                maxLines = 1,
                softWrap = false,
                color = Color(0xFF4CAF50),
            )
        }
    }
}

@Composable
private fun DeviceImageRow(
    image: dev.jasonpearson.automobile.ide.mcp.DeviceImageInfo,
    isBooting: Boolean = false,
    error: String? = null,
    onBoot: () -> Unit,
) {
    val colors = JewelTheme.globalColors
    val platformIcon = if (image.platform == "android") "🤖" else "🍎"

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(colors.text.normal.copy(alpha = 0.05f), RoundedCornerShape(4.dp))
            .clickable(enabled = !isBooting, onClick = onBoot)
            .pointerHoverIcon(if (isBooting) PointerIcon.Default else PointerIcon.Hand)
            .padding(8.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(platformIcon, fontSize = 12.sp)
        Column(modifier = Modifier.weight(1f)) {
            Text(
                image.name,
                fontSize = 11.sp,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            if (error != null) {
                Text(
                    error,
                    fontSize = 9.sp,
                    color = Color(0xFFE53935),
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            } else {
                image.target?.let { target ->
                    Text(
                        target,
                        fontSize = 9.sp,
                        color = colors.text.normal.copy(alpha = 0.5f),
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
            }
        }
        Box(
            modifier = Modifier
                .background(
                    when {
                        error != null -> Color(0xFFE53935).copy(alpha = 0.15f)
                        isBooting -> Color(0xFF2196F3).copy(alpha = 0.25f)
                        else -> Color(0xFF2196F3).copy(alpha = 0.15f)
                    },
                    RoundedCornerShape(4.dp),
                )
                .padding(horizontal = 6.dp, vertical = 2.dp),
        ) {
            Text(
                when {
                    error != null -> "Error"
                    isBooting -> "..."
                    else -> "Boot"
                },
                fontSize = 9.sp,
                maxLines = 1,
                softWrap = false,
                color = when {
                    error != null -> Color(0xFFE53935)
                    else -> Color(0xFF2196F3)
                },
            )
        }
    }
}

@Composable
private fun AppSelectorDropdown(
    installedApps: List<InstalledApp>,
    selectedAppId: String?,
    isLoading: Boolean,
    expanded: Boolean,
    onExpandedChange: (Boolean) -> Unit,
    onAppSelected: (String?) -> Unit,
) {
    val colors = JewelTheme.globalColors
    val selectedApp = installedApps.find { it.packageName == selectedAppId }
    val displayText = when {
        isLoading -> "Loading..."
        selectedApp != null -> selectedApp.displayName ?: selectedApp.packageName
        selectedAppId != null -> selectedAppId // Show package name if app not in list
        installedApps.isEmpty() -> "No apps"
        else -> "Select app"
    }

    Row(
        horizontalArrangement = Arrangement.spacedBy(6.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            "App:",
            fontSize = 11.sp,
            maxLines = 1,
            softWrap = false,
            color = colors.text.normal.copy(alpha = 0.5f),
        )

        Box {
            Row(
                modifier = Modifier
                    .background(colors.text.normal.copy(alpha = 0.05f), RoundedCornerShape(4.dp))
                    .border(1.dp, colors.text.normal.copy(alpha = 0.2f), RoundedCornerShape(4.dp))
                    .clickable(enabled = !isLoading) { onExpandedChange(!expanded) }
                    .pointerHoverIcon(if (isLoading) PointerIcon.Default else PointerIcon.Hand)
                    .padding(horizontal = 10.dp, vertical = 4.dp),
                horizontalArrangement = Arrangement.spacedBy(6.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    displayText,
                    fontSize = 11.sp,
                    color = colors.text.normal,
                    maxLines = 1,
                )

                // Foreground indicator
                if (selectedApp?.isForeground == true) {
                    Box(
                        modifier = Modifier
                            .background(Color(0xFF4CAF50), RoundedCornerShape(2.dp))
                            .padding(horizontal = 4.dp, vertical = 1.dp)
                    ) {
                        Text(
                            "FG",
                            fontSize = 9.sp,
                            color = Color.White,
                        )
                    }
                }

                Text(
                    if (expanded) "\u25B2" else "\u25BC",
                    fontSize = 8.sp,
                    color = colors.text.normal.copy(alpha = 0.5f),
                )
            }

            // Dropdown popup overlay
            if (expanded) {
                Popup(
                    onDismissRequest = { onExpandedChange(false) },
                    offset = IntOffset(0, 32),
                    properties = PopupProperties(focusable = true),
                ) {
                    Column(
                        modifier = Modifier
                            .width(300.dp)
                            .heightIn(max = 200.dp) // Show ~5 items, scroll for more
                            .background(Color(0xFF2D2D2D), RoundedCornerShape(4.dp))
                            .border(1.dp, Color(0xFF404040), RoundedCornerShape(4.dp))
                            .verticalScroll(rememberScrollState())
                    ) {
                        // Installed apps - foreground first
                        val sortedApps = installedApps.sortedByDescending { it.isForeground }
                        sortedApps.forEach { app ->
                            AppDropdownItem(
                                displayName = app.displayName,
                                packageName = app.packageName,
                                isForeground = app.isForeground,
                                isSelected = app.packageName == selectedAppId,
                                onClick = {
                                    onAppSelected(app.packageName)
                                    onExpandedChange(false)
                                },
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun AppDropdownItem(
    displayName: String?,
    packageName: String?,
    isForeground: Boolean,
    isSelected: Boolean,
    onClick: () -> Unit,
) {
    val colors = JewelTheme.globalColors
    val bgColor = if (isSelected) Color(0xFF2166B3) else Color.Transparent

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(bgColor)
            .clickable(onClick = onClick)
            .pointerHoverIcon(PointerIcon.Hand)
            .padding(horizontal = 12.dp, vertical = 8.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(modifier = Modifier.weight(1f)) {
            Text(
                displayName ?: packageName ?: "Unknown",
                fontSize = 12.sp,
                color = colors.text.normal,
            )
            if (packageName != null && displayName != null && displayName != packageName) {
                Text(
                    packageName,
                    fontSize = 10.sp,
                    color = colors.text.normal.copy(alpha = 0.5f),
                )
            }
        }

        if (isForeground) {
            Box(
                modifier = Modifier
                    .background(Color(0xFF4CAF50), RoundedCornerShape(2.dp))
                    .padding(horizontal = 4.dp, vertical = 1.dp)
            ) {
                Text(
                    "FG",
                    fontSize = 9.sp,
                    color = Color.White,
                )
            }
        }

        if (isSelected) {
            Text(
                "\u2713",
                fontSize = 12.sp,
                color = Color(0xFF4CAF50),
            )
        }
    }
}
