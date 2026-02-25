import Foundation

// MARK: - TimeProvider Protocol

/// Protocol for providing current time in milliseconds. Uses injection for testability.
public protocol TimeProvider {
    /// Get current time in milliseconds (epoch time)
    func currentTimeMillis() -> Int64
}

/// Default implementation using system clock.
public class SystemTimeProvider: TimeProvider {
    public init() {}

    public func currentTimeMillis() -> Int64 {
        return Int64(Date().timeIntervalSince1970 * 1000)
    }
}

/// Fake implementation for testing with controllable time.
public class FakeTimeProvider: TimeProvider {
    private var currentTime: Int64
    private let lock = NSLock()

    public init(initialTime: Int64 = 0) {
        currentTime = initialTime
    }

    public func currentTimeMillis() -> Int64 {
        lock.lock()
        defer { lock.unlock() }
        return currentTime
    }

    /// Set the current time to a specific value.
    public func setTime(_ time: Int64) {
        lock.lock()
        defer { lock.unlock() }
        currentTime = time
    }

    /// Advance time by the specified number of milliseconds.
    public func advance(by milliseconds: Int64) {
        lock.lock()
        defer { lock.unlock() }
        currentTime += milliseconds
    }

    /// Reset time to zero.
    public func reset() {
        lock.lock()
        defer { lock.unlock() }
        currentTime = 0
    }
}

// MARK: - Timer Protocol (for delays and scheduling)

/// Protocol for timer/delay operations. Uses injection for testability.
public protocol Timer {
    /// Get current time in milliseconds
    func now() -> Int64

    /// Wait for specified milliseconds (async)
    func wait(milliseconds: Int64) async

    /// Schedule a callback after specified milliseconds
    func schedule(after milliseconds: Int64, callback: @escaping @Sendable () -> Void)
}

/// Default implementation using real system time and delays.
public class SystemTimer: Timer, @unchecked Sendable {
    public init() {}

    public func now() -> Int64 {
        return Int64(Date().timeIntervalSince1970 * 1000)
    }

    public func wait(milliseconds: Int64) async {
        try? await Task.sleep(nanoseconds: UInt64(milliseconds) * 1_000_000)
    }

    public func schedule(after milliseconds: Int64, callback: @escaping @Sendable () -> Void) {
        DispatchQueue.main.asyncAfter(deadline: .now() + .milliseconds(Int(milliseconds))) {
            callback()
        }
    }
}

/// Fake implementation for testing with instant or controlled time.
public class FakeTimer: Timer, @unchecked Sendable {
    public enum Mode {
        case instant // All waits complete immediately
        case manual // Waits only complete when manually advanced
        case delayed(Int64) // Each wait takes a fixed duration
    }

    private let mode: Mode
    private var currentTime: Int64
    private let lock = NSLock()
    private var pendingCallbacks: [(time: Int64, callback: @Sendable () -> Void)] = []
    private var pendingWaiters: [CheckedContinuation<Void, Never>] = []

    public init(mode: Mode = .instant, initialTime: Int64 = 0) {
        self.mode = mode
        currentTime = initialTime
    }

    public func now() -> Int64 {
        lock.lock()
        defer { lock.unlock() }
        return currentTime
    }

    /// Helper to update time in a thread-safe manner (called from non-async contexts)
    private func incrementTime(by milliseconds: Int64) {
        lock.lock()
        currentTime += milliseconds
        lock.unlock()
    }

    /// Helper to add a waiter (called from withCheckedContinuation)
    private func addWaiter(_ continuation: CheckedContinuation<Void, Never>) {
        lock.lock()
        pendingWaiters.append(continuation)
        lock.unlock()
    }

    public func wait(milliseconds: Int64) async {
        switch mode {
        case .instant:
            incrementTime(by: milliseconds)
            return

        case .manual:
            await withCheckedContinuation { continuation in
                self.addWaiter(continuation)
            }

        case let .delayed(delay):
            try? await Task.sleep(nanoseconds: UInt64(delay) * 1_000_000)
            incrementTime(by: milliseconds)
        }
    }

    public func schedule(after milliseconds: Int64, callback: @escaping @Sendable () -> Void) {
        lock.lock()
        let targetTime = currentTime + milliseconds
        pendingCallbacks.append((time: targetTime, callback: callback))
        lock.unlock()

        if case .instant = mode {
            advance(by: milliseconds)
        }
    }

    /// Advance time by the specified number of milliseconds.
    /// Triggers any scheduled callbacks that should fire.
    public func advance(by milliseconds: Int64) {
        lock.lock()
        currentTime += milliseconds

        // Find and execute callbacks that should fire
        let toExecute = pendingCallbacks.filter { $0.time <= currentTime }
        pendingCallbacks.removeAll { $0.time <= currentTime }

        // Resume any pending waiters
        let waiters = pendingWaiters
        pendingWaiters.removeAll()
        lock.unlock()

        for item in toExecute.sorted(by: { $0.time < $1.time }) {
            item.callback()
        }

        for waiter in waiters {
            waiter.resume()
        }
    }

    /// Set the current time to a specific value.
    public func setTime(_ time: Int64) {
        lock.lock()
        currentTime = time
        lock.unlock()
    }

    /// Reset time to zero and clear pending callbacks.
    public func reset() {
        lock.lock()
        currentTime = 0
        pendingCallbacks.removeAll()
        let waiters = pendingWaiters
        pendingWaiters.removeAll()
        lock.unlock()

        for waiter in waiters {
            waiter.resume()
        }
    }

    /// Get count of pending scheduled callbacks.
    public var pendingCallbackCount: Int {
        lock.lock()
        defer { lock.unlock() }
        return pendingCallbacks.count
    }

    /// Get count of pending waiters.
    public var pendingWaiterCount: Int {
        lock.lock()
        defer { lock.unlock() }
        return pendingWaiters.count
    }
}

// MARK: - Mutable Perf Entry

/// Internal mutable timing entry for building up timing data.
class MutablePerfEntry {
    let name: String
    let startTime: Int64
    var endTime: Int64?
    var children: [MutablePerfEntry] = []
    let isParallel: Bool

    init(name: String, startTime: Int64, isParallel: Bool = false) {
        self.name = name
        self.startTime = startTime
        self.isParallel = isParallel
    }

    func toTiming(timeProvider: TimeProvider) -> PerfTiming {
        let duration = (endTime ?? timeProvider.currentTimeMillis()) - startTime
        let childTimings: [PerfTiming]? = children.isEmpty ? nil : children
            .map { $0.toTiming(timeProvider: timeProvider) }
        return PerfTiming(name: name, durationMs: duration, children: childTimings)
    }
}

// MARK: - PerfProvider

/// Thread-safe provider for accumulating performance timing data.
///
/// Usage:
/// ```swift
/// let perf = PerfProvider.instance
///
/// // Track an operation
/// let result = perf.track("operationName") {
///     // do work
///     return someValue
/// }
///
/// // Or manually track
/// perf.startOperation("operationName")
/// // do work
/// perf.endOperation("operationName")
///
/// // When sending a WebSocket message, flush all timing data
/// let timings = perf.flush()
/// ```
public class PerfProvider {
    // MARK: - Singleton

    // Using nonisolated(unsafe) because thread safety is managed manually via instanceLock
    private nonisolated(unsafe) static var _instance: PerfProvider?
    private static let instanceLock = NSLock()

    public static var instance: PerfProvider {
        instanceLock.lock()
        defer { instanceLock.unlock() }

        if _instance == nil {
            _instance = PerfProvider()
        }
        return _instance!
    }

    /// For testing - allows injecting a custom TimeProvider.
    public static func createForTesting(timeProvider: TimeProvider) -> PerfProvider {
        return PerfProvider(timeProvider: timeProvider)
    }

    /// Reset the singleton instance (for testing).
    public static func resetInstance() {
        instanceLock.lock()
        defer { instanceLock.unlock() }
        _instance = nil
    }

    // MARK: - Properties

    private let timeProvider: TimeProvider
    private let lock = NSLock()

    /// Stack of active timing entries (for nested operations)
    private var entryStack: [MutablePerfEntry] = []

    /// Root entries that have been completed
    private var completedEntries: [MutablePerfEntry] = []

    /// Current active root entry
    private var currentRoot: MutablePerfEntry?

    // Debounce tracking
    private var debounceCount = 0
    private var lastDebounceTime: Int64?

    // MARK: - Init

    private init(timeProvider: TimeProvider = SystemTimeProvider()) {
        self.timeProvider = timeProvider
    }

    // MARK: - Serial/Parallel Blocks

    /// Start a serial block (operations run sequentially).
    public func serial(_ name: String) {
        lock.lock()
        defer { lock.unlock() }

        let now = timeProvider.currentTimeMillis()
        let entry = MutablePerfEntry(name: name, startTime: now, isParallel: false)

        if let parent = entryStack.last {
            parent.children.append(entry)
        } else {
            currentRoot = entry
        }
        entryStack.append(entry)

        #if DEBUG
            print("[PerfProvider] Started serial block: \(name)")
        #endif
    }

    /// Start a new independent root block, ending any currently open blocks first.
    /// Use this for operations that may run concurrently and should be tracked as
    /// parallel/sibling entries rather than nested within each other.
    public func independentRoot(_ name: String) {
        lock.lock()
        defer { lock.unlock() }

        // End all open entries - they become completed entries (parallel siblings)
        while !entryStack.isEmpty {
            endInternal()
        }

        // Start fresh root
        let now = timeProvider.currentTimeMillis()
        let entry = MutablePerfEntry(name: name, startTime: now, isParallel: false)
        currentRoot = entry
        entryStack.append(entry)

        #if DEBUG
            print("[PerfProvider] Started independent root: \(name)")
        #endif
    }

    /// Start a parallel block (operations run concurrently).
    public func parallel(_ name: String) {
        lock.lock()
        defer { lock.unlock() }

        let now = timeProvider.currentTimeMillis()
        let entry = MutablePerfEntry(name: name, startTime: now, isParallel: true)

        if let parent = entryStack.last {
            parent.children.append(entry)
        } else {
            currentRoot = entry
        }
        entryStack.append(entry)

        #if DEBUG
            print("[PerfProvider] Started parallel block: \(name)")
        #endif
    }

    /// End the current block.
    public func end() {
        lock.lock()
        defer { lock.unlock() }
        endInternal()
    }

    /// Internal end without locking (called by other locked methods).
    private func endInternal() {
        let now = timeProvider.currentTimeMillis()

        guard let entry = entryStack.popLast() else {
            #if DEBUG
                print("[PerfProvider] end() called with no active block")
            #endif
            return
        }

        entry.endTime = now

        #if DEBUG
            print("[PerfProvider] Ended block: \(entry.name) (\(now - entry.startTime)ms)")
        #endif

        // If this was the root entry, move it to completed
        if entryStack.isEmpty, currentRoot === entry {
            completedEntries.append(entry)
            currentRoot = nil
        }
    }

    // MARK: - Track Operations

    /// Track an operation with automatic start/end timing. Returns the result of the block.
    @discardableResult
    public func track<T>(_ name: String, block: () throws -> T) rethrows -> T {
        startOperation(name)
        defer { endOperation(name) }
        return try block()
    }

    /// Track an async operation with automatic start/end timing.
    @discardableResult
    public func trackAsync<T>(_ name: String, block: () async throws -> T) async rethrows -> T {
        startOperation(name)
        defer { endOperation(name) }
        return try await block()
    }

    /// Start tracking an operation manually.
    public func startOperation(_ name: String) {
        lock.lock()
        defer { lock.unlock() }

        let now = timeProvider.currentTimeMillis()
        let entry = MutablePerfEntry(name: name, startTime: now)

        if let parent = entryStack.last {
            parent.children.append(entry)
            entryStack.append(entry)
        } else {
            // No active block, this becomes a root entry
            currentRoot = entry
            entryStack.append(entry)
        }

        #if DEBUG
            print("[PerfProvider] Started operation: \(name)")
        #endif
    }

    /// End tracking an operation manually.
    public func endOperation(_ name: String) {
        lock.lock()
        defer { lock.unlock() }

        let now = timeProvider.currentTimeMillis()

        // Find the matching entry in the stack
        guard let entry = entryStack.last, entry.name == name else {
            #if DEBUG
                print(
                    "[PerfProvider] endOperation(\(name)) called but current entry is \(entryStack.last?.name ?? "nil")"
                )
            #endif
            return
        }

        entry.endTime = now
        _ = entryStack.popLast()

        #if DEBUG
            print("[PerfProvider] Ended operation: \(name) (\(now - entry.startTime)ms)")
        #endif

        // If this was the root entry, move it to completed
        if entryStack.isEmpty, currentRoot === entry {
            completedEntries.append(entry)
            currentRoot = nil
        }
    }

    // MARK: - Debounce Tracking

    /// Record a debounce event (when hierarchy updates are debounced).
    public func recordDebounce() {
        lock.lock()
        defer { lock.unlock() }

        debounceCount += 1
        lastDebounceTime = timeProvider.currentTimeMillis()

        #if DEBUG
            print("[PerfProvider] Debounce recorded (total: \(debounceCount))")
        #endif
    }

    // MARK: - Flush and Query

    /// Flush all accumulated timing data and reset.
    /// Returns the timing data as an array for inclusion in WebSocket messages.
    public func flush() -> [PerfTiming]? {
        lock.lock()
        defer { lock.unlock() }

        // End any incomplete entries
        while !entryStack.isEmpty {
            endInternal()
        }

        // Collect all completed entries
        var entries: [PerfTiming] = []
        for entry in completedEntries {
            entries.append(entry.toTiming(timeProvider: timeProvider))
        }
        completedEntries.removeAll()

        // Include debounce info if any
        if debounceCount > 0 {
            let debounceInfo = PerfTiming(
                name: "debounce",
                durationMs: 0,
                children: [
                    PerfTiming.timing("count", durationMs: Int64(debounceCount)),
                    PerfTiming.timing("lastTime", durationMs: lastDebounceTime ?? 0),
                ]
            )
            entries.append(debounceInfo)
            debounceCount = 0
            lastDebounceTime = nil
        }

        return entries.isEmpty ? nil : entries
    }

    /// Get current timing data without clearing (for debugging).
    public func peek() -> [PerfTiming] {
        lock.lock()
        defer { lock.unlock() }

        var entries: [PerfTiming] = []

        // Include current root if any
        if let root = currentRoot {
            entries.append(root.toTiming(timeProvider: timeProvider))
        }

        // Include completed entries
        for entry in completedEntries {
            entries.append(entry.toTiming(timeProvider: timeProvider))
        }

        return entries
    }

    /// Check if there's any accumulated timing data.
    public var hasData: Bool {
        lock.lock()
        defer { lock.unlock() }
        return !completedEntries.isEmpty || currentRoot != nil || debounceCount > 0
    }

    /// Clear all timing data without returning it.
    public func clear() {
        lock.lock()
        defer { lock.unlock() }

        entryStack.removeAll()
        completedEntries.removeAll()
        currentRoot = nil
        debounceCount = 0
        lastDebounceTime = nil
    }
}
