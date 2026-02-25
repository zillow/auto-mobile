import Foundation
import QuartzCore

#if canImport(UIKit) && os(iOS)
    import UIKit
#endif

/// FPS monitor that uses CADisplayLink to measure actual frame delivery timing.
///
/// Based on Apple's recommended patterns from WWDC and documentation:
/// - Uses `link.timestamp` for actual frame timing (not CACurrentMediaTime)
/// - Measures actual intervals between callbacks to determine real FPS
/// - Detects jank when frame time exceeds budget (16.67ms for 60Hz, 8.33ms for 120Hz)
///
/// Note: For ProMotion (120Hz) on iPhone, the app's Info.plist must include:
///   `<key>CADisableMinimumFrameDurationOnPhone</key><true/>`
///
/// Reference: WWDC sessions on hitches and frame pacing
public class DisplayLinkFPSMonitor: PerformanceMetricsProvider {
    /// How often to report aggregated metrics (in seconds)
    public static let defaultReportIntervalSeconds = 0.5

    /// Frame time thresholds for jank detection
    /// - 60Hz budget: 16.67ms
    /// - 120Hz budget: 8.33ms
    /// We use 2x the 60Hz budget as the jank threshold (33.33ms = definitely dropped frames)
    public static let defaultJankThresholdMs = 33.33

    #if canImport(UIKit) && os(iOS)
        private var displayLink: CADisplayLink?
    #endif
    private var monitoringCallback: (@Sendable (PerformanceSnapshot) -> Void)?
    private var _isMonitoring = false
    private let lock = NSLock()

    // Frame timing tracking using CADisplayLink timestamps
    private var lastLinkTimestamp: CFTimeInterval = 0
    private var frameCount = 0
    private var frameTimes: [Double] = []
    private var jankFrameCount = 0
    private var lastReportTime: CFTimeInterval = 0

    /// Report interval in seconds
    private let reportInterval: Double

    /// Jank threshold in milliseconds
    /// Frames taking longer than this are considered janky (dropped frames)
    private let jankThresholdMs: Double

    /// Time provider for timestamps in snapshots
    private let timeProvider: TimeProvider

    public init(
        reportInterval: Double = defaultReportIntervalSeconds,
        jankThresholdMs: Double = defaultJankThresholdMs,
        timeProvider: TimeProvider = SystemTimeProvider()
    ) {
        self.reportInterval = reportInterval
        self.jankThresholdMs = jankThresholdMs
        self.timeProvider = timeProvider
    }

    public func collectMetrics() async -> PerformanceSnapshot? {
        // Use nonisolated synchronous helper to avoid Swift 6 async/lock warning
        return collectMetricsSync()
    }

    /// Synchronous helper for collecting metrics (avoids async context lock issues)
    private nonisolated func collectMetricsSync() -> PerformanceSnapshot? {
        lock.lock()
        let snapshot = createSnapshot()
        lock.unlock()
        return snapshot
    }

    public func startMonitoring(callback: @escaping @Sendable (PerformanceSnapshot) -> Void) {
        lock.lock()
        defer { lock.unlock() }

        guard !_isMonitoring else { return }

        _isMonitoring = true
        monitoringCallback = callback
        resetMetrics()

        #if canImport(UIKit) && os(iOS)
            // Create display link on the main thread
            DispatchQueue.main.async { [weak self] in
                guard let self = self else { return }

                let displayLink = CADisplayLink(target: self, selector: #selector(self.displayLinkFired))

                // Use .common mode to ensure callbacks continue during scrolling/gestures
                // Reference: UIKit Animation Debugging skill - Pattern 6
                displayLink.add(to: .main, forMode: .common)

                self.lock.lock()
                self.displayLink = displayLink
                self.lastLinkTimestamp = 0 // Will be set on first callback
                self.lastReportTime = CACurrentMediaTime()
                self.lock.unlock()

                print("[DisplayLinkFPSMonitor] Started monitoring")
            }
        #else
            print("[DisplayLinkFPSMonitor] CADisplayLink not available on this platform")
        #endif
    }

    public func stopMonitoring() {
        lock.lock()
        defer { lock.unlock() }

        _isMonitoring = false
        monitoringCallback = nil

        #if canImport(UIKit) && os(iOS)
            displayLink?.invalidate()
            displayLink = nil
        #endif

        print("[DisplayLinkFPSMonitor] Stopped monitoring")
    }

    public var isMonitoring: Bool {
        lock.lock()
        defer { lock.unlock() }
        return _isMonitoring
    }

    // MARK: - Display Link Callback

    #if canImport(UIKit) && os(iOS)
        @objc
        private func displayLinkFired(_ link: CADisplayLink) {
            lock.lock()

            // Use link.timestamp - the time when the frame will be displayed
            // This is the proper way to measure actual frame intervals
            // Reference: Display Performance skill - "UIScreen Lies, Actual Presentation Tells Truth"
            let currentTimestamp = link.timestamp

            if lastLinkTimestamp > 0 {
                let frameDuration = currentTimestamp - lastLinkTimestamp

                if frameDuration > 0 {
                    let frameTimeMs = frameDuration * 1000.0
                    frameTimes.append(frameTimeMs)
                    frameCount += 1

                    // Check for jank (frame time > threshold indicates dropped frames)
                    // A frame taking >33ms means we missed at least one vsync at 60Hz
                    if frameTimeMs > jankThresholdMs {
                        jankFrameCount += 1
                    }
                }
            }

            lastLinkTimestamp = currentTimestamp

            // Check if we should report
            let currentTime = CACurrentMediaTime()
            let timeSinceLastReport = currentTime - lastReportTime

            if timeSinceLastReport >= reportInterval {
                let snapshot = createSnapshot()
                let callback = monitoringCallback
                resetMetrics()
                lastReportTime = currentTime
                lock.unlock()

                // Call callback outside the lock
                if let snapshot = snapshot {
                    callback?(snapshot)
                }
            } else {
                lock.unlock()
            }
        }
    #endif

    // MARK: - Metrics Calculation

    /// Create a snapshot from current accumulated metrics.
    /// Must be called with lock held.
    private func createSnapshot() -> PerformanceSnapshot? {
        guard frameCount > 0 else { return nil }

        // Calculate average frame time from actual intervals
        let totalFrameTime = frameTimes.reduce(0, +)
        let avgFrameTimeMs = totalFrameTime / Double(frameCount)

        // Calculate FPS from average frame time
        // Don't cap at 60 - ProMotion devices can reach 120Hz
        let fps = avgFrameTimeMs > 0 ? Float(1000.0 / avgFrameTimeMs) : nil

        // Include CPU/memory if available
        let cpuPercent = Self.collectCpuUsagePercent()
        let memoryMb = Self.collectMemoryUsageMb()

        return PerformanceSnapshot(
            timestamp: timeProvider.currentTimeMillis(),
            fps: fps,
            frameTimeMs: Float(avgFrameTimeMs),
            jankFrames: jankFrameCount,
            touchLatencyMs: nil, // Would need touch event tracking
            ttffMs: nil,
            ttiMs: nil,
            cpuUsagePercent: cpuPercent,
            memoryUsageMb: memoryMb,
            screenName: nil
        )
    }

    /// Reset metrics for the next reporting interval.
    /// Must be called with lock held.
    private func resetMetrics() {
        frameCount = 0
        frameTimes.removeAll(keepingCapacity: true)
        jankFrameCount = 0
    }
}

// MARK: - System Metrics Collection

extension DisplayLinkFPSMonitor {
    /// Collect memory usage using task_info.
    /// Returns memory in MB or nil if unavailable.
    public static func collectMemoryUsageMb() -> Float? {
        var info = mach_task_basic_info()
        var count = mach_msg_type_number_t(MemoryLayout<mach_task_basic_info>.size) / 4

        let result = withUnsafeMutablePointer(to: &info) {
            $0.withMemoryRebound(to: integer_t.self, capacity: 1) {
                task_info(mach_task_self_, task_flavor_t(MACH_TASK_BASIC_INFO), $0, &count)
            }
        }

        guard result == KERN_SUCCESS else { return nil }

        // Convert bytes to MB
        return Float(info.resident_size) / (1024 * 1024)
    }

    /// Collect CPU usage percentage.
    /// This is approximate and based on thread CPU time.
    public static func collectCpuUsagePercent() -> Float? {
        var threadList: thread_act_array_t?
        var threadCount = mach_msg_type_number_t(0)

        let result = task_threads(mach_task_self_, &threadList, &threadCount)
        guard result == KERN_SUCCESS, let threads = threadList else { return nil }

        defer {
            vm_deallocate(
                mach_task_self_,
                vm_address_t(bitPattern: threads),
                vm_size_t(Int(threadCount) * MemoryLayout<thread_t>.stride)
            )
        }

        var totalCpu: Double = 0

        for i in 0 ..< Int(threadCount) {
            var threadInfo = thread_basic_info()
            var threadInfoCount = mach_msg_type_number_t(THREAD_INFO_MAX)

            let infoResult = withUnsafeMutablePointer(to: &threadInfo) {
                $0.withMemoryRebound(to: integer_t.self, capacity: Int(threadInfoCount)) {
                    thread_info(threads[i], thread_flavor_t(THREAD_BASIC_INFO), $0, &threadInfoCount)
                }
            }

            if infoResult == KERN_SUCCESS && threadInfo.flags & TH_FLAGS_IDLE == 0 {
                totalCpu += Double(threadInfo.cpu_usage) / Double(TH_USAGE_SCALE) * 100.0
            }
        }

        return Float(min(totalCpu, 100.0))
    }
}
