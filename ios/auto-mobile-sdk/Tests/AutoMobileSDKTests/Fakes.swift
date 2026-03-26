import Foundation
@testable import AutoMobileSDK

// MARK: - FakeTimer

final class FakeTimer: TimerScheduling, @unchecked Sendable {
    private let lock = NSLock()
    private var _block: (@Sendable () -> Void)?
    private var _intervalMs: Int = 0
    private var _cancelled = false

    var intervalMs: Int {
        lock.lock()
        defer { lock.unlock() }
        return _intervalMs
    }

    var isCancelled: Bool {
        lock.lock()
        defer { lock.unlock() }
        return _cancelled
    }

    func schedule(intervalMs: Int, block: @escaping @Sendable () -> Void) {
        lock.lock()
        _intervalMs = intervalMs
        _block = block
        _cancelled = false
        lock.unlock()
    }

    func cancel() {
        lock.lock()
        _cancelled = true
        _block = nil
        lock.unlock()
    }

    /// Fire the timer manually for testing.
    func fire() {
        lock.lock()
        let block = _block
        lock.unlock()
        block?()
    }
}

// MARK: - FakeEventBuffer

final class FakeEventBuffer: EventBuffering, @unchecked Sendable {
    private let lock = NSLock()
    private var _events: [any SdkEvent] = []
    private var _started = false
    private var _shutdown = false
    private var _flushed = false

    var events: [any SdkEvent] {
        lock.lock()
        defer { lock.unlock() }
        return _events
    }

    var isStarted: Bool {
        lock.lock()
        defer { lock.unlock() }
        return _started
    }

    var isShutdown: Bool {
        lock.lock()
        defer { lock.unlock() }
        return _shutdown
    }

    var wasFlushed: Bool {
        lock.lock()
        defer { lock.unlock() }
        return _flushed
    }

    func add(_ event: any SdkEvent) {
        lock.lock()
        _events.append(event)
        lock.unlock()
    }

    func start() {
        lock.lock()
        _started = true
        lock.unlock()
    }

    func shutdown() {
        lock.lock()
        _shutdown = true
        lock.unlock()
    }

    func flush() {
        lock.lock()
        _flushed = true
        lock.unlock()
    }
}

// MARK: - FakeNavigationListener

final class FakeNavigationListener: NavigationListener, @unchecked Sendable {
    private let lock = NSLock()
    private var _events: [NavigationEvent] = []

    var events: [NavigationEvent] {
        lock.lock()
        defer { lock.unlock() }
        return _events
    }

    func onNavigationEvent(_ event: NavigationEvent) {
        lock.lock()
        _events.append(event)
        lock.unlock()
    }
}

// MARK: - FakeUserDefaultsDriver

final class FakeUserDefaultsDriver: UserDefaultsDriver, @unchecked Sendable {
    private let lock = NSLock()
    private var storage: [String: [String: (value: String?, type: KeyValueType)]] = [:]

    func getSuites() -> [UserDefaultsSuiteDescriptor] {
        lock.lock()
        defer { lock.unlock() }
        return storage.map { key, values in
            UserDefaultsSuiteDescriptor(name: key, displayName: key, entryCount: values.count)
        }
    }

    func getValues(suiteName: String?) -> [KeyValuePair] {
        lock.lock()
        defer { lock.unlock() }
        let key = suiteName ?? "standard"
        return (storage[key] ?? [:]).map { k, v in
            KeyValuePair(key: k, value: v.value, type: v.type)
        }.sorted { $0.key < $1.key }
    }

    func getValue(suiteName: String?, key: String) -> KeyValuePair? {
        lock.lock()
        defer { lock.unlock() }
        let suiteKey = suiteName ?? "standard"
        guard let entry = storage[suiteKey]?[key] else { return nil }
        return KeyValuePair(key: key, value: entry.value, type: entry.type)
    }

    func setValue(suiteName: String?, key: String, value: Any?, type: KeyValueType) {
        lock.lock()
        defer { lock.unlock() }
        let suiteKey = suiteName ?? "standard"
        if storage[suiteKey] == nil {
            storage[suiteKey] = [:]
        }
        storage[suiteKey]?[key] = (value: value.map { "\($0)" }, type: type)
    }

    func removeValue(suiteName: String?, key: String) {
        lock.lock()
        defer { lock.unlock() }
        let suiteKey = suiteName ?? "standard"
        storage[suiteKey]?.removeValue(forKey: key)
    }

    func clear(suiteName: String?) {
        lock.lock()
        defer { lock.unlock() }
        let suiteKey = suiteName ?? "standard"
        storage[suiteKey]?.removeAll()
    }
}

// MARK: - FakeDatabaseDriver

final class FakeDatabaseDriver: DatabaseDriver, @unchecked Sendable {
    var databases: [DatabaseDescriptor] = []
    var tables: [String: [String]] = [:]

    func getDatabases() -> [DatabaseDescriptor] { databases }
    func getTables(databasePath: String) -> [String] { tables[databasePath] ?? [] }

    func getTableData(databasePath: String, table: String, limit: Int, offset: Int) -> TableDataResult {
        TableDataResult(columns: [], rows: [], totalRows: 0)
    }

    func getTableStructure(databasePath: String, table: String) -> TableStructureResult {
        TableStructureResult(columns: [])
    }

    func executeSQL(databasePath: String, query: String) -> SQLExecutionResult {
        SQLExecutionResult(columns: nil, rows: nil, rowsAffected: 0)
    }
}

// MARK: - FakeEventBroadcaster

final class FakeEventBroadcaster: EventBroadcasting, @unchecked Sendable {
    private let lock = NSLock()
    private var _batches: [(bundleId: String?, events: [any SdkEvent])] = []

    var batches: [(bundleId: String?, events: [any SdkEvent])] {
        lock.lock()
        defer { lock.unlock() }
        return _batches
    }

    func broadcastBatch(bundleId: String?, events: [any SdkEvent]) {
        lock.lock()
        _batches.append((bundleId: bundleId, events: events))
        lock.unlock()
    }
}
