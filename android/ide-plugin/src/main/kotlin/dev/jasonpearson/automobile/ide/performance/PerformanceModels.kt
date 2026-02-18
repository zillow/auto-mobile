package dev.jasonpearson.automobile.ide.performance

// Health status for metrics
enum class HealthStatus { Healthy, Warning, Critical }

// Types of performance metrics
enum class MetricType {
    TouchLatency,       // Time from touch to first frame response
    TimeToFirstFrame,   // How quickly the first screen renders
    TimeToInteractive,  // When the UI becomes responsive
    Jank,               // Missed frames / UI stuttering
    FPS,                // Frames per second time series
    FrameTime,          // Time to render a single frame (ms)
    Memory,             // Memory usage in MB
    RecompositionCount, // Compose recompositions per second
}

data class PerformanceMetric(
    val id: String,
    val type: MetricType,
    val name: String,
    val currentValue: Float,
    val unit: String,
    val thresholdWarning: Float,
    val thresholdCritical: Float,
    val trend: MetricTrend,  // Up, Down, Stable
    val history: List<MetricDataPoint>,
)

enum class MetricTrend { Up, Down, Stable }

data class MetricDataPoint(
    val timestamp: Long,
    val value: Float,
    val screenName: String? = null,  // Associated screen if applicable
    val testStep: String? = null,  // Associated test step if applicable
)

data class PerformanceAnomaly(
    val id: String,
    val metricType: MetricType,
    val severity: HealthStatus,
    val message: String,
    val timestamp: Long,
    val screenName: String?,
    val testName: String?,
    val value: Float,
    val threshold: Float,
    val isPinned: Boolean = false,
)

data class PerformanceRun(
    val id: String,
    val name: String,
    val timestamp: Long,
    val durationMs: Int,
    val deviceName: String,
    val overallHealth: HealthStatus,
    val metrics: List<PerformanceMetric>,
    val anomalies: List<PerformanceAnomaly>,
    val screensAnalyzed: List<String>,
)

// For compare runs feature
data class RunComparison(
    val baselineRun: PerformanceRun,
    val compareRun: PerformanceRun,
    val improvements: List<MetricChange>,
    val regressions: List<MetricChange>,
)

data class MetricChange(
    val metricType: MetricType,
    val baselineValue: Float,
    val compareValue: Float,
    val percentChange: Float,
)

/**
 * Performance threshold constants for health status calculation.
 * These values match the server-side thresholds.
 */
object PerformanceThresholds {
    // FPS thresholds (lower is worse)
    const val FPS_WARNING = 55f
    const val FPS_CRITICAL = 45f

    // Frame time thresholds in ms (higher is worse)
    const val FRAME_TIME_WARNING_MS = 18f  // 16.67ms is 60fps, 18ms allows some margin
    const val FRAME_TIME_CRITICAL_MS = 33f  // 33ms is 30fps

    // Jank frame count thresholds (higher is worse)
    const val JANK_WARNING_FRAMES = 5f
    const val JANK_CRITICAL_FRAMES = 10f

    // Touch latency thresholds in ms (higher is worse)
    const val TOUCH_LATENCY_WARNING_MS = 100f
    const val TOUCH_LATENCY_CRITICAL_MS = 200f

    // Time to First Frame thresholds in ms (higher is worse)
    const val TTFF_WARNING_MS = 500f
    const val TTFF_CRITICAL_MS = 1000f

    // Time to Interactive thresholds in ms (higher is worse)
    const val TTI_WARNING_MS = 700f
    const val TTI_CRITICAL_MS = 1500f

    // Memory usage thresholds in MB (higher is worse)
    const val MEMORY_WARNING_MB = 256f
    const val MEMORY_CRITICAL_MB = 512f

    // CPU usage thresholds in percent (higher is worse)
    const val CPU_WARNING_PERCENT = 50f
    const val CPU_CRITICAL_PERCENT = 80f

    // Recomposition rate thresholds in recomp/s (higher is worse)
    const val RECOMPOSITION_WARNING = 10f
    const val RECOMPOSITION_CRITICAL = 50f
}

// Mock data for development
object PerformanceMockData {
    private const val BASE_TIME = 1705000000000L

    private fun generateHistory(
        baseValue: Float,
        variance: Float,
        count: Int,
        screens: List<String>,
    ): List<MetricDataPoint> {
        return (0 until count).map { i ->
            MetricDataPoint(
                timestamp = BASE_TIME + i * 1000L,
                value = baseValue + (Math.random().toFloat() - 0.5f) * variance * 2,
                screenName = screens.getOrNull(i % screens.size),
            )
        }
    }

    // Generate FPS time series (typically high with occasional dips)
    private fun generateFpsHistory(count: Int, screens: List<String>): List<MetricDataPoint> {
        return (0 until count).map { i ->
            val baseFps = 60f
            // Simulate occasional frame drops
            val dip = if (i % 12 == 0) (Math.random().toFloat() * 20f) else 0f
            MetricDataPoint(
                timestamp = BASE_TIME + i * 16L,  // ~60fps timing
                value = (baseFps - dip).coerceAtLeast(30f),
                screenName = screens.getOrNull(i % screens.size),
            )
        }
    }

    val screens = listOf("Splash", "Login", "Home", "ChatList", "Chat", "Profile", "Settings")

    val touchLatencyMetric = PerformanceMetric(
        id = "touch_latency",
        type = MetricType.TouchLatency,
        name = "Touch Latency",
        currentValue = 42f,
        unit = "ms",
        thresholdWarning = 100f,
        thresholdCritical = 200f,
        trend = MetricTrend.Stable,
        history = generateHistory(45f, 20f, 60, screens),
    )

    val timeToFirstFrameMetric = PerformanceMetric(
        id = "ttff",
        type = MetricType.TimeToFirstFrame,
        name = "Time to First Frame",
        currentValue = 320f,
        unit = "ms",
        thresholdWarning = 500f,
        thresholdCritical = 1000f,
        trend = MetricTrend.Down,  // Improving
        history = generateHistory(350f, 80f, 60, screens),
    )

    val timeToInteractiveMetric = PerformanceMetric(
        id = "tti",
        type = MetricType.TimeToInteractive,
        name = "Time to Interactive",
        currentValue = 580f,
        unit = "ms",
        thresholdWarning = 1000f,
        thresholdCritical = 2000f,
        trend = MetricTrend.Stable,
        history = generateHistory(600f, 150f, 60, screens),
    )

    val jankMetric = PerformanceMetric(
        id = "jank",
        type = MetricType.Jank,
        name = "Jank (Missed Frames)",
        currentValue = 3f,  // Number of missed frames during startup
        unit = "frames",
        thresholdWarning = 5f,
        thresholdCritical = 10f,
        trend = MetricTrend.Up,  // Getting worse
        history = generateHistory(4f, 3f, 60, screens),
    )

    val fpsMetric = PerformanceMetric(
        id = "fps",
        type = MetricType.FPS,
        name = "Frame Rate",
        currentValue = 58f,
        unit = "fps",
        thresholdWarning = 45f,
        thresholdCritical = 30f,
        trend = MetricTrend.Stable,
        history = generateFpsHistory(120, screens),  // Higher resolution for FPS
    )

    val allMetrics = listOf(
        touchLatencyMetric,
        timeToFirstFrameMetric,
        timeToInteractiveMetric,
        jankMetric,
        fpsMetric,
    )

    val anomalies = listOf(
        PerformanceAnomaly(
            id = "anom1",
            metricType = MetricType.Jank,
            severity = HealthStatus.Warning,
            message = "Frame drops during list scroll",
            timestamp = BASE_TIME + 15000,
            screenName = "ChatList",
            testName = "testSendMessage",
            value = 8f,
            threshold = 5f,
        ),
        PerformanceAnomaly(
            id = "anom2",
            metricType = MetricType.FPS,
            severity = HealthStatus.Warning,
            message = "FPS drop during scroll animation",
            timestamp = BASE_TIME + 28000,
            screenName = "Chat",
            testName = "testSendMessage",
            value = 38f,
            threshold = 45f,
        ),
        PerformanceAnomaly(
            id = "anom3",
            metricType = MetricType.TouchLatency,
            severity = HealthStatus.Critical,
            message = "High touch latency on button press",
            timestamp = BASE_TIME + 42000,
            screenName = "Login",
            testName = "testLoginFlow",
            value = 250f,
            threshold = 200f,
        ),
        PerformanceAnomaly(
            id = "anom4",
            metricType = MetricType.TimeToFirstFrame,
            severity = HealthStatus.Warning,
            message = "Slow first frame render",
            timestamp = BASE_TIME + 55000,
            screenName = "Home",
            testName = null,
            value = 650f,
            threshold = 500f,
        ),
    )

    val currentRun = PerformanceRun(
        id = "run_current",
        name = "Current Session",
        timestamp = BASE_TIME,
        durationMs = 60000,
        deviceName = "Pixel 8 API 35",
        overallHealth = HealthStatus.Warning,
        metrics = allMetrics,
        anomalies = anomalies,
        screensAnalyzed = screens,
    )

    val previousRun = PerformanceRun(
        id = "run_previous",
        name = "Previous Run",
        timestamp = BASE_TIME - 86400000,  // Yesterday
        durationMs = 55000,
        deviceName = "Pixel 8 API 35",
        overallHealth = HealthStatus.Healthy,
        metrics = allMetrics.map { it.copy(currentValue = it.currentValue * 0.9f) },
        anomalies = anomalies.take(1),
        screensAnalyzed = screens,
    )

    val recentRuns = listOf(currentRun, previousRun)
}
