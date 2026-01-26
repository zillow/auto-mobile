package dev.jasonpearson.automobile.ide.test

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.input.TextFieldState
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.toComposeImageBitmap
import androidx.compose.ui.input.pointer.PointerIcon
import androidx.compose.ui.input.pointer.pointerHoverIcon
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import org.jetbrains.skia.Image
import org.jetbrains.jewel.foundation.theme.JewelTheme
import org.jetbrains.jewel.ui.component.DefaultButton
import org.jetbrains.jewel.ui.component.Link
import org.jetbrains.jewel.ui.component.OutlinedButton
import org.jetbrains.jewel.ui.component.Text
import org.jetbrains.jewel.ui.component.TextField
import com.intellij.openapi.diagnostic.Logger
import dev.jasonpearson.automobile.ide.BootedDevice
import dev.jasonpearson.automobile.ide.DeviceType
import dev.jasonpearson.automobile.ide.daemon.AutoMobileClient
import dev.jasonpearson.automobile.ide.daemon.ObservationStreamClient
import dev.jasonpearson.automobile.ide.daemon.HierarchyStreamUpdate
import dev.jasonpearson.automobile.ide.daemon.ScreenshotStreamUpdate
import dev.jasonpearson.automobile.ide.daemon.NavigationGraphStreamUpdate
import dev.jasonpearson.automobile.ide.datasource.DataSourceMode
import dev.jasonpearson.automobile.ide.datasource.DataSourceFactory

private val LOG = Logger.getInstance("TestDashboard")

enum class TestScreen {
    Dashboard,
    ExploratoryTest,
    RecordingTest,
    ModuleSelection,
    TestRunDetail,
}

@Composable
fun TestDashboard(
    onOpenFile: (String) -> Unit = {},  // Callback to open file in editor
    onNavigateToGraph: (List<String>) -> Unit = {},  // Navigate to nav graph with highlighted screens
    dataSourceMode: DataSourceMode = DataSourceMode.Fake,
    clientProvider: (() -> AutoMobileClient)? = null,  // MCP client for real data
    observationStreamClient: ObservationStreamClient? = null,  // Real-time stream client for hierarchy/screenshot/navigation updates
) {
    var currentScreen by remember { mutableStateOf(TestScreen.Dashboard) }
    var selectedTestRun by remember { mutableStateOf<TestRun?>(null) }
    var recordedActions by remember { mutableStateOf<List<RecordedAction>>(emptyList()) }

    // Fetch test runs from data source
    var testRuns by remember { mutableStateOf<List<TestRun>>(emptyList()) }
    var isLoading by remember { mutableStateOf(true) }
    var error by remember { mutableStateOf<String?>(null) }

    // Real-time observation state
    var currentHierarchyUpdate by remember { mutableStateOf<HierarchyStreamUpdate?>(null) }
    var currentScreenshotUpdate by remember { mutableStateOf<ScreenshotStreamUpdate?>(null) }
    var currentNavigationUpdate by remember { mutableStateOf<NavigationGraphStreamUpdate?>(null) }

    // Collect real-time hierarchy updates from the stream
    LaunchedEffect(observationStreamClient) {
        if (observationStreamClient == null) return@LaunchedEffect

        LOG.info("Starting hierarchy updates collection in TestDashboard")
        observationStreamClient.hierarchyUpdates.collect { update ->
            LOG.info("Received hierarchy update in TestDashboard - deviceId=${update.deviceId}, hasData=${update.data != null}")
            currentHierarchyUpdate = update
        }
    }

    // Collect real-time screenshot updates from the stream
    LaunchedEffect(observationStreamClient) {
        if (observationStreamClient == null) return@LaunchedEffect

        LOG.info("Starting screenshot updates collection in TestDashboard")
        observationStreamClient.screenshotUpdates.collect { update ->
            LOG.info("Received screenshot update in TestDashboard - deviceId=${update.deviceId}, hasScreenshot=${update.screenshotBase64 != null}")
            currentScreenshotUpdate = update
        }
    }

    // Collect real-time navigation updates from the stream
    LaunchedEffect(observationStreamClient) {
        if (observationStreamClient == null) return@LaunchedEffect

        LOG.info("Starting navigation updates collection in TestDashboard")
        observationStreamClient.navigationUpdates.collect { update ->
            LOG.info("Received navigation update in TestDashboard - appId=${update.appId}, nodes=${update.nodes.size}")
            currentNavigationUpdate = update
        }
    }

    LaunchedEffect(dataSourceMode, clientProvider) {
        isLoading = true
        error = null
        kotlinx.coroutines.withContext(kotlinx.coroutines.Dispatchers.IO) {
            try {
                val dataSource = DataSourceFactory.createTestDataSource(dataSourceMode, clientProvider)
                when (val result = dataSource.getTestRuns()) {
                    is dev.jasonpearson.automobile.ide.datasource.Result.Success -> {
                        testRuns = result.data
                        isLoading = false
                    }
                    is dev.jasonpearson.automobile.ide.datasource.Result.Error -> {
                        error = result.message
                        isLoading = false
                    }
                    is dev.jasonpearson.automobile.ide.datasource.Result.Loading -> {
                        // Keep loading state
                    }
                }
            } catch (e: Exception) {
                error = e.message ?: "Unknown error"
                isLoading = false
            }
        }
    }

    when (currentScreen) {
        TestScreen.Dashboard -> TestDashboardHome(
            testRuns = testRuns,
            isLoading = isLoading,
            error = error,
            onExploratoryTest = { currentScreen = TestScreen.ExploratoryTest },
            onRecordTest = { currentScreen = TestScreen.RecordingTest },
            onTestRunClick = { run ->
                selectedTestRun = run
                currentScreen = TestScreen.TestRunDetail
            },
        )
        TestScreen.ExploratoryTest -> ExploratoryTestScreen(
            onBack = { currentScreen = TestScreen.Dashboard },
        )
        TestScreen.RecordingTest -> RecordingTestScreen(
            recordedActions = recordedActions,
            onActionRecorded = { recordedActions = recordedActions + it },
            onFinishRecording = { currentScreen = TestScreen.ModuleSelection },
            onBack = {
                recordedActions = emptyList()
                currentScreen = TestScreen.Dashboard
            },
            screenshotUpdate = currentScreenshotUpdate,
            hierarchyUpdate = currentHierarchyUpdate,
            navigationUpdate = currentNavigationUpdate,
        )
        TestScreen.ModuleSelection -> ModuleSelectionScreen(
            recordedActions = recordedActions,
            onModuleSelected = { module ->
                // TODO: Export YAML and open file
                recordedActions = emptyList()
                currentScreen = TestScreen.Dashboard
            },
            onBack = { currentScreen = TestScreen.RecordingTest },
        )
        TestScreen.TestRunDetail -> selectedTestRun?.let { run ->
            TestRunDetailScreen(
                testRun = run,
                allTestRuns = testRuns,
                onBack = { currentScreen = TestScreen.Dashboard },
                onViewInGraph = { onNavigateToGraph(run.screensVisited) },
                onNavigateToRun = { runId ->
                    // Navigate to another test run by ID
                    val targetRun = testRuns.find { it.id == runId }
                        ?: TestMockData.recentRuns.find { it.id == runId }
                    if (targetRun != null) {
                        selectedTestRun = targetRun
                    }
                },
            )
        } ?: run { currentScreen = TestScreen.Dashboard }
    }
}

private enum class TestFilter { Recent, Popular, Both }

@Composable
private fun TestDashboardHome(
    testRuns: List<TestRun>,
    isLoading: Boolean = false,
    error: String? = null,
    onExploratoryTest: () -> Unit,
    onRecordTest: () -> Unit,
    onTestRunClick: (TestRun) -> Unit,
) {
    val colors = JewelTheme.globalColors
    val scrollState = rememberScrollState()
    var selectedFilter by remember { mutableStateOf(TestFilter.Both) }

    // Sort based on filter - use sampleSize for popularity (fallback to TestMockData for fake data)
    val sortedRuns = remember(selectedFilter, testRuns) {
        when (selectedFilter) {
            TestFilter.Recent -> testRuns.sortedByDescending { it.startTime }
            TestFilter.Popular -> testRuns.sortedByDescending { run ->
                // Use sampleSize if available, otherwise look up from mock data
                if (run.sampleSize > 0) run.sampleSize
                else TestMockData.testCases.find { it.id == run.testId }?.runCount ?: 0
            }
            TestFilter.Both -> testRuns.sortedByDescending { run ->
                val popularity = if (run.sampleSize > 0) run.sampleSize
                    else TestMockData.testCases.find { it.id == run.testId }?.runCount ?: 0
                run.startTime + popularity * 100_000
            }
        }
    }

    Column(
        modifier = Modifier.fillMaxSize().verticalScroll(scrollState).padding(16.dp),
    ) {
        Text("Testing", fontSize = 18.sp)
        Text(
            "Create, run, and analyze UI tests",
            color = colors.text.normal.copy(alpha = 0.6f),
            fontSize = 12.sp,
            modifier = Modifier.padding(top = 4.dp),
        )

        Spacer(Modifier.height(20.dp))

        // Action buttons
        Row(
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            DefaultButton(onClick = onExploratoryTest) {
                Text("Exploratory Test")
            }
            OutlinedButton(onClick = onRecordTest) {
                Text("Record Test")
            }
        }

        Spacer(Modifier.height(24.dp))

        // Test Runs header with filter chips
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text("Test Runs", fontSize = 14.sp, color = colors.text.normal.copy(alpha = 0.8f))

            // Filter chips
            Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                FilterChip(
                    label = "Recent",
                    selected = selectedFilter == TestFilter.Recent,
                    onClick = { selectedFilter = TestFilter.Recent },
                )
                FilterChip(
                    label = "Popular",
                    selected = selectedFilter == TestFilter.Popular,
                    onClick = { selectedFilter = TestFilter.Popular },
                )
                FilterChip(
                    label = "Both",
                    selected = selectedFilter == TestFilter.Both,
                    onClick = { selectedFilter = TestFilter.Both },
                )
            }
        }

        Spacer(Modifier.height(8.dp))

        // Loading state
        if (isLoading) {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(colors.text.normal.copy(alpha = 0.04f), RoundedCornerShape(6.dp))
                    .padding(16.dp),
                contentAlignment = Alignment.Center,
            ) {
                Text("Loading test data...", fontSize = 12.sp, color = colors.text.normal.copy(alpha = 0.6f))
            }
        }
        // Error state
        else if (error != null) {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(Color(0xFFFF5722).copy(alpha = 0.1f), RoundedCornerShape(6.dp))
                    .padding(16.dp),
            ) {
                Text(error, fontSize = 12.sp, color = Color(0xFFFF5722))
            }
        }
        // Empty state
        else if (sortedRuns.isEmpty()) {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(colors.text.normal.copy(alpha = 0.04f), RoundedCornerShape(6.dp))
                    .padding(16.dp),
                contentAlignment = Alignment.Center,
            ) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Text("No test runs yet", fontSize = 13.sp, color = colors.text.normal.copy(alpha = 0.6f))
                    Text(
                        "Record or run exploratory tests to see them here",
                        fontSize = 11.sp,
                        color = colors.text.normal.copy(alpha = 0.4f),
                        modifier = Modifier.padding(top = 4.dp),
                    )
                }
            }
        }
        // Data state
        else {
            sortedRuns.forEach { run ->
                // Use sampleSize from run if available, otherwise fall back to mock data
                val testCase = TestMockData.testCases.find { it.id == run.testId }
                val runCount = if (run.sampleSize > 0) run.sampleSize else testCase?.runCount ?: 0
                TestRunRowEnhanced(
                    run = run,
                    runCount = runCount,
                    flakinessScore = testCase?.flakinessScore ?: 0f,
                    onClick = { onTestRunClick(run) },
                )
                Spacer(Modifier.height(6.dp))
            }
        }
    }
}

@Composable
private fun FilterChip(
    label: String,
    selected: Boolean,
    onClick: () -> Unit,
) {
    val colors = JewelTheme.globalColors
    val bgColor = if (selected) colors.text.normal.copy(alpha = 0.15f) else Color.Transparent
    val borderColor = if (selected) colors.text.normal.copy(alpha = 0.3f) else colors.text.normal.copy(alpha = 0.15f)
    val textColor = if (selected) colors.text.normal else colors.text.normal.copy(alpha = 0.6f)

    Box(
        modifier = Modifier
            .border(1.dp, borderColor, RoundedCornerShape(12.dp))
            .background(bgColor, RoundedCornerShape(12.dp))
            .clickable(onClick = onClick)
            .pointerHoverIcon(PointerIcon.Hand)
            .padding(horizontal = 10.dp, vertical = 4.dp),
    ) {
        Text(label, fontSize = 11.sp, color = textColor)
    }
}

@Composable
private fun TestRunRowEnhanced(
    run: TestRun,
    runCount: Int,
    flakinessScore: Float,
    onClick: () -> Unit,
) {
    val colors = JewelTheme.globalColors
    val statusColor = when (run.status) {
        TestStatus.Passed -> Color(0xFF4CAF50)
        TestStatus.Failed -> Color(0xFFFF5722)
        TestStatus.Running -> Color(0xFF2196F3)
        TestStatus.Skipped -> colors.text.normal.copy(alpha = 0.4f)
    }

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(colors.text.normal.copy(alpha = 0.04f), RoundedCornerShape(6.dp))
            .clickable(onClick = onClick)
            .pointerHoverIcon(PointerIcon.Hand)
            .padding(12.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Row(
            horizontalArrangement = Arrangement.spacedBy(10.dp),
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier.weight(1f),
        ) {
            Box(
                modifier = Modifier.size(8.dp).background(statusColor, CircleShape)
            )
            Column {
                Text(run.testName, fontSize = 13.sp)
                // Show steps if available, otherwise show sample count as "runs"
                val detailText = if (run.steps.isNotEmpty()) {
                    "${run.deviceName} • ${run.steps.size} steps • $runCount runs"
                } else {
                    "${run.deviceName} • $runCount runs"
                }
                Text(
                    detailText,
                    fontSize = 11.sp,
                    color = colors.text.normal.copy(alpha = 0.5f),
                )
            }
        }

        Column(horizontalAlignment = Alignment.End) {
            Text(
                "${run.durationMs / 1000.0}s",
                fontSize = 11.sp,
                color = colors.text.normal.copy(alpha = 0.5f),
            )
            if (flakinessScore > 0.1f) {
                Text(
                    "${(flakinessScore * 100).toInt()}% flaky",
                    fontSize = 10.sp,
                    color = Color(0xFFFFC107),
                )
            } else if (run.status == TestStatus.Failed) {
                Text(
                    "Failed",
                    fontSize = 10.sp,
                    color = Color(0xFFFF5722),
                )
            }
        }
    }
}


@Composable
private fun ExploratoryTestScreen(onBack: () -> Unit) {
    val colors = JewelTheme.globalColors
    var isLoadingAnalysis by remember { mutableStateOf(true) }

    // Simulate loading analysis
    androidx.compose.runtime.LaunchedEffect(Unit) {
        kotlinx.coroutines.delay(1500)
        isLoadingAnalysis = false
    }

    Column(
        modifier = Modifier.fillMaxSize().padding(16.dp),
    ) {
        Link("← Back", onClick = onBack)
        Spacer(Modifier.height(12.dp))

        Text("Exploratory Test", fontSize = 18.sp)
        Text(
            "Let AI explore untested areas of your app",
            color = colors.text.normal.copy(alpha = 0.6f),
            fontSize = 12.sp,
            modifier = Modifier.padding(top = 4.dp),
        )

        Spacer(Modifier.height(24.dp))

        // Prompt input
        Text("Prompt", fontSize = 13.sp, color = colors.text.normal.copy(alpha = 0.8f))
        Spacer(Modifier.height(8.dp))

        val placeholderText = "Describe what you want to explore..."
        val defaultPrompt = "Explore the app and find untested functionality"
        val promptState = remember { TextFieldState("") }
        val isEmpty = promptState.text.isEmpty()

        // Prompt input row with multiline text area, Clear, and Start buttons
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalAlignment = Alignment.Bottom,
        ) {
            Box(
                modifier = Modifier
                    .weight(1f)
                    .height(80.dp)
                    .background(colors.text.normal.copy(alpha = 0.05f), RoundedCornerShape(6.dp))
                    .padding(8.dp),
            ) {
                // Placeholder text when empty
                if (isEmpty) {
                    Text(
                        placeholderText,
                        fontSize = 12.sp,
                        color = colors.text.normal.copy(alpha = 0.4f),
                    )
                }
                androidx.compose.foundation.text.BasicTextField(
                    state = promptState,
                    modifier = Modifier.fillMaxSize(),
                    textStyle = androidx.compose.ui.text.TextStyle(
                        fontSize = 12.sp,
                        color = colors.text.normal,
                    ),
                    lineLimits = androidx.compose.foundation.text.input.TextFieldLineLimits.MultiLine(
                        minHeightInLines = 2,
                        maxHeightInLines = 4,
                    ),
                )
            }

            // Clear button - only enabled when there's text
            if (!isEmpty) {
                OutlinedButton(
                    onClick = {
                        promptState.edit { replace(0, length, "") }
                    },
                ) {
                    Text("Clear")
                }
            }

            DefaultButton(
                onClick = {
                    // Use default prompt if empty, otherwise use entered text
                    val finalPrompt = if (isEmpty) defaultPrompt else promptState.text.toString()
                    // TODO: Start exploration with finalPrompt
                },
            ) {
                Text("Start")
            }
        }

        Spacer(Modifier.height(16.dp))

        // Suggested prompts - only show after analysis loads
        if (!isLoadingAnalysis) {
            Text("Suggested", fontSize = 12.sp, color = colors.text.normal.copy(alpha = 0.5f))
            Spacer(Modifier.height(6.dp))

            // Heuristically generated prompts based on coverage analysis
            val suggestedPrompts = listOf(
                "Test the VideoCall screen - try starting, ending, and muting calls",
                "Explore Privacy settings and verify all toggles work correctly",
                "Test the VoiceCall → MediaGallery transition with different media types",
            )

            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                suggestedPrompts.forEach { suggestion ->
                    SuggestedPromptChip(
                        text = suggestion,
                        onClick = {
                            promptState.edit {
                                replace(0, length, suggestion)
                            }
                        },
                    )
                }
            }
        }

        Spacer(Modifier.height(20.dp))

        // Coverage analysis with loading state
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .background(colors.text.normal.copy(alpha = 0.05f), RoundedCornerShape(8.dp))
                .padding(16.dp),
        ) {
            if (isLoadingAnalysis) {
                Row(
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    // Simple animated loading dots using LaunchedEffect
                    var dotCount by remember { mutableStateOf(0) }
                    androidx.compose.runtime.LaunchedEffect(Unit) {
                        while (true) {
                            kotlinx.coroutines.delay(300)
                            dotCount = (dotCount + 1) % 4
                        }
                    }
                    val dots = ".".repeat(dotCount)
                    Text(
                        "Analyzing coverage$dots",
                        fontSize = 12.sp,
                        color = colors.text.normal.copy(alpha = 0.6f),
                    )
                }
            } else {
                Column {
                    Text("Coverage Analysis", fontSize = 13.sp)
                    Spacer(Modifier.height(8.dp))
                    Text(
                        "Based on your navigation graph, these areas have low test coverage:",
                        fontSize = 12.sp,
                        color = colors.text.normal.copy(alpha = 0.7f),
                    )
                    Spacer(Modifier.height(8.dp))
                    listOf(
                        "VideoCall screen (55% coverage)",
                        "Privacy settings flow (58% coverage)",
                        "VoiceCall → MediaGallery transition (untested)",
                        "GroupChat error handling (no tests)",
                    ).forEach { item ->
                        Text(
                            "• $item",
                            fontSize = 11.sp,
                            color = colors.text.normal.copy(alpha = 0.6f),
                            modifier = Modifier.padding(vertical = 2.dp),
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun SuggestedPromptChip(
    text: String,
    onClick: () -> Unit,
) {
    val colors = JewelTheme.globalColors

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(colors.text.normal.copy(alpha = 0.03f), RoundedCornerShape(6.dp))
            .border(1.dp, colors.text.normal.copy(alpha = 0.08f), RoundedCornerShape(6.dp))
            .clickable(onClick = onClick)
            .pointerHoverIcon(PointerIcon.Hand)
            .padding(horizontal = 10.dp, vertical = 8.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            "+",
            fontSize = 14.sp,
            color = colors.text.normal.copy(alpha = 0.4f),
        )
        Text(
            text,
            fontSize = 11.sp,
            color = colors.text.normal.copy(alpha = 0.7f),
        )
    }
}

@Composable
private fun RecordingTestScreen(
    recordedActions: List<RecordedAction>,
    onActionRecorded: (RecordedAction) -> Unit,
    onFinishRecording: () -> Unit,
    onBack: () -> Unit,
    screenshotUpdate: ScreenshotStreamUpdate? = null,
    hierarchyUpdate: HierarchyStreamUpdate? = null,
    navigationUpdate: NavigationGraphStreamUpdate? = null,
) {
    val colors = JewelTheme.globalColors

    // Decode screenshot if available
    val screenshotBytes = remember(screenshotUpdate?.screenshotBase64) {
        screenshotUpdate?.screenshotBase64?.let { base64 ->
            try {
                java.util.Base64.getDecoder().decode(base64)
            } catch (e: Exception) {
                null
            }
        }
    }

    // Current screen info from hierarchy or navigation
    val currentPackageName = hierarchyUpdate?.packageName
    val currentScreenName = navigationUpdate?.currentScreen

    Column(modifier = Modifier.fillMaxSize()) {
        // Header with recording indicator
        Row(
            modifier = Modifier.fillMaxWidth().padding(16.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Row(
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Link("← Cancel", onClick = onBack)
            }

            Row(
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                // Recording indicator (pulsing red dot)
                Box(
                    modifier = Modifier
                        .size(10.dp)
                        .background(Color(0xFFFF4444), CircleShape)
                )
                Text("Recording", fontSize = 12.sp, color = Color(0xFFFF4444))
            }

            DefaultButton(onClick = onFinishRecording) {
                Text("Finish Recording")
            }
        }

        // Instructions
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp)
                .background(colors.text.normal.copy(alpha = 0.05f), RoundedCornerShape(8.dp))
                .padding(12.dp),
        ) {
            Text(
                "Use your AI agent (Claude Code, Codex, etc.) to interact with the app. " +
                    "Tool calls will be recorded below.",
                fontSize = 12.sp,
                color = colors.text.normal.copy(alpha = 0.7f),
            )
        }

        Spacer(Modifier.height(12.dp))

        // Main content - side by side device preview and action log
        Row(
            modifier = Modifier.weight(1f).fillMaxWidth().padding(horizontal = 16.dp),
            horizontalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            // Left side: Device preview with live screenshot
            Column(
                modifier = Modifier.width(180.dp).fillMaxHeight(),
            ) {
                // Current screen info
                if (currentPackageName != null || currentScreenName != null) {
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .background(colors.text.normal.copy(alpha = 0.05f), RoundedCornerShape(6.dp))
                            .padding(8.dp),
                    ) {
                        currentPackageName?.let { pkg ->
                            Text(
                                pkg.substringAfterLast('.'),
                                fontSize = 11.sp,
                                color = colors.text.normal.copy(alpha = 0.8f),
                            )
                        }
                        currentScreenName?.let { screen ->
                            Text(
                                screen,
                                fontSize = 10.sp,
                                color = colors.text.normal.copy(alpha = 0.5f),
                            )
                        }
                    }
                    Spacer(Modifier.height(8.dp))
                }

                // Live device screenshot
                Box(
                    modifier = Modifier
                        .weight(1f)
                        .fillMaxWidth()
                        .background(Color(0xFF1E1E1E), RoundedCornerShape(8.dp))
                        .border(1.dp, colors.text.normal.copy(alpha = 0.1f), RoundedCornerShape(8.dp)),
                    contentAlignment = Alignment.Center,
                ) {
                    if (screenshotBytes != null) {
                        // Display the live screenshot
                        val imageBitmap = remember(screenshotBytes) {
                            try {
                                val skiaImage = Image.makeFromEncoded(screenshotBytes)
                                skiaImage.toComposeImageBitmap()
                            } catch (e: Exception) {
                                null
                            }
                        }
                        imageBitmap?.let { bitmap ->
                            Image(
                                bitmap = bitmap,
                                contentDescription = "Live device screen",
                                modifier = Modifier.fillMaxSize().padding(4.dp),
                                contentScale = ContentScale.Fit,
                            )
                        } ?: run {
                            // Fallback if image decode fails
                            Column(
                                horizontalAlignment = Alignment.CenterHorizontally,
                                verticalArrangement = Arrangement.Center,
                            ) {
                                Text("Device Preview", fontSize = 10.sp, color = colors.text.normal.copy(alpha = 0.4f))
                            }
                        }
                    } else {
                        // No screenshot available yet
                        Column(
                            horizontalAlignment = Alignment.CenterHorizontally,
                            verticalArrangement = Arrangement.Center,
                        ) {
                            Text("📱", fontSize = 24.sp)
                            Spacer(Modifier.height(4.dp))
                            Text(
                                "Awaiting device...",
                                fontSize = 10.sp,
                                color = colors.text.normal.copy(alpha = 0.4f),
                            )
                            if (screenshotUpdate == null) {
                                Spacer(Modifier.height(4.dp))
                                Text(
                                    "Connect a device to see live updates",
                                    fontSize = 9.sp,
                                    color = colors.text.normal.copy(alpha = 0.3f),
                                )
                            }
                        }
                    }
                }

                // Navigation info if available
                navigationUpdate?.let { navUpdate ->
                    if (navUpdate.nodes.isNotEmpty()) {
                        Spacer(Modifier.height(8.dp))
                        Text(
                            "${navUpdate.nodes.size} screens discovered",
                            fontSize = 10.sp,
                            color = Color(0xFF4CAF50),
                        )
                    }
                }
            }

            // Right side: Terminal-style action log
            Box(
                modifier = Modifier
                    .weight(1f)
                    .fillMaxHeight()
                    .background(Color(0xFF1E1E1E), RoundedCornerShape(8.dp))
                    .padding(12.dp),
            ) {
                if (recordedActions.isEmpty()) {
                    Column {
                        Text(
                            "$ awaiting tool calls...",
                            fontSize = 12.sp,
                            fontFamily = FontFamily.Monospace,
                            color = Color(0xFF888888),
                        )
                        Spacer(Modifier.height(16.dp))
                        Text(
                            "# Example actions that will be recorded:",
                            fontSize = 11.sp,
                            fontFamily = FontFamily.Monospace,
                            color = Color(0xFF666666),
                        )
                        Text(
                            "# - tapOn(element: \"Login button\")",
                            fontSize = 11.sp,
                            fontFamily = FontFamily.Monospace,
                            color = Color(0xFF666666),
                        )
                        Text(
                            "# - inputText(text: \"user@example.com\")",
                            fontSize = 11.sp,
                            fontFamily = FontFamily.Monospace,
                            color = Color(0xFF666666),
                        )
                        Text(
                            "# - swipeOn(direction: \"up\")",
                            fontSize = 11.sp,
                            fontFamily = FontFamily.Monospace,
                            color = Color(0xFF666666),
                        )
                    }
                } else {
                    Column(
                        modifier = Modifier.verticalScroll(rememberScrollState()),
                    ) {
                        recordedActions.forEachIndexed { index, action ->
                            Text(
                                "[$index] ${action.toolName}(${action.parameters.entries.joinToString { "${it.key}: ${it.value}" }})",
                                fontSize = 12.sp,
                                fontFamily = FontFamily.Monospace,
                                color = Color(0xFF4EC9B0),
                            )
                            action.result?.let {
                                Text(
                                    "    → $it",
                                    fontSize = 11.sp,
                                    fontFamily = FontFamily.Monospace,
                                    color = Color(0xFF888888),
                                )
                            }
                            Spacer(Modifier.height(4.dp))
                        }
                    }
                }
            }
        }

        Spacer(Modifier.height(12.dp))

        // Launch buttons
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .background(colors.text.normal.copy(alpha = 0.03f))
                .padding(12.dp),
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            OutlinedButton(onClick = { /* TODO: Launch Claude Code */ }) {
                Text("Launch Claude Code")
            }
            OutlinedButton(onClick = { /* TODO: Launch Codex */ }) {
                Text("Launch Codex")
            }
        }
    }
}

@Composable
private fun ModuleSelectionScreen(
    recordedActions: List<RecordedAction>,
    onModuleSelected: (GradleModule) -> Unit,
    onBack: () -> Unit,
) {
    val colors = JewelTheme.globalColors
    val searchState = remember { TextFieldState("") }

    val filteredModules = remember(searchState.text.toString()) {
        val query = searchState.text.toString()
        if (query.isBlank()) {
            TestMockData.modules
        } else {
            TestMockData.modules.filter {
                it.name.contains(query, ignoreCase = true) ||
                    it.path.contains(query, ignoreCase = true)
            }
        }
    }

    Column(
        modifier = Modifier.fillMaxSize().padding(16.dp),
    ) {
        Link("← Back to Recording", onClick = onBack)
        Spacer(Modifier.height(12.dp))

        Text("Select Module", fontSize = 18.sp)
        Text(
            "Choose which module to save the test plan in",
            color = colors.text.normal.copy(alpha = 0.6f),
            fontSize = 12.sp,
            modifier = Modifier.padding(top = 4.dp),
        )

        Spacer(Modifier.height(8.dp))

        Text(
            "${recordedActions.size} actions recorded",
            fontSize = 12.sp,
            color = Color(0xFF4CAF50),
        )

        Spacer(Modifier.height(16.dp))

        // Search field
        TextField(
            state = searchState,
            modifier = Modifier.fillMaxWidth(),
        )

        Spacer(Modifier.height(12.dp))

        // Module list
        Column(
            modifier = Modifier.verticalScroll(rememberScrollState()),
            verticalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            filteredModules.forEach { module ->
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(colors.text.normal.copy(alpha = 0.04f), RoundedCornerShape(6.dp))
                        .clickable { onModuleSelected(module) }
                        .pointerHoverIcon(PointerIcon.Hand)
                        .padding(12.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Column {
                        Text(module.name, fontSize = 13.sp)
                        Text(
                            module.path,
                            fontSize = 11.sp,
                            color = colors.text.normal.copy(alpha = 0.5f),
                        )
                    }
                    Text(
                        "→",
                        fontSize = 14.sp,
                        color = colors.text.normal.copy(alpha = 0.3f),
                    )
                }
            }
        }
    }
}

// Data class for historical run records
private data class HistoricalRun(
    val runId: String?,  // null if no record exists (just pass/fail indicator)
    val passed: Boolean,
)

@Composable
private fun TestRunDetailScreen(
    testRun: TestRun,
    allTestRuns: List<TestRun> = emptyList(),
    onBack: () -> Unit,
    onViewInGraph: () -> Unit,
    onNavigateToRun: (String) -> Unit = {},  // Navigate to another test run by ID
) {
    val colors = JewelTheme.globalColors
    val scrollState = rememberScrollState()

    // Video playback state
    var isPlaying by remember { mutableStateOf(false) }
    var playbackTimeMs by remember { mutableStateOf(0L) }

    // Calculate cumulative timestamps for each step
    val stepTimestamps = remember(testRun.steps) {
        var cumulative = 0L
        testRun.steps.map { step ->
            val start = cumulative
            cumulative += step.durationMs
            start to cumulative
        }
    }

    // Determine current step based on playback time
    val currentStepIndex = remember(playbackTimeMs, stepTimestamps) {
        stepTimestamps.indexOfLast { (start, _) -> playbackTimeMs >= start }.coerceAtLeast(0)
    }

    // Animate playback when playing
    androidx.compose.runtime.LaunchedEffect(isPlaying) {
        if (isPlaying) {
            val startTime = System.currentTimeMillis() - playbackTimeMs
            while (isPlaying && playbackTimeMs < testRun.durationMs) {
                playbackTimeMs = System.currentTimeMillis() - startTime
                kotlinx.coroutines.delay(50) // Update every 50ms
            }
            if (playbackTimeMs >= testRun.durationMs) {
                isPlaying = false
                playbackTimeMs = testRun.durationMs.toLong()
            }
        }
    }

    // Historical runs for the same test, sorted by start time
    val historicalRuns = remember(testRun.testId, allTestRuns) {
        allTestRuns
            .filter { it.testId == testRun.testId }
            .sortedBy { it.startTime }
            .takeLast(10)  // Show last 10 runs
            .map { run ->
                HistoricalRun(
                    runId = run.id,
                    passed = run.status == TestStatus.Passed,
                )
            }
            .ifEmpty {
                // Fallback: just show the current run if no history
                listOf(HistoricalRun(testRun.id, testRun.status == TestStatus.Passed))
            }
    }
    val passRate = if (historicalRuns.isNotEmpty()) {
        (historicalRuns.count { it.passed } * 100) / historicalRuns.size
    } else 0

    BoxWithConstraints(modifier = Modifier.fillMaxSize()) {
        val isWideLayout = maxWidth >= 400.dp

        Column(
            modifier = Modifier.fillMaxSize().verticalScroll(scrollState).padding(16.dp),
        ) {
            // Header row with back, title, playback controls, and view in graph
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Link("← Back", onClick = onBack)

                // Playback controls in header (if video exists)
                if (testRun.videoPath != null) {
                    Row(
                        horizontalArrangement = Arrangement.spacedBy(4.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        // Responsive button labels
                        val showFullLabels = isWideLayout
                        OutlinedButton(
                            onClick = {
                                if (playbackTimeMs >= testRun.durationMs) {
                                    playbackTimeMs = 0
                                }
                                isPlaying = !isPlaying
                            },
                        ) {
                            Text(
                                if (showFullLabels) {
                                    if (isPlaying) "|| Pause" else "> Play"
                                } else {
                                    if (isPlaying) "||" else ">"
                                }
                            )
                        }
                        OutlinedButton(
                            onClick = {
                                isPlaying = false
                                playbackTimeMs = 0
                            },
                        ) {
                            Text(if (showFullLabels) "[] Reset" else "[]")
                        }
                    }
                }

                OutlinedButton(onClick = onViewInGraph) {
                    Text(if (isWideLayout) "View in Graph" else "📊")
                }
            }

            Spacer(Modifier.height(12.dp))

            // Title with status
            Row(
                horizontalArrangement = Arrangement.spacedBy(10.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                val statusColor = when (testRun.status) {
                    TestStatus.Passed -> Color(0xFF4CAF50)
                    TestStatus.Failed -> Color(0xFFFF5722)
                    TestStatus.Running -> Color(0xFF2196F3)
                    TestStatus.Skipped -> colors.text.normal.copy(alpha = 0.4f)
                }
                Box(modifier = Modifier.size(12.dp).background(statusColor, CircleShape))
                Text(testRun.testName, fontSize = 18.sp)
            }

            Text(
                "${testRun.deviceName} • ${testRun.durationMs / 1000.0}s",
                color = colors.text.normal.copy(alpha = 0.6f),
                fontSize = 12.sp,
                modifier = Modifier.padding(top = 4.dp),
            )

            // Error message if failed
            if (testRun.errorMessage != null) {
                Spacer(Modifier.height(12.dp))
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(Color(0xFFFF5722).copy(alpha = 0.1f), RoundedCornerShape(6.dp))
                        .padding(12.dp),
                ) {
                    Text(
                        testRun.errorMessage,
                        fontSize = 12.sp,
                        color = Color(0xFFFF5722),
                        fontFamily = FontFamily.Monospace,
                    )
                }
            }

            Spacer(Modifier.height(16.dp))

            // Run History - compact chart with pass rate overlay
            RunHistoryChart(
                historicalRuns = historicalRuns,
                passRate = passRate,
                currentRunId = testRun.id,
                onRunClick = { runId -> runId?.let { onNavigateToRun(it) } },
                isCompact = !isWideLayout,
            )

            Spacer(Modifier.height(16.dp))

            // Test Steps and Video - side by side if wide, stacked if narrow
            if (isWideLayout && testRun.videoPath != null) {
                // Wide layout: steps and video side by side
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(16.dp),
                ) {
                    // Steps column
                    Column(modifier = Modifier.weight(1f)) {
                        Text("Test Steps", fontSize = 14.sp, color = colors.text.normal.copy(alpha = 0.8f))
                        Spacer(Modifier.height(8.dp))

                        testRun.steps.forEachIndexed { index, step ->
                            TestStepRowWithScreenshot(
                                step = step,
                                isCurrentStep = index == currentStepIndex && (isPlaying || playbackTimeMs > 0),
                                onStepClick = {
                                    playbackTimeMs = stepTimestamps[index].first
                                    isPlaying = false
                                },
                                isCompact = true,
                            )
                            Spacer(Modifier.height(6.dp))
                        }
                    }

                    // Video column
                    Column(modifier = Modifier.width(180.dp)) {
                        Text("Recording", fontSize = 14.sp, color = colors.text.normal.copy(alpha = 0.8f))
                        Spacer(Modifier.height(8.dp))

                        VideoPlayerWithTimeline(
                            testRun = testRun,
                            currentStepIndex = currentStepIndex,
                            playbackTimeMs = playbackTimeMs,
                            stepTimestamps = stepTimestamps,
                        )
                    }
                }
            } else {
                // Narrow layout: steps first, then video
                Text("Test Steps", fontSize = 14.sp, color = colors.text.normal.copy(alpha = 0.8f))
                Spacer(Modifier.height(8.dp))

                testRun.steps.forEachIndexed { index, step ->
                    TestStepRowWithScreenshot(
                        step = step,
                        isCurrentStep = index == currentStepIndex && (isPlaying || playbackTimeMs > 0),
                        onStepClick = {
                            playbackTimeMs = stepTimestamps[index].first
                            isPlaying = false
                        },
                        isCompact = !isWideLayout,
                    )
                    Spacer(Modifier.height(8.dp))
                }

                // Video after steps (if exists)
                if (testRun.videoPath != null) {
                    Spacer(Modifier.height(16.dp))
                    Text("Recording", fontSize = 14.sp, color = colors.text.normal.copy(alpha = 0.8f))
                    Spacer(Modifier.height(8.dp))

                    VideoPlayerWithTimeline(
                        testRun = testRun,
                        currentStepIndex = currentStepIndex,
                        playbackTimeMs = playbackTimeMs,
                        stepTimestamps = stepTimestamps,
                    )
                }
            }

            Spacer(Modifier.height(16.dp))

            // Screens visited
            Text("Screens Visited", fontSize = 14.sp, color = colors.text.normal.copy(alpha = 0.8f))
            Spacer(Modifier.height(8.dp))
            Row(
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                modifier = Modifier.fillMaxWidth(),
            ) {
                testRun.screensVisited.forEachIndexed { index, screen ->
                    val isCurrentScreen = testRun.steps.getOrNull(currentStepIndex)?.screenName == screen
                    Box(
                        modifier = Modifier
                            .background(
                                if (isCurrentScreen) Color(0xFF2196F3).copy(alpha = 0.2f)
                                else colors.text.normal.copy(alpha = 0.08f),
                                RoundedCornerShape(4.dp)
                            )
                            .then(
                                if (isCurrentScreen) Modifier.border(1.dp, Color(0xFF2196F3), RoundedCornerShape(4.dp))
                                else Modifier
                            )
                            .padding(horizontal = 8.dp, vertical = 4.dp),
                    ) {
                        Text(screen, fontSize = 11.sp)
                    }
                }
            }

            Spacer(Modifier.height(16.dp))

            // Related Tests
            RelatedTestsSection(
                testRun = testRun,
                isCompact = !isWideLayout,
            )

            Spacer(Modifier.height(16.dp))

            // Snapshot & Export section
            val hasSnapshot = testRun.snapshotPath != null
            val sectionTitle = if (hasSnapshot) "Snapshot & Export" else "Export"
            Text(sectionTitle, fontSize = 14.sp, color = colors.text.normal.copy(alpha = 0.8f))
            Spacer(Modifier.height(8.dp))

            var showDevicePicker by remember { mutableStateOf(false) }

            if (hasSnapshot) {
                Row(
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    ActionCard(
                        icon = "📱",
                        title = if (isWideLayout) "Restore to Device" else "Restore",
                        description = if (isWideLayout) {
                            "Restore app snapshot to ${if (testRun.platform == TestPlatform.Android) "emulator" else "simulator"}"
                        } else {
                            "Restore snapshot"
                        },
                        onClick = { showDevicePicker = true },
                        modifier = Modifier.weight(1f),
                    )

                    ActionCard(
                        icon = "📤",
                        title = if (isWideLayout) "Send Snapshot" else "Send",
                        description = if (isWideLayout) "Open snapshot file in Finder" else "Open in Finder",
                        onClick = { /* TODO: Open Finder with snapshot file selected */ },
                        modifier = Modifier.weight(1f),
                    )
                }

                Spacer(Modifier.height(8.dp))
            }

            ActionCard(
                icon = "📦",
                title = if (isWideLayout) "Send Debug Bundle" else "Debug Bundle",
                description = if (isWideLayout) {
                    "Export test results, video, screenshots${if (hasSnapshot) " & snapshot" else ""} as portable bundle"
                } else {
                    "Export all test data"
                },
                onClick = { /* TODO: Create and export debug bundle */ },
                modifier = Modifier.fillMaxWidth(),
            )

            if (showDevicePicker) {
                DevicePickerOverlay(
                    platform = testRun.platform,
                    onDeviceSelected = { device ->
                        showDevicePicker = false
                    },
                    onDismiss = { showDevicePicker = false },
                )
            }
        }
    }
}

@Composable
private fun RunHistoryChart(
    historicalRuns: List<HistoricalRun>,
    passRate: Int,
    currentRunId: String,
    onRunClick: (String?) -> Unit,
    isCompact: Boolean,
) {
    val colors = JewelTheme.globalColors

    Column {
        Text("Run History", fontSize = 12.sp, color = colors.text.normal.copy(alpha = 0.6f))
        Spacer(Modifier.height(6.dp))

        // Chart with pass rate overlay
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .background(colors.text.normal.copy(alpha = 0.03f), RoundedCornerShape(6.dp))
                .padding(8.dp),
        ) {
            Row(
                horizontalArrangement = Arrangement.spacedBy(3.dp),
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier.fillMaxWidth(),
            ) {
                historicalRuns.forEach { run ->
                    val isCurrentRun = run.runId == currentRunId
                    val isClickable = run.runId != null && !isCurrentRun
                    val barColor = when {
                        isCurrentRun -> Color(0xFF2196F3)  // Blue for current
                        run.passed -> Color(0xFF4CAF50)
                        else -> Color(0xFFFF5722)
                    }

                    Box(
                        modifier = Modifier
                            .weight(1f)
                            .height(20.dp)
                            .background(barColor, RoundedCornerShape(2.dp))
                            .then(
                                if (isCurrentRun) Modifier.border(1.dp, Color.White.copy(alpha = 0.5f), RoundedCornerShape(2.dp))
                                else Modifier
                            )
                            .then(
                                if (isClickable) Modifier
                                    .clickable { onRunClick(run.runId) }
                                    .pointerHoverIcon(PointerIcon.Hand)
                                else Modifier
                            ),
                    )
                }

                // Pass rate inside the chart area
                Spacer(Modifier.width(8.dp))
                Text(
                    "$passRate%",
                    fontSize = 12.sp,
                    color = colors.text.normal.copy(alpha = 0.7f),
                )
            }
        }
    }
}

@Composable
private fun VideoPlayerWithTimeline(
    testRun: TestRun,
    currentStepIndex: Int,
    playbackTimeMs: Long,
    stepTimestamps: List<Pair<Long, Long>>,
) {
    val colors = JewelTheme.globalColors

    Column {
        // Video placeholder
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(280.dp)
                .background(Color(0xFF1E1E1E), RoundedCornerShape(8.dp)),
            contentAlignment = Alignment.Center,
        ) {
            Column(
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.Center,
            ) {
                val currentStep = testRun.steps.getOrNull(currentStepIndex)
                Text(
                    currentStep?.screenName ?: "Video",
                    fontSize = 14.sp,
                    color = Color.White.copy(alpha = 0.8f),
                )
                currentStep?.screenshotPath?.let {
                    Spacer(Modifier.height(4.dp))
                    Text(
                        "Frame ${currentStepIndex + 1}/${testRun.steps.size}",
                        fontSize = 10.sp,
                        color = Color.White.copy(alpha = 0.5f),
                    )
                }
            }
        }

        Spacer(Modifier.height(8.dp))

        // Progress bar
        val progress = (playbackTimeMs.toFloat() / testRun.durationMs).coerceIn(0f, 1f)
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(6.dp)
                .background(colors.text.normal.copy(alpha = 0.1f), RoundedCornerShape(3.dp)),
        ) {
            Box(
                modifier = Modifier
                    .fillMaxWidth(progress)
                    .height(6.dp)
                    .background(Color(0xFF2196F3), RoundedCornerShape(3.dp)),
            )
            // Step markers
            stepTimestamps.forEachIndexed { index, (start, _) ->
                val markerPos = start.toFloat() / testRun.durationMs
                Box(
                    modifier = Modifier
                        .fillMaxWidth(markerPos)
                        .height(6.dp),
                ) {
                    Box(
                        modifier = Modifier
                            .align(Alignment.CenterEnd)
                            .size(width = 2.dp, height = 6.dp)
                            .background(
                                if (index == currentStepIndex) Color(0xFF4CAF50)
                                else colors.text.normal.copy(alpha = 0.3f)
                            ),
                    )
                }
            }
        }

        Spacer(Modifier.height(4.dp))

        // Time display
        Text(
            "${formatTime(playbackTimeMs)} / ${formatTime(testRun.durationMs.toLong())}",
            fontSize = 10.sp,
            color = colors.text.normal.copy(alpha = 0.5f),
        )
    }
}

@Composable
private fun RelatedTestsSection(
    testRun: TestRun,
    isCompact: Boolean,
) {
    val colors = JewelTheme.globalColors

    val relatedTests = remember(testRun) {
        TestMockData.testCases
            .filter { test ->
                test.id != testRun.testId &&
                test.screensVisited.any { it in testRun.screensVisited }
            }
            .take(3)
            .map { test ->
                val sharedScreens = test.screensVisited.filter { it in testRun.screensVisited }
                Triple(test.name, sharedScreens, test.flakinessScore)
            }
    }

    Text("Related Tests", fontSize = 12.sp, color = colors.text.normal.copy(alpha = 0.6f))
    Spacer(Modifier.height(6.dp))

    if (relatedTests.isEmpty()) {
        Text(
            "No related tests found",
            fontSize = 11.sp,
            color = colors.text.normal.copy(alpha = 0.4f),
        )
    } else {
        Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
            relatedTests.forEach { (name, sharedScreens, flakiness) ->
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(colors.text.normal.copy(alpha = 0.03f), RoundedCornerShape(4.dp))
                        .padding(8.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Column(modifier = Modifier.weight(1f)) {
                        Text(name, fontSize = 11.sp)
                        if (!isCompact) {
                            Text(
                                "Shares: ${sharedScreens.joinToString(", ")}",
                                fontSize = 9.sp,
                                color = colors.text.normal.copy(alpha = 0.4f),
                            )
                        }
                    }
                    if (flakiness > 0.05f) {
                        Text(
                            if (isCompact) "${(flakiness * 100).toInt()}%" else "${(flakiness * 100).toInt()}% flaky",
                            fontSize = 9.sp,
                            color = if (flakiness > 0.1f) Color(0xFFFF9800) else colors.text.normal.copy(alpha = 0.5f),
                        )
                    } else {
                        Text(
                            if (isCompact) "✓" else "Stable",
                            fontSize = 9.sp,
                            color = Color(0xFF4CAF50).copy(alpha = 0.8f),
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun ActionCard(
    icon: String,
    title: String,
    description: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    emphasized: Boolean = false,
) {
    val colors = JewelTheme.globalColors
    val bgColor = if (emphasized) {
        Color(0xFF2196F3).copy(alpha = 0.1f)
    } else {
        colors.text.normal.copy(alpha = 0.05f)
    }
    val borderColor = if (emphasized) {
        Color(0xFF2196F3).copy(alpha = 0.3f)
    } else {
        Color.Transparent
    }

    Box(
        modifier = modifier
            .then(
                if (borderColor != Color.Transparent)
                    Modifier.border(1.dp, borderColor, RoundedCornerShape(8.dp))
                else Modifier
            )
            .background(bgColor, RoundedCornerShape(8.dp))
            .clickable(onClick = onClick)
            .pointerHoverIcon(PointerIcon.Hand)
            .padding(12.dp),
    ) {
        Row(
            horizontalArrangement = Arrangement.spacedBy(10.dp),
            verticalAlignment = Alignment.Top,
        ) {
            Text(icon, fontSize = 20.sp)
            Column {
                Text(title, fontSize = 13.sp)
                Text(
                    description,
                    fontSize = 11.sp,
                    color = colors.text.normal.copy(alpha = 0.5f),
                )
            }
        }
    }
}

@Composable
private fun DevicePickerOverlay(
    platform: TestPlatform,
    onDeviceSelected: (BootedDevice) -> Unit,
    onDismiss: () -> Unit,
) {
    val colors = JewelTheme.globalColors

    // Mock devices - would come from actual device manager
    // Filter to only show devices matching the test platform
    val allDevices = remember {
        listOf(
            BootedDevice("pixel8", "Pixel 8 API 35", DeviceType.AndroidEmulator, "Running"),
            BootedDevice("pixel7", "Pixel 7 API 34", DeviceType.AndroidEmulator, "Running"),
            BootedDevice("iphone15", "iPhone 15 Pro", DeviceType.iOSSimulator, "Booted"),
            BootedDevice("iphone14", "iPhone 14", DeviceType.iOSSimulator, "Booted"),
        )
    }

    val availableDevices = remember(platform) {
        allDevices.filter { device ->
            when (platform) {
                TestPlatform.Android -> device.type == DeviceType.AndroidEmulator
                TestPlatform.iOS -> device.type == DeviceType.iOSSimulator
            }
        }
    }

    val platformName = if (platform == TestPlatform.Android) "Android Emulator" else "iOS Simulator"

    Box(
        modifier = Modifier
            .fillMaxWidth()
            .background(colors.text.normal.copy(alpha = 0.03f), RoundedCornerShape(8.dp))
            .border(1.dp, colors.text.normal.copy(alpha = 0.1f), RoundedCornerShape(8.dp))
            .padding(12.dp),
    ) {
        Column {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text("Select $platformName", fontSize = 13.sp)
                Link("Cancel", onClick = onDismiss)
            }

            Spacer(Modifier.height(12.dp))

            availableDevices.forEach { device ->
                DevicePickerRow(
                    device = device,
                    onClick = { onDeviceSelected(device) },
                )
                Spacer(Modifier.height(6.dp))
            }
        }
    }
}

@Composable
private fun DevicePickerRow(
    device: BootedDevice,
    onClick: () -> Unit,
) {
    val colors = JewelTheme.globalColors
    val iconColor = colors.text.normal.copy(alpha = 0.7f)

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(colors.text.normal.copy(alpha = 0.05f), RoundedCornerShape(6.dp))
            .clickable(onClick = onClick)
            .pointerHoverIcon(PointerIcon.Hand)
            .padding(10.dp),
        horizontalArrangement = Arrangement.spacedBy(10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        // Device type icon
        Text(
            when (device.type) {
                DeviceType.AndroidEmulator, DeviceType.AndroidPhysical -> "🤖"
                DeviceType.iOSSimulator, DeviceType.iOSPhysical -> "🍎"
            },
            fontSize = 16.sp,
        )

        Column(modifier = Modifier.weight(1f)) {
            Text(device.name, fontSize = 12.sp)
            Text(
                device.status,
                fontSize = 10.sp,
                color = colors.text.normal.copy(alpha = 0.5f),
            )
        }

        // Status indicator
        Box(
            modifier = Modifier
                .size(8.dp)
                .background(Color(0xFF4CAF50), CircleShape)
        )
    }
}

private fun formatTime(ms: Long): String {
    val seconds = (ms / 1000) % 60
    val minutes = (ms / 1000) / 60
    val millis = (ms % 1000) / 10
    return if (minutes > 0) {
        "%d:%02d.%02d".format(minutes, seconds, millis)
    } else {
        "%d.%02ds".format(seconds, millis)
    }
}

@Composable
private fun TestStepRowWithScreenshot(
    step: TestStep,
    isCurrentStep: Boolean,
    onStepClick: () -> Unit,
    isCompact: Boolean = false,
) {
    val colors = JewelTheme.globalColors
    val statusColor = when (step.status) {
        TestStatus.Passed -> Color(0xFF4CAF50)
        TestStatus.Failed -> Color(0xFFFF5722)
        TestStatus.Running -> Color(0xFF2196F3)
        TestStatus.Skipped -> colors.text.normal.copy(alpha = 0.4f)
    }

    val highlightColor = if (isCurrentStep) Color(0xFF2196F3).copy(alpha = 0.15f)
    else colors.text.normal.copy(alpha = 0.03f)

    val borderModifier = if (isCurrentStep) {
        Modifier.border(1.5.dp, Color(0xFF2196F3).copy(alpha = 0.6f), RoundedCornerShape(6.dp))
    } else Modifier

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .then(borderModifier)
            .background(highlightColor, RoundedCornerShape(6.dp))
            .clickable(onClick = onStepClick)
            .pointerHoverIcon(PointerIcon.Hand)
            .padding(if (isCompact) 8.dp else 10.dp),
        verticalAlignment = Alignment.Top,
    ) {
        // Screenshot thumbnail - smaller in compact mode
        if (!isCompact) {
            Box(
                modifier = Modifier
                    .width(48.dp)
                    .height(85.dp)
                    .background(Color(0xFF2A2A2A), RoundedCornerShape(4.dp)),
                contentAlignment = Alignment.Center,
            ) {
                if (step.screenshotPath != null) {
                    Column(
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.Center,
                    ) {
                        Text(
                            step.screenName?.take(6) ?: "?",
                            fontSize = 8.sp,
                            color = Color.White.copy(alpha = 0.7f),
                        )
                    }
                } else {
                    Text(
                        "—",
                        fontSize = 10.sp,
                        color = Color.White.copy(alpha = 0.3f),
                    )
                }
            }
            Spacer(Modifier.width(12.dp))
        }

        Column(modifier = Modifier.weight(1f)) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                // Step number
                Text(
                    "${step.index + 1}",
                    fontSize = if (isCompact) 10.sp else 11.sp,
                    color = colors.text.normal.copy(alpha = 0.4f),
                )

                // Status indicator
                Box(
                    modifier = Modifier.size(if (isCompact) 6.dp else 8.dp).background(statusColor, CircleShape)
                )

                // Action - truncate in compact mode
                val actionText = if (isCompact && step.target.length > 15) {
                    "${step.action}: ${step.target.take(15)}..."
                } else {
                    "${step.action}: ${step.target}"
                }
                Text(
                    actionText,
                    fontSize = if (isCompact) 11.sp else 12.sp,
                )
            }

            if (!isCompact) {
                step.screenName?.let {
                    Text(
                        "on $it",
                        fontSize = 10.sp,
                        color = colors.text.normal.copy(alpha = 0.5f),
                        modifier = Modifier.padding(top = 2.dp),
                    )
                }
            }

            step.errorMessage?.let { error ->
                Spacer(Modifier.height(4.dp))
                // Show full error when selected, ellipses otherwise
                val displayError = if (isCurrentStep) {
                    error  // Full stacktrace/error when selected
                } else if (error.length > 35) {
                    error.take(35) + "..."
                } else {
                    error
                }
                Text(
                    displayError,
                    fontSize = 10.sp,
                    color = Color(0xFFFF5722),
                )
            }
        }

        // Duration only (removed ">" indicator)
        Text(
            "${step.durationMs}ms",
            fontSize = if (isCompact) 9.sp else 10.sp,
            color = colors.text.normal.copy(alpha = 0.4f),
        )
    }
}

@Composable
private fun ArtifactButton(label: String) {
    val colors = JewelTheme.globalColors

    Box(
        modifier = Modifier
            .background(colors.text.normal.copy(alpha = 0.05f), RoundedCornerShape(6.dp))
            .clickable { /* TODO: Open artifact */ }
            .pointerHoverIcon(PointerIcon.Hand)
            .padding(horizontal = 12.dp, vertical = 8.dp),
    ) {
        Text(label, fontSize = 12.sp)
    }
}
