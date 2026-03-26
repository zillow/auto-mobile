import Foundation

/// Main entry point for the AutoMobile iOS SDK.
/// Provides navigation event tracking, log filtering, network monitoring,
/// crash detection, and more.
public final class AutoMobileSDK: @unchecked Sendable {
    public static let shared = AutoMobileSDK()

    private let lock = NSLock()
    private var listeners: [NavigationListener] = []
    private var _isEnabled = true
    private var _isInitialized = false
    private var _bundleId: String?
    private var eventBuffer: SdkEventBuffer?

    private init() {}

    // MARK: - Initialization

    /// Initialize the SDK with all subsystems.
    /// Call this early in your app lifecycle (e.g., in your App init or AppDelegate).
    public func initialize(bundleId: String? = nil) {
        lock.lock()
        guard !_isInitialized else {
            lock.unlock()
            return
        }
        _isInitialized = true

        let resolvedBundleId = bundleId ?? Bundle.main.bundleIdentifier
        _bundleId = resolvedBundleId

        let buffer = SdkEventBuffer { [weak self] events in
            let bundleId = self?.bundleId
            SdkEventBroadcaster.shared.broadcastBatch(bundleId: bundleId, events: events)
        }
        self.eventBuffer = buffer
        lock.unlock()

        buffer.start()

        // Initialize subsystems
        AutoMobileLog.shared.initialize(bundleId: resolvedBundleId, buffer: buffer)
        AutoMobileNetwork.shared.initialize(bundleId: resolvedBundleId, buffer: buffer)
        AutoMobileFailures.shared.initialize(bundleId: resolvedBundleId, buffer: buffer)
        AutoMobileCrashes.shared.initialize(bundleId: resolvedBundleId, buffer: buffer)
        AutoMobileHangs.shared.initialize(bundleId: resolvedBundleId, buffer: buffer)
        AutoMobileHangs.shared.startMonitoring()
        AutoMobileOsEvents.shared.initialize(bundleId: resolvedBundleId, buffer: buffer)
        AutoMobileNotificationObserver.shared.initialize(bundleId: resolvedBundleId, buffer: buffer)
        AutoMobileInteractionTracker.shared.initialize(bundleId: resolvedBundleId, buffer: buffer)
        ViewBodyTracker.shared.initialize(buffer: buffer)
        UserDefaultsInspector.shared.initialize(buffer: buffer)
        DatabaseInspector.shared.initialize()

        // Start navigation adapter
        SwiftUINavigationAdapter.shared.start()
    }

    // MARK: - Navigation Listeners

    /// Register a navigation event listener.
    public func addNavigationListener(_ listener: NavigationListener) {
        lock.lock()
        defer { lock.unlock() }
        listeners.append(listener)
    }

    /// Convenience: register a closure-based listener.
    @discardableResult
    public func addNavigationListener(_ block: @escaping @Sendable (NavigationEvent) -> Void) -> NavigationListener {
        let listener = BlockNavigationListener(block)
        addNavigationListener(listener)
        return listener
    }

    /// Remove a navigation event listener.
    public func removeNavigationListener(_ listener: NavigationListener) {
        lock.lock()
        defer { lock.unlock() }
        listeners.removeAll { $0 === listener }
    }

    /// Remove all navigation listeners.
    public func clearNavigationListeners() {
        lock.lock()
        defer { lock.unlock() }
        listeners.removeAll()
    }

    /// Notify all registered listeners of a navigation event.
    public func notifyNavigationEvent(_ event: NavigationEvent) {
        guard isEnabled else { return }

        lock.lock()
        let currentListeners = listeners
        lock.unlock()

        for listener in currentListeners {
            listener.onNavigationEvent(event)
        }

        // Buffer as SDK event
        let sdkEvent = SdkNavigationEvent(
            timestamp: event.timestamp,
            destination: event.destination,
            source: NavigationSourceType(rawValue: event.source.rawValue) ?? .custom,
            arguments: event.arguments,
            metadata: event.metadata
        )
        eventBuffer?.add(sdkEvent)
    }

    /// Number of registered listeners.
    public var listenerCount: Int {
        lock.lock()
        defer { lock.unlock() }
        return listeners.count
    }

    // MARK: - Custom Events

    /// Track a custom event with optional properties.
    public func trackEvent(name: String, properties: [String: String] = [:]) {
        guard isEnabled else { return }
        let event = SdkCustomEvent(name: name, properties: properties)
        eventBuffer?.add(event)
    }

    // MARK: - Enable/Disable

    /// Whether the SDK is enabled for tracking.
    public var isEnabled: Bool {
        lock.lock()
        defer { lock.unlock() }
        return _isEnabled
    }

    /// Enable or disable the SDK.
    public func setEnabled(_ enabled: Bool) {
        lock.lock()
        _isEnabled = enabled
        lock.unlock()
    }

    /// Whether the SDK has been initialized.
    public var isInitialized: Bool {
        lock.lock()
        defer { lock.unlock() }
        return _isInitialized
    }

    /// The app's bundle ID.
    public var bundleId: String? {
        lock.lock()
        defer { lock.unlock() }
        return _bundleId
    }

    /// The event buffer (for subsystems that need direct access).
    public func getEventBuffer() -> SdkEventBuffer? {
        lock.lock()
        defer { lock.unlock() }
        return eventBuffer
    }

    // MARK: - Testing Support

    /// Reset the SDK for testing. Not for production use.
    internal func reset() {
        // Reset all subsystems in reverse initialization order
        SwiftUINavigationAdapter.shared.stop()
        AutoMobileCrashes.shared.reset()
        AutoMobileHangs.shared.reset()
        AutoMobileOsEvents.shared.reset()
        AutoMobileNotificationObserver.shared.reset()
        AutoMobileInteractionTracker.shared.reset()
        ViewBodyTracker.shared.reset()
        UserDefaultsInspector.shared.reset()
        DatabaseInspector.shared.reset()
        AutoMobileNetwork.shared.reset()
        AutoMobileFailures.shared.reset()
        AutoMobileBiometrics.shared.reset()
        AutoMobileLog.shared.reset()

        // Extract buffer under lock, then shut it down OUTSIDE the lock
        // to prevent deadlock: shutdown() -> onFlush -> bundleId -> lock
        lock.lock()
        let bufferToShutdown = eventBuffer
        eventBuffer = nil
        listeners.removeAll()
        _isEnabled = true
        _isInitialized = false
        _bundleId = nil
        lock.unlock()

        bufferToShutdown?.shutdown()
    }
}
