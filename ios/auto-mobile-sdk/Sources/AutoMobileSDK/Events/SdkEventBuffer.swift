import Foundation

/// Protocol for event buffering to allow faking in tests.
public protocol EventBuffering: AnyObject, Sendable {
    func add(_ event: any SdkEvent)
    func start()
    func shutdown()
    func flush()
}

/// Thread-safe event buffer that flushes on capacity or timer.
public final class SdkEventBuffer: EventBuffering, @unchecked Sendable {
    private let maxBufferSize: Int
    private let flushIntervalMs: Int
    private let onFlush: @Sendable ([any SdkEvent]) -> Void
    private let lock = NSLock()
    private var buffer: [any SdkEvent] = []
    private var timer: (any TimerScheduling)?
    private let timerFactory: () -> any TimerScheduling

    public init(
        maxBufferSize: Int = 50,
        flushIntervalMs: Int = 500,
        timerFactory: @escaping () -> any TimerScheduling = { GCDTimer() },
        onFlush: @escaping @Sendable ([any SdkEvent]) -> Void
    ) {
        self.maxBufferSize = maxBufferSize
        self.flushIntervalMs = flushIntervalMs
        self.timerFactory = timerFactory
        self.onFlush = onFlush
    }

    public func start() {
        lock.lock()
        defer { lock.unlock() }
        guard timer == nil else { return }
        let t = timerFactory()
        timer = t
        t.schedule(intervalMs: flushIntervalMs) { [weak self] in
            self?.flush()
        }
    }

    public func add(_ event: any SdkEvent) {
        var shouldFlush = false
        lock.lock()
        buffer.append(event)
        shouldFlush = buffer.count >= maxBufferSize
        lock.unlock()
        if shouldFlush {
            flush()
        }
    }

    public func flush() {
        lock.lock()
        guard !buffer.isEmpty else {
            lock.unlock()
            return
        }
        let events = buffer
        buffer.removeAll(keepingCapacity: true)
        lock.unlock()
        onFlush(events)
    }

    public func shutdown() {
        lock.lock()
        timer?.cancel()
        timer = nil
        let remaining = buffer
        buffer.removeAll()
        lock.unlock()
        if !remaining.isEmpty {
            onFlush(remaining)
        }
    }
}

// MARK: - Timer Abstraction

/// Protocol for timer scheduling to allow faking in tests.
public protocol TimerScheduling: AnyObject, Sendable {
    func schedule(intervalMs: Int, block: @escaping @Sendable () -> Void)
    func cancel()
}

/// GCD-based timer implementation.
public final class GCDTimer: TimerScheduling, @unchecked Sendable {
    private var source: DispatchSourceTimer?
    private let queue = DispatchQueue(label: "dev.jasonpearson.automobile.sdk.timer")

    public init() {}

    public func schedule(intervalMs: Int, block: @escaping @Sendable () -> Void) {
        let source = DispatchSource.makeTimerSource(queue: queue)
        source.schedule(
            deadline: .now() + .milliseconds(intervalMs),
            repeating: .milliseconds(intervalMs)
        )
        source.setEventHandler(handler: block)
        source.resume()
        self.source = source
    }

    public func cancel() {
        source?.cancel()
        source = nil
    }

    deinit {
        source?.cancel()
    }
}
