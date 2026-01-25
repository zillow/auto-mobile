package dev.jasonpearson.automobile.sdk.database

import android.content.Context
import android.database.Cursor
import android.database.sqlite.SQLiteDatabase
import java.io.File
import java.util.concurrent.ConcurrentHashMap

/**
 * SQLite implementation of [DatabaseDriver].
 *
 * Discovers and provides access to SQLite databases within the app's data directory. Databases are
 * opened read-only by default; write access is only used for mutation queries.
 */
class SQLiteDatabaseDriver(private val context: Context) : DatabaseDriver {

  private val openDatabases = ConcurrentHashMap<String, SQLiteDatabase>()

  override fun getDatabases(): List<DatabaseDescriptor> {
    val databases = mutableListOf<DatabaseDescriptor>()

    // Get databases from Context.databaseList()
    context.databaseList().forEach { dbName ->
      if (!dbName.endsWith("-journal") && !dbName.endsWith("-wal") && !dbName.endsWith("-shm")) {
        val dbFile = context.getDatabasePath(dbName)
        if (dbFile.exists() && dbFile.isFile) {
          databases.add(DatabaseDescriptor(name = dbName, path = dbFile.absolutePath))
        }
      }
    }

    // Also scan for databases in the databases directory
    val dbDir = File(context.applicationInfo.dataDir, "databases")
    if (dbDir.exists() && dbDir.isDirectory) {
      dbDir
          .listFiles { file ->
            file.isFile &&
                !file.name.endsWith("-journal") &&
                !file.name.endsWith("-wal") &&
                !file.name.endsWith("-shm")
          }
          ?.forEach { file ->
            // Only add if not already in list
            if (databases.none { it.path == file.absolutePath }) {
              databases.add(DatabaseDescriptor(name = file.name, path = file.absolutePath))
            }
          }
    }

    return databases.sortedBy { it.name }
  }

  override fun getTables(databasePath: String): List<String> {
    val db = openDatabase(databasePath, readOnly = true)
    val tables = mutableListOf<String>()

    db.rawQuery("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name", null)
        .use { cursor ->
          while (cursor.moveToNext()) {
            val name = cursor.getString(0)
            // Exclude internal SQLite tables
            if (!name.startsWith("sqlite_") && !name.startsWith("android_")) {
              tables.add(name)
            }
          }
        }

    return tables
  }

  override fun getTableData(
      databasePath: String,
      table: String,
      limit: Int,
      offset: Int
  ): TableDataResult {
    val db = openDatabase(databasePath, readOnly = true)

    // Validate table exists
    if (!tableExists(db, table)) {
      throw DatabaseError.TableNotFound(table)
    }

    // Get total count
    val total =
        db.rawQuery("SELECT COUNT(*) FROM \"${table.replace("\"", "\"\"")}\"", null).use { cursor ->
          cursor.moveToFirst()
          cursor.getInt(0)
        }

    // Get paginated data
    val columns = mutableListOf<String>()
    val rows = mutableListOf<List<Any?>>()

    db.rawQuery(
            "SELECT * FROM \"${table.replace("\"", "\"\"")}\" LIMIT ? OFFSET ?",
            arrayOf(limit.toString(), offset.toString()))
        .use { cursor ->
          // Get column names
          columns.addAll(cursor.columnNames)

          // Get row data
          while (cursor.moveToNext()) {
            val row = mutableListOf<Any?>()
            for (i in 0 until cursor.columnCount) {
              row.add(getColumnValue(cursor, i))
            }
            rows.add(row)
          }
        }

    return TableDataResult(columns = columns, rows = rows, total = total)
  }

  override fun getTableStructure(databasePath: String, table: String): TableStructureResult {
    val db = openDatabase(databasePath, readOnly = true)

    // Validate table exists
    if (!tableExists(db, table)) {
      throw DatabaseError.TableNotFound(table)
    }

    val columns = mutableListOf<ColumnInfo>()

    db.rawQuery("PRAGMA table_info(\"${table.replace("\"", "\"\"")}\")", null).use { cursor ->
      while (cursor.moveToNext()) {
        // Columns: cid, name, type, notnull, dflt_value, pk
        val name = cursor.getString(1)
        val type = cursor.getString(2) ?: "TEXT"
        val notNull = cursor.getInt(3) == 1
        val defaultValue = if (cursor.isNull(4)) null else cursor.getString(4)
        val isPrimaryKey = cursor.getInt(5) > 0

        columns.add(
            ColumnInfo(
                name = name,
                type = type,
                nullable = !notNull,
                primaryKey = isPrimaryKey,
                defaultValue = defaultValue))
      }
    }

    return TableStructureResult(columns = columns)
  }

  override fun executeSQL(databasePath: String, query: String): SQLExecutionResult {
    val trimmedQuery = query.trim()

    // Determine if this is a query or mutation
    val isQuery = isReadQuery(trimmedQuery)

    return if (isQuery) {
      executeQuery(databasePath, trimmedQuery)
    } else {
      executeMutation(databasePath, trimmedQuery)
    }
  }

  /**
   * Determine if a SQL statement is a read query (returns rows) vs a mutation.
   *
   * Handles CTE queries (WITH ... SELECT) by looking past the CTE prefix to find the actual
   * statement type.
   */
  private fun isReadQuery(query: String): Boolean {
    val upperQuery = query.uppercase()

    // Direct read queries
    if (upperQuery.startsWith("SELECT") ||
        upperQuery.startsWith("PRAGMA") ||
        upperQuery.startsWith("EXPLAIN")) {
      return true
    }

    // CTE queries: WITH ... followed by SELECT/INSERT/UPDATE/DELETE
    // We need to find the actual statement after the CTE definitions
    if (upperQuery.startsWith("WITH")) {
      // Find the final statement after all CTE definitions
      // CTEs are: WITH name AS (...), name2 AS (...) SELECT/INSERT/UPDATE/DELETE
      // We look for the last occurrence of a statement keyword not inside parentheses
      val statementType = findStatementAfterCTE(upperQuery)
      return statementType == "SELECT"
    }

    return false
  }

  /**
   * Find the actual statement type after CTE definitions.
   *
   * Parses past WITH ... AS (...) clauses to find SELECT/INSERT/UPDATE/DELETE.
   */
  private fun findStatementAfterCTE(upperQuery: String): String? {
    var depth = 0
    var i = 4 // Skip "WITH"

    while (i < upperQuery.length) {
      val char = upperQuery[i]

      when {
        char == '(' -> depth++
        char == ')' -> depth--
        depth == 0 -> {
          // Check for statement keywords at this position
          val remaining = upperQuery.substring(i).trimStart()
          when {
            remaining.startsWith("SELECT") -> return "SELECT"
            remaining.startsWith("INSERT") -> return "INSERT"
            remaining.startsWith("UPDATE") -> return "UPDATE"
            remaining.startsWith("DELETE") -> return "DELETE"
          }
        }
      }
      i++
    }

    return null
  }

  private fun executeQuery(databasePath: String, query: String): SQLExecutionResult.Query {
    val db = openDatabase(databasePath, readOnly = true)
    val columns = mutableListOf<String>()
    val rows = mutableListOf<List<Any?>>()

    try {
      db.rawQuery(query, null).use { cursor ->
        columns.addAll(cursor.columnNames)

        while (cursor.moveToNext()) {
          val row = mutableListOf<Any?>()
          for (i in 0 until cursor.columnCount) {
            row.add(getColumnValue(cursor, i))
          }
          rows.add(row)
        }
      }
    } catch (e: Exception) {
      throw DatabaseError.SqlError(e.message ?: "Unknown SQL error")
    }

    return SQLExecutionResult.Query(columns = columns, rows = rows)
  }

  private fun executeMutation(databasePath: String, query: String): SQLExecutionResult.Mutation {
    val db = openDatabase(databasePath, readOnly = false)

    try {
      db.execSQL(query)
      // Get rows affected via changes() function
      val rowsAffected =
          db.rawQuery("SELECT changes()", null).use { cursor ->
            cursor.moveToFirst()
            cursor.getInt(0)
          }
      return SQLExecutionResult.Mutation(rowsAffected = rowsAffected)
    } catch (e: Exception) {
      throw DatabaseError.SqlError(e.message ?: "Unknown SQL error")
    }
  }

  private fun openDatabase(path: String, readOnly: Boolean): SQLiteDatabase {
    validatePath(path)

    // Check if we have a cached connection with compatible mode
    val cached = openDatabases[path]
    if (cached != null && cached.isOpen) {
      // If we need write access but have read-only, close and reopen
      if (!readOnly && cached.isReadOnly) {
        cached.close()
        openDatabases.remove(path)
      } else {
        return cached
      }
    }

    // Open the database
    val file = File(path)
    if (!file.exists()) {
      throw DatabaseError.NotFound(path)
    }

    val flags = if (readOnly) SQLiteDatabase.OPEN_READONLY else SQLiteDatabase.OPEN_READWRITE

    try {
      val db = SQLiteDatabase.openDatabase(path, null, flags)
      openDatabases[path] = db
      return db
    } catch (e: Exception) {
      throw DatabaseError.SqlError("Failed to open database: ${e.message}")
    }
  }

  private fun validatePath(path: String) {
    val dataDir = context.applicationInfo.dataDir
    val normalizedPath = File(path).canonicalPath
    val normalizedDataDir = File(dataDir).canonicalPath

    if (!normalizedPath.startsWith(normalizedDataDir)) {
      throw DatabaseError.InvalidPath(path)
    }
  }

  private fun tableExists(db: SQLiteDatabase, table: String): Boolean {
    return db.rawQuery(
            "SELECT name FROM sqlite_master WHERE type='table' AND name=?", arrayOf(table))
        .use { cursor -> cursor.count > 0 }
  }

  private fun getColumnValue(cursor: Cursor, columnIndex: Int): Any? {
    return when (cursor.getType(columnIndex)) {
      Cursor.FIELD_TYPE_NULL -> null
      Cursor.FIELD_TYPE_INTEGER -> cursor.getLong(columnIndex)
      Cursor.FIELD_TYPE_FLOAT -> cursor.getDouble(columnIndex)
      Cursor.FIELD_TYPE_STRING -> cursor.getString(columnIndex)
      Cursor.FIELD_TYPE_BLOB -> {
        // Return blob as base64 for JSON serialization
        val blob = cursor.getBlob(columnIndex)
        android.util.Base64.encodeToString(blob, android.util.Base64.NO_WRAP)
      }
      else -> cursor.getString(columnIndex)
    }
  }

  /** Close all open database connections. */
  fun closeAll() {
    openDatabases.values.forEach { db ->
      try {
        if (db.isOpen) {
          db.close()
        }
      } catch (_: Exception) {
        // Ignore close errors
      }
    }
    openDatabases.clear()
  }
}
