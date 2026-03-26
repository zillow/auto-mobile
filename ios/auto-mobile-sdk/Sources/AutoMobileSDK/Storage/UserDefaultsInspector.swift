import Foundation

/// Debug-time UserDefaults inspection.
/// iOS equivalent of Android's SharedPreferencesInspector.
public final class UserDefaultsInspector: @unchecked Sendable {
    public static let shared = UserDefaultsInspector()

    private let lock = NSLock()
    private var _isEnabled = false
    private var _driver: UserDefaultsDriver?

    private init() {}

    private var changeListeners: [UserDefaultsChangeListener] = []
    private weak var buffer: SdkEventBuffer?
    private var sequenceCounter: Int64 = 0
    private var kvoObserver: NSObjectProtocol?

    func initialize(buffer: SdkEventBuffer? = nil) {
        lock.lock()
        defer { lock.unlock() }
        _driver = DefaultUserDefaultsDriver()
        self.buffer = buffer
    }

    /// Whether inspection is enabled.
    public var isEnabled: Bool {
        lock.lock()
        defer { lock.unlock() }
        return _isEnabled
    }

    /// Enable or disable inspection.
    public func setEnabled(_ enabled: Bool) {
        lock.lock()
        _isEnabled = enabled
        lock.unlock()
    }

    /// Get the driver for direct access.
    public func getDriver() -> UserDefaultsDriver? {
        lock.lock()
        defer { lock.unlock() }
        guard _isEnabled else { return nil }
        return _driver
    }

    // MARK: - Change Listeners

    /// Register a listener for UserDefaults changes.
    public func addChangeListener(_ listener: UserDefaultsChangeListener) {
        lock.lock()
        changeListeners.append(listener)
        lock.unlock()
    }

    /// Remove a change listener.
    public func removeChangeListener(_ listener: UserDefaultsChangeListener) {
        lock.lock()
        changeListeners.removeAll { $0 === listener }
        lock.unlock()
    }

    /// Start listening for changes on a specific UserDefaults suite.
    /// Safe to call multiple times — previous observer is unregistered first.
    public func startListening(suiteName: String? = nil) {
        guard isEnabled else { return }

        // Remove any existing observer before registering a new one
        stopListening()

        let defaults = suiteName.map { UserDefaults(suiteName: $0) } ?? UserDefaults.standard
        guard let defaults = suiteName != nil ? defaults : UserDefaults.standard else { return }

        let observer = NotificationCenter.default.addObserver(
            forName: UserDefaults.didChangeNotification,
            object: defaults,
            queue: nil
        ) { [weak self] _ in
            self?.notifyChangeListeners(suiteName: suiteName, key: nil)
        }

        lock.lock()
        kvoObserver = observer
        lock.unlock()
    }

    /// Stop listening for changes.
    public func stopListening() {
        lock.lock()
        if let observer = kvoObserver {
            NotificationCenter.default.removeObserver(observer)
            kvoObserver = nil
        }
        lock.unlock()
    }

    private func notifyChangeListeners(suiteName: String?, key: String?) {
        guard AutoMobileSDK.shared.isEnabled, isEnabled else { return }

        lock.lock()
        sequenceCounter += 1
        let seq = sequenceCounter
        let currentListeners = changeListeners
        let currentBuffer = buffer
        lock.unlock()

        for listener in currentListeners {
            listener.onPreferenceChanged(suiteName: suiteName, key: key)
        }

        let event = SdkStorageChangedEvent(
            suiteName: suiteName,
            key: key,
            newValue: nil,
            valueType: "unknown",
            sequenceNumber: seq
        )
        currentBuffer?.add(event)
    }

    // MARK: - Testing Support

    internal func setDriver(_ driver: UserDefaultsDriver) {
        lock.lock()
        _driver = driver
        lock.unlock()
    }

    internal func reset() {
        stopListening()
        lock.lock()
        _isEnabled = false
        _driver = nil
        buffer = nil
        changeListeners.removeAll()
        sequenceCounter = 0
        lock.unlock()
    }
}

// MARK: - Change Listener Protocol

/// Listener for UserDefaults changes.
public protocol UserDefaultsChangeListener: AnyObject {
    func onPreferenceChanged(suiteName: String?, key: String?)
}

// MARK: - UserDefaultsDriver Protocol

/// Interface for UserDefaults operations, enabling test faking.
public protocol UserDefaultsDriver: Sendable {
    /// List available UserDefaults suites.
    func getSuites() -> [UserDefaultsSuiteDescriptor]

    /// Get all key-value pairs from a suite.
    func getValues(suiteName: String?) -> [KeyValuePair]

    /// Get a single value.
    func getValue(suiteName: String?, key: String) -> KeyValuePair?

    /// Set a value.
    func setValue(suiteName: String?, key: String, value: Any?, type: KeyValueType)

    /// Remove a value.
    func removeValue(suiteName: String?, key: String)

    /// Clear all values in a suite.
    func clear(suiteName: String?)
}

// MARK: - Data Types

public struct UserDefaultsSuiteDescriptor: Sendable {
    public let name: String?
    public let displayName: String
    public let entryCount: Int

    public init(name: String?, displayName: String, entryCount: Int) {
        self.name = name
        self.displayName = displayName
        self.entryCount = entryCount
    }
}

public struct KeyValuePair: Sendable {
    public let key: String
    public let value: String?
    public let type: KeyValueType

    public init(key: String, value: String?, type: KeyValueType) {
        self.key = key
        self.value = value
        self.type = type
    }
}

public enum KeyValueType: String, Sendable {
    case string
    case int
    case double
    case bool
    case data
    case date
    case array
    case dictionary
    case unknown
}

// MARK: - Default Implementation

final class DefaultUserDefaultsDriver: UserDefaultsDriver, @unchecked Sendable {
    /// Resolve the UserDefaults instance for a suite name.
    /// Returns nil for non-nil suite names that can't be created (e.g., unconfigured app groups).
    /// Returns .standard when suiteName is nil.
    private func resolveDefaults(suiteName: String?) -> UserDefaults? {
        if let name = suiteName {
            return UserDefaults(suiteName: name)
        }
        return .standard
    }

    func getSuites() -> [UserDefaultsSuiteDescriptor] {
        let standard = UserDefaults.standard.dictionaryRepresentation()
        return [
            UserDefaultsSuiteDescriptor(
                name: nil,
                displayName: "Standard",
                entryCount: standard.count
            ),
        ]
    }

    func getValues(suiteName: String?) -> [KeyValuePair] {
        guard let defaults = resolveDefaults(suiteName: suiteName) else { return [] }
        return defaults.dictionaryRepresentation().map { key, value in
            KeyValuePair(key: key, value: "\(value)", type: typeOf(value))
        }.sorted { $0.key < $1.key }
    }

    func getValue(suiteName: String?, key: String) -> KeyValuePair? {
        guard let defaults = resolveDefaults(suiteName: suiteName) else { return nil }
        guard let value = defaults.object(forKey: key) else { return nil }
        return KeyValuePair(key: key, value: "\(value)", type: typeOf(value))
    }

    func setValue(suiteName: String?, key: String, value: Any?, type: KeyValueType) {
        guard let defaults = resolveDefaults(suiteName: suiteName) else { return }
        defaults.set(value, forKey: key)
    }

    func removeValue(suiteName: String?, key: String) {
        guard let defaults = resolveDefaults(suiteName: suiteName) else { return }
        defaults.removeObject(forKey: key)
    }

    func clear(suiteName: String?) {
        guard let defaults = resolveDefaults(suiteName: suiteName) else { return }
        for key in defaults.dictionaryRepresentation().keys {
            defaults.removeObject(forKey: key)
        }
    }

    private func typeOf(_ value: Any) -> KeyValueType {
        switch value {
        case is String: return .string
        case is Int: return .int
        case is Double, is Float: return .double
        case is Bool: return .bool
        case is Data: return .data
        case is Date: return .date
        case is [Any]: return .array
        case is [String: Any]: return .dictionary
        default: return .unknown
        }
    }
}
