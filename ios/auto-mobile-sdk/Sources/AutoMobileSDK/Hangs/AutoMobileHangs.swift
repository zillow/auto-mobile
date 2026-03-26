import Foundation

/// Main thread hang detection.
/// iOS equivalent of Android's ANR detection.
/// Monitors the main thread and reports when it's blocked for too long.
public final class AutoMobileHangs: @unchecked Sendable {
    public static let shared = AutoMobileHangs()

    private let lock = NSLock()
    private var bundleId: String?
    private weak var buffer: SdkEventBuffer?
    private var watchdogThread: Thread?
    private var _isMonitoring = false
    private var monitorGeneration: UInt64 = 0

    /// Threshold in milliseconds before a hang is reported. Default: 2000ms.
    public var hangThresholdMs: Double = 2000

    /// Polling interval in milliseconds. Default: 500ms.
    public var pollIntervalMs: Double = 500

    private init() {}

    func initialize(bundleId: String?, buffer: SdkEventBuffer) {
        lock.lock()
        self.bundleId = bundleId
        self.buffer = buffer
        lock.unlock()
    }

    /// Start monitoring the main thread for hangs.
    public func startMonitoring() {
        lock.lock()
        guard !_isMonitoring else {
            lock.unlock()
            return
        }
        _isMonitoring = true
        monitorGeneration &+= 1
        let generation = monitorGeneration
        lock.unlock()

        let thread = Thread { [weak self] in
            self?.watchdogLoop(generation: generation)
        }
        thread.name = "dev.jasonpearson.automobile.sdk.hang-detector"
        thread.qualityOfService = .userInitiated

        lock.lock()
        watchdogThread = thread
        lock.unlock()

        thread.start()
    }

    /// Stop monitoring.
    public func stopMonitoring() {
        lock.lock()
        _isMonitoring = false
        watchdogThread?.cancel()
        watchdogThread = nil
        lock.unlock()
    }

    public var isMonitoring: Bool {
        lock.lock()
        defer { lock.unlock() }
        return _isMonitoring
    }

    private func watchdogLoop(generation: UInt64) {
        while true {
            lock.lock()
            let monitoring = _isMonitoring && monitorGeneration == generation
            lock.unlock()
            guard monitoring else { break }

            let semaphore = DispatchSemaphore(value: 0)
            let checkStart = CFAbsoluteTimeGetCurrent()

            DispatchQueue.main.async {
                semaphore.signal()
            }

            let timeoutMs = hangThresholdMs
            let result = semaphore.wait(timeout: .now() + .milliseconds(Int(timeoutMs)))

            if result == .timedOut {
                // Main thread is still blocked — measure actual duration
                let actualDurationMs = (CFAbsoluteTimeGetCurrent() - checkStart) * 1000
                let mainThreadStack = captureMainThreadStack()
                reportHang(durationMs: actualDurationMs, stackTrace: mainThreadStack)
            }

            Thread.sleep(forTimeInterval: pollIntervalMs / 1000.0)
        }
    }

    /// Capture stack trace context during a hang.
    /// Note: iOS does not provide a public API to capture another thread's stack.
    /// This captures the watchdog thread's stack as a diagnostic marker that a hang
    /// was detected, not the actual blocking call stack on the main thread.
    /// For production hang diagnostics, use MetricKit's MXHangDiagnostic (iOS 16+).
    private func captureMainThreadStack() -> String? {
        let symbols = Thread.callStackSymbols
        if symbols.isEmpty { return nil }
        return "Hang detected (watchdog thread stack — use MetricKit for main thread stack):\n" + symbols.joined(separator: "\n")
    }

    private func reportHang(durationMs: Double, stackTrace: String?) {
        guard AutoMobileSDK.shared.isEnabled else { return }

        lock.lock()
        let currentBundleId = bundleId ?? Bundle.main.bundleIdentifier ?? ""
        let currentBuffer = buffer
        lock.unlock()

        let event = SdkHangEvent(
            durationMs: durationMs,
            stackTrace: stackTrace,
            bundleId: currentBundleId
        )
        currentBuffer?.add(event)
    }

    // MARK: - Testing Support

    internal func reset() {
        stopMonitoring()
        lock.lock()
        bundleId = nil
        buffer = nil
        lock.unlock()
    }
}
