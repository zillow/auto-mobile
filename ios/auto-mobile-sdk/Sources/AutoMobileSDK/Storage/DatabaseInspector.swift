import Foundation

/// Debug-time SQLite database inspection.
/// iOS equivalent of Android's DatabaseInspector.
public final class DatabaseInspector: @unchecked Sendable {
    public static let shared = DatabaseInspector()

    private let lock = NSLock()
    private var _isEnabled = false
    private var _driver: DatabaseDriver?

    private init() {}

    func initialize() {
        lock.lock()
        defer { lock.unlock() }
        _driver = SQLiteDatabaseDriver()
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
    public func getDriver() -> DatabaseDriver? {
        lock.lock()
        defer { lock.unlock() }
        guard _isEnabled else { return nil }
        return _driver
    }

    // MARK: - Testing Support

    internal func setDriver(_ driver: DatabaseDriver) {
        lock.lock()
        _driver = driver
        lock.unlock()
    }

    internal func reset() {
        lock.lock()
        _isEnabled = false
        _driver = nil
        lock.unlock()
    }
}

// MARK: - DatabaseDriver Protocol

/// Interface for database operations, enabling test faking.
public protocol DatabaseDriver: Sendable {
    /// List available databases.
    func getDatabases() -> [DatabaseDescriptor]

    /// List tables in a database.
    func getTables(databasePath: String) -> [String]

    /// Get table data with pagination.
    func getTableData(databasePath: String, table: String, limit: Int, offset: Int) -> TableDataResult

    /// Get table structure (columns, types, etc.).
    func getTableStructure(databasePath: String, table: String) -> TableStructureResult

    /// Execute a raw SQL query.
    func executeSQL(databasePath: String, query: String) -> SQLExecutionResult
}

// MARK: - Data Types

public struct DatabaseDescriptor: Sendable {
    public let name: String
    public let path: String
    public let sizeBytes: Int64

    public init(name: String, path: String, sizeBytes: Int64) {
        self.name = name
        self.path = path
        self.sizeBytes = sizeBytes
    }
}

public struct TableDataResult: Sendable {
    public let columns: [String]
    public let rows: [[String?]]
    public let totalRows: Int

    public init(columns: [String], rows: [[String?]], totalRows: Int) {
        self.columns = columns
        self.rows = rows
        self.totalRows = totalRows
    }
}

public struct TableStructureResult: Sendable {
    public let columns: [ColumnInfo]

    public init(columns: [ColumnInfo]) {
        self.columns = columns
    }
}

public struct ColumnInfo: Sendable {
    public let name: String
    public let type: String
    public let isNullable: Bool
    public let isPrimaryKey: Bool
    public let defaultValue: String?

    public init(name: String, type: String, isNullable: Bool, isPrimaryKey: Bool, defaultValue: String?) {
        self.name = name
        self.type = type
        self.isNullable = isNullable
        self.isPrimaryKey = isPrimaryKey
        self.defaultValue = defaultValue
    }
}

public struct SQLExecutionResult: Sendable {
    public let columns: [String]?
    public let rows: [[String?]]?
    public let rowsAffected: Int
    public let error: String?

    public init(columns: [String]?, rows: [[String?]]?, rowsAffected: Int, error: String? = nil) {
        self.columns = columns
        self.rows = rows
        self.rowsAffected = rowsAffected
        self.error = error
    }
}

// MARK: - Default Implementation

final class DefaultDatabaseDriver: DatabaseDriver, @unchecked Sendable {
    func getDatabases() -> [DatabaseDescriptor] {
        var databases: [DatabaseDescriptor] = []

        guard let documentsPath = NSSearchPathForDirectoriesInDomains(
            .documentDirectory, .userDomainMask, true
        ).first else {
            return databases
        }

        let libraryPath = NSSearchPathForDirectoriesInDomains(
            .libraryDirectory, .userDomainMask, true
        ).first

        let searchPaths = [documentsPath, libraryPath].compactMap { $0 }
        let fileManager = FileManager.default

        for basePath in searchPaths {
            guard let enumerator = fileManager.enumerator(atPath: basePath) else { continue }
            while let file = enumerator.nextObject() as? String {
                if file.hasSuffix(".sqlite") || file.hasSuffix(".db") || file.hasSuffix(".sqlite3") {
                    let fullPath = (basePath as NSString).appendingPathComponent(file)
                    let attrs = try? fileManager.attributesOfItem(atPath: fullPath)
                    let size = attrs?[.size] as? Int64 ?? 0
                    databases.append(DatabaseDescriptor(
                        name: (file as NSString).lastPathComponent,
                        path: fullPath,
                        sizeBytes: size
                    ))
                }
            }
        }

        return databases
    }

    func getTables(databasePath: String) -> [String] {
        // SQLite operations would require importing sqlite3 directly.
        // This is a minimal implementation that apps can override.
        return []
    }

    func getTableData(databasePath: String, table: String, limit: Int, offset: Int) -> TableDataResult {
        return TableDataResult(columns: [], rows: [], totalRows: 0)
    }

    func getTableStructure(databasePath: String, table: String) -> TableStructureResult {
        return TableStructureResult(columns: [])
    }

    func executeSQL(databasePath: String, query: String) -> SQLExecutionResult {
        return SQLExecutionResult(columns: nil, rows: nil, rowsAffected: 0, error: "Not implemented. Provide a custom DatabaseDriver.")
    }
}
