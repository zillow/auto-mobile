import Foundation
import SQLite3

/// Full SQLite database driver implementation.
/// iOS equivalent of Android's SQLiteDatabaseDriver.
/// Uses the SQLite C API directly (available on all Apple platforms).
public final class SQLiteDatabaseDriver: DatabaseDriver, @unchecked Sendable {
    private let lock = NSLock()
    private var openDatabases: [String: OpaquePointer] = [:]

    public init() {}

    deinit {
        closeAll()
    }

    // MARK: - DatabaseDriver

    public func getDatabases() -> [DatabaseDescriptor] {
        var databases: [DatabaseDescriptor] = []
        let fileManager = FileManager.default
        let extensions = ["sqlite", "db", "sqlite3"]
        let journalSuffixes = ["-journal", "-wal", "-shm"]

        let searchPaths: [String] = [
            NSSearchPathForDirectoriesInDomains(.documentDirectory, .userDomainMask, true),
            NSSearchPathForDirectoriesInDomains(.libraryDirectory, .userDomainMask, true),
            NSSearchPathForDirectoriesInDomains(.applicationSupportDirectory, .userDomainMask, true),
        ].flatMap { $0 }

        for basePath in searchPaths {
            guard let enumerator = fileManager.enumerator(atPath: basePath) else { continue }
            while let file = enumerator.nextObject() as? String {
                let isJournal = journalSuffixes.contains { file.hasSuffix($0) }
                guard !isJournal else { continue }

                let ext = (file as NSString).pathExtension.lowercased()
                guard extensions.contains(ext) else { continue }

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

        return databases.sorted { $0.name < $1.name }
    }

    public func getTables(databasePath: String) -> [String] {
        guard let db = openDatabase(path: databasePath, readOnly: true) else { return [] }

        let query = "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
        var stmt: OpaquePointer?
        guard sqlite3_prepare_v2(db, query, -1, &stmt, nil) == SQLITE_OK else { return [] }
        defer { sqlite3_finalize(stmt) }

        var tables: [String] = []
        while sqlite3_step(stmt) == SQLITE_ROW {
            if let cString = sqlite3_column_text(stmt, 0) {
                let name = String(cString: cString)
                // Filter internal tables
                if !name.hasPrefix("sqlite_") {
                    tables.append(name)
                }
            }
        }
        return tables
    }

    public func getTableData(databasePath: String, table: String, limit: Int, offset: Int) -> TableDataResult {
        guard let db = openDatabase(path: databasePath, readOnly: true) else {
            return TableDataResult(columns: [], rows: [], totalRows: 0)
        }

        // Get total count
        let countQuery = "SELECT COUNT(*) FROM \"\(sanitizeIdentifier(table))\""
        var countStmt: OpaquePointer?
        var totalRows = 0
        if sqlite3_prepare_v2(db, countQuery, -1, &countStmt, nil) == SQLITE_OK {
            if sqlite3_step(countStmt) == SQLITE_ROW {
                totalRows = Int(sqlite3_column_int64(countStmt, 0))
            }
        }
        sqlite3_finalize(countStmt)

        // Get paginated data
        let dataQuery = "SELECT * FROM \"\(sanitizeIdentifier(table))\" LIMIT ? OFFSET ?"
        var dataStmt: OpaquePointer?
        guard sqlite3_prepare_v2(db, dataQuery, -1, &dataStmt, nil) == SQLITE_OK else {
            return TableDataResult(columns: [], rows: [], totalRows: totalRows)
        }
        defer { sqlite3_finalize(dataStmt) }

        sqlite3_bind_int(dataStmt, 1, Int32(limit))
        sqlite3_bind_int(dataStmt, 2, Int32(offset))

        let columnCount = Int(sqlite3_column_count(dataStmt))
        var columns: [String] = []
        for i in 0..<columnCount {
            if let name = sqlite3_column_name(dataStmt, Int32(i)) {
                columns.append(String(cString: name))
            }
        }

        var rows: [[String?]] = []
        while sqlite3_step(dataStmt) == SQLITE_ROW {
            var row: [String?] = []
            for i in 0..<columnCount {
                row.append(getColumnValue(stmt: dataStmt, index: Int32(i)))
            }
            rows.append(row)
        }

        return TableDataResult(columns: columns, rows: rows, totalRows: totalRows)
    }

    public func getTableStructure(databasePath: String, table: String) -> TableStructureResult {
        guard let db = openDatabase(path: databasePath, readOnly: true) else {
            return TableStructureResult(columns: [])
        }

        let query = "PRAGMA table_info(\"\(sanitizeIdentifier(table))\")"
        var stmt: OpaquePointer?
        guard sqlite3_prepare_v2(db, query, -1, &stmt, nil) == SQLITE_OK else {
            return TableStructureResult(columns: [])
        }
        defer { sqlite3_finalize(stmt) }

        var columns: [ColumnInfo] = []
        while sqlite3_step(stmt) == SQLITE_ROW {
            let name = sqlite3_column_text(stmt, 1).map { String(cString: $0) } ?? ""
            let type = sqlite3_column_text(stmt, 2).map { String(cString: $0) } ?? ""
            let notNull = sqlite3_column_int(stmt, 3) != 0
            let defaultValue = sqlite3_column_text(stmt, 4).map { String(cString: $0) }
            let pk = sqlite3_column_int(stmt, 5) != 0

            columns.append(ColumnInfo(
                name: name,
                type: type,
                isNullable: !notNull,
                isPrimaryKey: pk,
                defaultValue: defaultValue
            ))
        }

        return TableStructureResult(columns: columns)
    }

    public func executeSQL(databasePath: String, query: String) -> SQLExecutionResult {
        let trimmed = query.trimmingCharacters(in: .whitespacesAndNewlines)
        let isRead = isReadQuery(trimmed)
        let readOnly = isRead
        guard let db = openDatabase(path: databasePath, readOnly: readOnly) else {
            return SQLExecutionResult(columns: nil, rows: nil, rowsAffected: 0, error: "Failed to open database")
        }

        if isRead {
            return executeQuery(db: db, query: trimmed)
        } else {
            return executeMutation(db: db, query: trimmed)
        }
    }

    // MARK: - Internal Helpers

    private func openDatabase(path: String, readOnly: Bool) -> OpaquePointer? {
        lock.lock()
        let cacheKey = "\(path):\(readOnly ? "ro" : "rw")"
        if let existing = openDatabases[cacheKey] {
            lock.unlock()
            return existing
        }
        lock.unlock()

        let flags = readOnly
            ? SQLITE_OPEN_READONLY
            : (SQLITE_OPEN_READWRITE | SQLITE_OPEN_CREATE)

        var db: OpaquePointer?
        guard sqlite3_open_v2(path, &db, flags, nil) == SQLITE_OK else {
            if let db = db { sqlite3_close(db) }
            return nil
        }

        if !readOnly {
            // Set busy timeout to wait for locks
            sqlite3_busy_timeout(db, 5000)
        }

        lock.lock()
        openDatabases[cacheKey] = db
        lock.unlock()

        return db
    }

    private func isReadQuery(_ query: String) -> Bool {
        let upper = query.uppercased()
        if startsWithKeyword(upper, "SELECT") || startsWithKeyword(upper, "EXPLAIN") {
            return true
        }
        // PRAGMA is read-only unless it contains '=' (e.g. PRAGMA user_version = 1)
        if startsWithKeyword(upper, "PRAGMA") {
            return !upper.contains("=")
        }
        if startsWithKeyword(upper, "WITH") {
            // CTE: find the actual statement after the CTE definitions
            if let range = findStatementAfterCTE(upper) {
                return startsWithKeyword(range, "SELECT")
            }
        }
        return false
    }

    private func startsWithKeyword(_ text: String, _ keyword: String) -> Bool {
        guard text.hasPrefix(keyword) else { return false }
        let idx = text.index(text.startIndex, offsetBy: keyword.count)
        guard idx < text.endIndex else { return true }
        let next = text[idx]
        return !next.isLetter && next != "_" && !next.isNumber
    }

    private func findStatementAfterCTE(_ query: String) -> String? {
        // Simple heuristic: find the last unmatched SELECT/INSERT/UPDATE/DELETE after WITH
        var depth = 0
        var i = query.index(query.startIndex, offsetBy: 4) // skip "WITH"
        while i < query.endIndex {
            let remaining = String(query[i...]).trimmingCharacters(in: .whitespaces)
            if remaining.hasPrefix("(") { depth += 1 }
            else if remaining.hasPrefix(")") { depth -= 1 }
            else if depth == 0 {
                for keyword in ["SELECT", "INSERT", "UPDATE", "DELETE"] {
                    if startsWithKeyword(remaining, keyword) {
                        return remaining
                    }
                }
            }
            i = query.index(after: i)
        }
        return nil
    }

    private func executeQuery(db: OpaquePointer, query: String) -> SQLExecutionResult {
        var stmt: OpaquePointer?
        guard sqlite3_prepare_v2(db, query, -1, &stmt, nil) == SQLITE_OK else {
            let error = sqlite3_errmsg(db).map { String(cString: $0) } ?? "Unknown error"
            return SQLExecutionResult(columns: nil, rows: nil, rowsAffected: 0, error: error)
        }
        defer { sqlite3_finalize(stmt) }

        let columnCount = Int(sqlite3_column_count(stmt))
        var columns: [String] = []
        for i in 0..<columnCount {
            if let name = sqlite3_column_name(stmt, Int32(i)) {
                columns.append(String(cString: name))
            }
        }

        var rows: [[String?]] = []
        while sqlite3_step(stmt) == SQLITE_ROW {
            var row: [String?] = []
            for i in 0..<columnCount {
                row.append(getColumnValue(stmt: stmt, index: Int32(i)))
            }
            rows.append(row)
        }

        return SQLExecutionResult(columns: columns, rows: rows, rowsAffected: 0)
    }

    private func executeMutation(db: OpaquePointer, query: String) -> SQLExecutionResult {
        var stmt: OpaquePointer?
        guard sqlite3_prepare_v2(db, query, -1, &stmt, nil) == SQLITE_OK else {
            let error = sqlite3_errmsg(db).map { String(cString: $0) } ?? "Unknown error"
            return SQLExecutionResult(columns: nil, rows: nil, rowsAffected: 0, error: error)
        }
        defer { sqlite3_finalize(stmt) }

        let result = sqlite3_step(stmt)
        if result == SQLITE_DONE {
            let changes = Int(sqlite3_changes(db))
            return SQLExecutionResult(columns: nil, rows: nil, rowsAffected: changes)
        } else if result == SQLITE_ROW {
            // RETURNING clause produces rows — collect them like a query
            let columnCount = Int(sqlite3_column_count(stmt))
            var columns: [String] = []
            for i in 0..<columnCount {
                if let name = sqlite3_column_name(stmt, Int32(i)) {
                    columns.append(String(cString: name))
                }
            }
            var rows: [[String?]] = []
            // First row is already stepped
            repeat {
                var row: [String?] = []
                for i in 0..<columnCount {
                    row.append(getColumnValue(stmt: stmt, index: Int32(i)))
                }
                rows.append(row)
            } while sqlite3_step(stmt) == SQLITE_ROW
            let changes = Int(sqlite3_changes(db))
            return SQLExecutionResult(columns: columns, rows: rows, rowsAffected: changes)
        } else {
            let error = sqlite3_errmsg(db).map { String(cString: $0) } ?? "Unknown error"
            return SQLExecutionResult(columns: nil, rows: nil, rowsAffected: 0, error: error)
        }
    }

    private func getColumnValue(stmt: OpaquePointer?, index: Int32) -> String? {
        guard let stmt = stmt else { return nil }

        switch sqlite3_column_type(stmt, index) {
        case SQLITE_NULL:
            return nil
        case SQLITE_INTEGER:
            return String(sqlite3_column_int64(stmt, index))
        case SQLITE_FLOAT:
            return String(sqlite3_column_double(stmt, index))
        case SQLITE_TEXT:
            if let cString = sqlite3_column_text(stmt, index) {
                return String(cString: cString)
            }
            return nil
        case SQLITE_BLOB:
            if let bytes = sqlite3_column_blob(stmt, index) {
                let count = Int(sqlite3_column_bytes(stmt, index))
                let data = Data(bytes: bytes, count: count)
                return data.base64EncodedString()
            }
            return nil
        default:
            if let cString = sqlite3_column_text(stmt, index) {
                return String(cString: cString)
            }
            return nil
        }
    }

    private func sanitizeIdentifier(_ identifier: String) -> String {
        // Escape double quotes in identifier to prevent SQL injection
        return identifier.replacingOccurrences(of: "\"", with: "\"\"")
    }

    /// Close all open database connections.
    public func closeAll() {
        lock.lock()
        for (_, db) in openDatabases {
            sqlite3_close(db)
        }
        openDatabases.removeAll()
        lock.unlock()
    }
}
