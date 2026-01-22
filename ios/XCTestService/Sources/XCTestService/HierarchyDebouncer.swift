import Foundation

/// Result of hierarchy extraction with hash comparison.
public enum HierarchyResult {
    /// New hierarchy extracted with different structural content.
    case changed(hierarchy: ViewHierarchy, hash: Int, extractionTimeMs: Int64)

    /// Hierarchy extracted but structure unchanged (animation only).
    case unchanged(hierarchy: ViewHierarchy, hash: Int, extractionTimeMs: Int64, skippedPollCount: Int)

    /// Failed to extract hierarchy.
    case error(message: String)
}

/// Protocol for hierarchy debouncing
public protocol HierarchyDebouncing {
    /// Start polling for changes
    func start()

    /// Stop polling for changes
    func stop()

    /// Whether the debouncer is currently running
    var isRunning: Bool { get }

    /// Perform an immediate extraction (bypasses debounce and animation mode)
    func extractNow()

    /// Perform an immediate extraction and wait for it to complete (blocking)
    func extractNowBlocking(skipFlowEmit: Bool) -> ViewHierarchy?

    /// Set callback for hierarchy results
    func setOnResult(_ callback: @escaping (HierarchyResult) -> Void)

    /// Get the last extracted hierarchy without triggering a new extraction
    func getLastHierarchy() -> ViewHierarchy?

    /// Reset all state
    func reset()
}

/// Smart debouncer for view hierarchy extraction on iOS.
///
/// Uses structural hash comparison to detect when content actually changes vs. when only
/// bounds are changing during animations.
///
/// Key optimization: During animations, many UI updates fire but only bounds change.
/// By comparing structural hashes, we can:
/// - Detect animation mode: Same hash = skip broadcasting, continue polling
/// - Detect real changes: Different hash = content changed, broadcast
///
/// This reduces noise during animations while still detecting real changes quickly.
public class HierarchyDebouncer: HierarchyDebouncing {
    // MARK: - Configuration

    /// How often to poll for changes (default 10ms for quick detection)
    public static let defaultPollIntervalMs: Int64 = 10

    /// How long to skip broadcasts after detecting animation (default 100ms)
    public static let animationSkipWindowMs: Int64 = 100

    /// Minimum interval between broadcasts (debounce)
    public static let broadcastDebounceMs: Int64 = 50

    // MARK: - Dependencies

    private let elementLocator: ElementLocating
    private let timer: Timer
    private let pollIntervalMs: Int64

    // MARK: - State

    private var lastStructuralHash = 0
    private var inAnimationMode = false
    private var animationModeEndTime: Int64 = 0
    private var skippedPollCount = 0
    private var lastBroadcastTime: Int64 = 0
    private var lastHierarchy: ViewHierarchy?

    private let lock = NSLock()
    private var _isRunning = false
    private var pollScheduled = false
    private var onResult: ((HierarchyResult) -> Void)?

    public var isRunning: Bool {
        lock.lock()
        defer { lock.unlock() }
        return _isRunning
    }

    // MARK: - Init

    public init(
        elementLocator: ElementLocating,
        timer: Timer = SystemTimer(),
        pollIntervalMs: Int64 = HierarchyDebouncer.defaultPollIntervalMs
    ) {
        self.elementLocator = elementLocator
        self.timer = timer
        self.pollIntervalMs = pollIntervalMs
    }

    // MARK: - Public Interface

    public func setOnResult(_ callback: @escaping (HierarchyResult) -> Void) {
        lock.lock()
        defer { lock.unlock() }
        onResult = callback
    }

    public func start() {
        lock.lock()
        guard !_isRunning else {
            lock.unlock()
            return
        }
        _isRunning = true
        lock.unlock()

        // Capture initial state
        captureInitialState()

        // Schedule first poll
        scheduleNextPoll()

        print("[HierarchyDebouncer] Started with \(pollIntervalMs)ms polling interval")
    }

    public func stop() {
        lock.lock()
        _isRunning = false
        pollScheduled = false
        lock.unlock()

        print("[HierarchyDebouncer] Stopped")
    }

    public func extractNow() {
        lock.lock()
        inAnimationMode = false
        lock.unlock()

        extractAndCompare(skipBroadcast: false)
    }

    public func extractNowBlocking(skipFlowEmit: Bool = false) -> ViewHierarchy? {
        lock.lock()
        inAnimationMode = false
        lock.unlock()

        extractAndCompare(skipBroadcast: skipFlowEmit)

        lock.lock()
        let hierarchy = lastHierarchy
        lock.unlock()
        return hierarchy
    }

    public func getLastHierarchy() -> ViewHierarchy? {
        lock.lock()
        defer { lock.unlock() }
        return lastHierarchy
    }

    public func reset() {
        lock.lock()
        lastStructuralHash = 0
        inAnimationMode = false
        animationModeEndTime = 0
        skippedPollCount = 0
        lastBroadcastTime = 0
        lastHierarchy = nil
        lock.unlock()
    }

    // MARK: - Private

    private func scheduleNextPoll() {
        lock.lock()
        guard _isRunning, !pollScheduled else {
            lock.unlock()
            return
        }
        pollScheduled = true
        lock.unlock()

        timer.schedule(after: pollIntervalMs) { [weak self] in
            guard let self = self else { return }

            self.lock.lock()
            self.pollScheduled = false
            let shouldContinue = self._isRunning
            self.lock.unlock()

            if shouldContinue {
                self.pollAndCheck()
                self.scheduleNextPoll()
            }
        }
    }

    private func captureInitialState() {
        do {
            let hierarchy = try elementLocator.getViewHierarchy(disableAllFiltering: false)
            let hash = StructuralHasher.computeHash(hierarchy)

            lock.lock()
            lastStructuralHash = hash
            lastHierarchy = hierarchy
            lock.unlock()

            print("[HierarchyDebouncer] Initial state captured (hash=\(hash))")
        } catch {
            print("[HierarchyDebouncer] Failed to capture initial state: \(error)")
        }
    }

    private func pollAndCheck() {
        let now = timer.now()

        lock.lock()
        let running = _isRunning
        let animationMode = inAnimationMode
        let animationEnd = animationModeEndTime
        lock.unlock()

        guard running else { return }

        // If we're in animation mode and within the skip window, skip extraction
        if animationMode, now < animationEnd {
            lock.lock()
            skippedPollCount += 1
            lock.unlock()
            return
        }

        // Exit animation mode if window expired
        if animationMode, now >= animationEnd {
            lock.lock()
            let skipped = skippedPollCount
            inAnimationMode = false
            lock.unlock()
            print("[HierarchyDebouncer] Exiting animation mode after skipping \(skipped) polls")
        }

        extractAndCompare(skipBroadcast: false)
    }

    private func extractAndCompare(skipBroadcast: Bool) {
        let startTime = timer.now()

        do {
            let hierarchy = try elementLocator.getViewHierarchy(disableAllFiltering: false)
            let extractionTime = timer.now() - startTime
            let newHash = StructuralHasher.computeHash(hierarchy)

            lock.lock()
            let oldHash = lastStructuralHash
            let callback = onResult
            let lastBroadcast = lastBroadcastTime
            lock.unlock()

            if newHash == oldHash {
                // Structure unchanged - likely animation
                lock.lock()
                inAnimationMode = true
                animationModeEndTime = timer.now() + HierarchyDebouncer.animationSkipWindowMs
                lastHierarchy = hierarchy
                lock.unlock()

                // Don't broadcast unchanged results to reduce noise
                // Structure unchanged = animation mode, just reset counter
                lock.lock()
                skippedPollCount = 0
                lock.unlock()

            } else {
                // Structure changed - this is a real content change
                let now = timer.now()

                lock.lock()
                inAnimationMode = false
                lastStructuralHash = newHash
                lastHierarchy = hierarchy
                skippedPollCount = 0
                lock.unlock()

                // Debounce broadcasts
                let timeSinceLastBroadcast = now - lastBroadcast
                let shouldBroadcast = !skipBroadcast && timeSinceLastBroadcast >= HierarchyDebouncer.broadcastDebounceMs

                if shouldBroadcast {
                    lock.lock()
                    lastBroadcastTime = now
                    lock.unlock()

                    let result = HierarchyResult.changed(
                        hierarchy: hierarchy,
                        hash: newHash,
                        extractionTimeMs: extractionTime
                    )

                    print(
                        "[HierarchyDebouncer] Structure changed (oldHash=\(oldHash), newHash=\(newHash)), broadcasting"
                    )
                    callback?(result)
                }
            }
        } catch {
            // Silently ignore errors during polling
            // This can happen if the app is transitioning between states
        }
    }
}

// MARK: - Structural Hasher

/// Computes a structural hash of a ViewHierarchy for change detection.
/// Ignores bounds to focus on content changes vs. animation changes.
public enum StructuralHasher {
    /// Compute a structural hash of the hierarchy.
    /// Ignores bounds to differentiate content changes from animation/scroll changes.
    public static func computeHash(_ hierarchy: ViewHierarchy) -> Int {
        var hasher = Hasher()

        // Include package name
        if let packageName = hierarchy.packageName {
            hasher.combine(packageName)
        }

        // Include hierarchy structure (but not bounds)
        if let root = hierarchy.hierarchy {
            hashElement(root, into: &hasher, depth: 0, maxDepth: 15)
        }

        return hasher.finalize()
    }

    private static func hashElement(_ element: UIElementInfo, into hasher: inout Hasher, depth: Int, maxDepth: Int) {
        // Hash key identifying properties (NOT bounds - those change during animations)
        if let text = element.text {
            hasher.combine(text)
        }
        if let resourceId = element.resourceId {
            hasher.combine(resourceId)
        }
        if let className = element.className {
            hasher.combine(className)
        }

        // Hash state properties
        hasher.combine(element.focused)
        hasher.combine(element.selected)
        hasher.combine(element.checked)
        hasher.combine(element.enabled)

        // Hash children recursively (up to maxDepth)
        if depth < maxDepth, let children = element.node {
            hasher.combine(children.count)
            for child in children {
                hashElement(child, into: &hasher, depth: depth + 1, maxDepth: maxDepth)
            }
        }
    }
}

// MARK: - Fake for Testing

/// Fake implementation for testing hierarchy debouncing
public class FakeHierarchyDebouncer: HierarchyDebouncing {
    // Call tracking
    public private(set) var startCallCount = 0
    public private(set) var stopCallCount = 0
    public private(set) var extractNowCallCount = 0
    public private(set) var extractNowBlockingCallCount = 0
    public private(set) var setOnResultCallCount = 0
    public private(set) var resetCallCount = 0

    // State
    private var _isRunning = false
    private var onResult: ((HierarchyResult) -> Void)?
    private var lastHierarchy: ViewHierarchy?
    private let lock = NSLock()

    /// Configure what hierarchy to return from extractNowBlocking
    public var hierarchyToReturn: ViewHierarchy?

    public var isRunning: Bool {
        lock.lock()
        defer { lock.unlock() }
        return _isRunning
    }

    public init() {}

    public func start() {
        lock.lock()
        startCallCount += 1
        _isRunning = true
        lock.unlock()
    }

    public func stop() {
        lock.lock()
        stopCallCount += 1
        _isRunning = false
        lock.unlock()
    }

    public func extractNow() {
        lock.lock()
        extractNowCallCount += 1
        lock.unlock()
    }

    public func extractNowBlocking(skipFlowEmit _: Bool = false) -> ViewHierarchy? {
        lock.lock()
        extractNowBlockingCallCount += 1
        let hierarchy = hierarchyToReturn
        lastHierarchy = hierarchy
        lock.unlock()
        return hierarchy
    }

    public func setOnResult(_ callback: @escaping (HierarchyResult) -> Void) {
        lock.lock()
        setOnResultCallCount += 1
        onResult = callback
        lock.unlock()
    }

    public func getLastHierarchy() -> ViewHierarchy? {
        lock.lock()
        defer { lock.unlock() }
        return lastHierarchy
    }

    public func reset() {
        lock.lock()
        resetCallCount += 1
        lastHierarchy = nil
        lock.unlock()
    }

    /// Simulate a hierarchy change for testing
    public func simulateChange(_ result: HierarchyResult) {
        lock.lock()
        let callback = onResult
        if case let .changed(hierarchy, _, _) = result {
            lastHierarchy = hierarchy
        } else if case let .unchanged(hierarchy, _, _, _) = result {
            lastHierarchy = hierarchy
        }
        lock.unlock()
        callback?(result)
    }

    /// Reset all call counts for fresh test assertions
    public func resetCounts() {
        lock.lock()
        startCallCount = 0
        stopCallCount = 0
        extractNowCallCount = 0
        extractNowBlockingCallCount = 0
        setOnResultCallCount = 0
        resetCallCount = 0
        lock.unlock()
    }
}
