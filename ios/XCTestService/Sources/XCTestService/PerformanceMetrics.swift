import Foundation

// MARK: - Performance Snapshot

/// A snapshot of performance metrics at a point in time.
public struct PerformanceSnapshot: Codable, Sendable {
    /// Timestamp in milliseconds (epoch time)
    public let timestamp: Int64

    /// Frames per second (if available)
    public let fps: Float?

    /// Frame time in milliseconds (if available)
    public let frameTimeMs: Float?

    /// Number of janky frames (frames that took longer than expected)
    public let jankFrames: Int?

    /// Touch response latency in milliseconds
    public let touchLatencyMs: Float?

    /// Time to first frame in milliseconds (from app launch)
    public let ttffMs: Float?

    /// Time to interactive in milliseconds
    public let ttiMs: Float?

    /// CPU usage percentage (0-100)
    public let cpuUsagePercent: Float?

    /// Memory usage in MB
    public let memoryUsageMb: Float?

    /// Current screen/view controller name
    public let screenName: String?

    public init(
        timestamp: Int64,
        fps: Float? = nil,
        frameTimeMs: Float? = nil,
        jankFrames: Int? = nil,
        touchLatencyMs: Float? = nil,
        ttffMs: Float? = nil,
        ttiMs: Float? = nil,
        cpuUsagePercent: Float? = nil,
        memoryUsageMb: Float? = nil,
        screenName: String? = nil
    ) {
        self.timestamp = timestamp
        self.fps = fps
        self.frameTimeMs = frameTimeMs
        self.jankFrames = jankFrames
        self.touchLatencyMs = touchLatencyMs
        self.ttffMs = ttffMs
        self.ttiMs = ttiMs
        self.cpuUsagePercent = cpuUsagePercent
        self.memoryUsageMb = memoryUsageMb
        self.screenName = screenName
    }
}

// MARK: - Performance Metrics Provider Protocol

/// Protocol for collecting performance metrics.
/// Implementations provide platform-specific metric collection.
public protocol PerformanceMetricsProvider {
    /// Collect a snapshot of current performance metrics.
    /// Returns nil if metrics cannot be collected.
    func collectMetrics() async -> PerformanceSnapshot?

    /// Start continuous monitoring with periodic callbacks.
    /// The callback will be invoked at regular intervals with new metrics.
    func startMonitoring(callback: @escaping @Sendable (PerformanceSnapshot) -> Void)

    /// Stop continuous monitoring.
    func stopMonitoring()

    /// Check if monitoring is currently active.
    var isMonitoring: Bool { get }
}

// MARK: - No-Op Implementation

/// No-op implementation of PerformanceMetricsProvider.
/// Returns empty/nil results for all operations.
/// Use this as a placeholder until platform-specific implementation is available.
public class NoOpPerformanceMetricsProvider: PerformanceMetricsProvider {
    private var _isMonitoring = false
    private let lock = NSLock()

    public init() {}

    public func collectMetrics() async -> PerformanceSnapshot? {
        // No-op: Return nil to indicate metrics are not available
        return nil
    }

    public func startMonitoring(callback: @escaping @Sendable (PerformanceSnapshot) -> Void) {
        lock.lock()
        defer { lock.unlock() }
        // No-op: Set flag but don't actually monitor
        _isMonitoring = true
    }

    public func stopMonitoring() {
        lock.lock()
        defer { lock.unlock() }
        _isMonitoring = false
    }

    public var isMonitoring: Bool {
        lock.lock()
        defer { lock.unlock() }
        return _isMonitoring
    }
}

// MARK: - Fake Implementation for Testing

/// Fake implementation for testing that returns configurable metrics.
public class FakePerformanceMetricsProvider: PerformanceMetricsProvider {
    private var _isMonitoring = false
    private var monitoringCallback: (@Sendable (PerformanceSnapshot) -> Void)?
    private var monitoringTask: Task<Void, Never>?
    private let lock = NSLock()

    /// The snapshot to return from collectMetrics()
    public var nextSnapshot: PerformanceSnapshot?

    /// Interval between monitoring callbacks in milliseconds
    public var monitoringIntervalMs: Int64 = 1000

    /// Time provider for generating timestamps
    private let timeProvider: TimeProvider

    public init(timeProvider: TimeProvider = SystemTimeProvider()) {
        self.timeProvider = timeProvider
    }

    public func collectMetrics() async -> PerformanceSnapshot? {
        return nextSnapshot ?? PerformanceSnapshot(
            timestamp: timeProvider.currentTimeMillis(),
            fps: 60,
            frameTimeMs: 16.67,
            jankFrames: 0,
            cpuUsagePercent: 10,
            memoryUsageMb: 100
        )
    }

    public func startMonitoring(callback: @escaping @Sendable (PerformanceSnapshot) -> Void) {
        lock.lock()
        _isMonitoring = true
        monitoringCallback = callback
        lock.unlock()

        // Start a background task to emit metrics
        monitoringTask = Task { [weak self] in
            while !Task.isCancelled {
                guard let self = self else { break }

                // Read monitoring state synchronously (outside async context)
                let (shouldContinue, cb, intervalMs) = self.getMonitoringState()

                guard shouldContinue else { break }

                let snapshot = await self.collectMetrics()
                if let snapshot = snapshot, let cb = cb {
                    cb(snapshot)
                }

                try? await Task.sleep(nanoseconds: UInt64(intervalMs) * 1_000_000)
            }
        }
    }

    /// Helper to get monitoring state synchronously.
    private func getMonitoringState() -> (isMonitoring: Bool, callback: (@Sendable (PerformanceSnapshot) -> Void)?, intervalMs: Int64) {
        lock.lock()
        let monitoring = _isMonitoring
        let cb = monitoringCallback
        let interval = monitoringIntervalMs
        lock.unlock()
        return (monitoring, cb, interval)
    }

    public func stopMonitoring() {
        lock.lock()
        _isMonitoring = false
        monitoringCallback = nil
        lock.unlock()

        monitoringTask?.cancel()
        monitoringTask = nil
    }

    public var isMonitoring: Bool {
        lock.lock()
        defer { lock.unlock() }
        return _isMonitoring
    }

    /// Manually emit a snapshot to the monitoring callback.
    /// Useful for testing specific scenarios.
    public func emitSnapshot(_ snapshot: PerformanceSnapshot) {
        lock.lock()
        let cb = monitoringCallback
        lock.unlock()
        cb?(snapshot)
    }
}
