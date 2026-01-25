package dev.jasonpearson.automobile.sdk.database

/**
 * Interface for database operations. Implementations provide access to app databases for
 * inspection and querying.
 */
interface DatabaseDriver {
  /** Returns a list of all accessible databases. */
  fun getDatabases(): List<DatabaseDescriptor>

  /** Returns a list of table names in the specified database. */
  fun getTables(databasePath: String): List<String>

  /** Returns paginated row data from a table. */
  fun getTableData(databasePath: String, table: String, limit: Int, offset: Int): TableDataResult

  /** Returns column structure information for a table. */
  fun getTableStructure(databasePath: String, table: String): TableStructureResult

  /** Executes a SQL query and returns the result. */
  fun executeSQL(databasePath: String, query: String): SQLExecutionResult
}

/** Describes a database file. */
data class DatabaseDescriptor(
    /** Display name of the database (typically the filename). */
    val name: String,
    /** Absolute path to the database file. */
    val path: String
)

/** Result of querying table data. */
data class TableDataResult(
    /** Column names in order. */
    val columns: List<String>,
    /** Row data as list of column values. */
    val rows: List<List<Any?>>,
    /** Total number of rows in the table. */
    val total: Int
)

/** Result of querying table structure. */
data class TableStructureResult(
    /** Column definitions. */
    val columns: List<ColumnInfo>
)

/** Column metadata from PRAGMA table_info. */
data class ColumnInfo(
    /** Column name. */
    val name: String,
    /** Column type (e.g., TEXT, INTEGER, REAL, BLOB). */
    val type: String,
    /** Whether the column allows NULL values. */
    val nullable: Boolean,
    /** Whether the column is a primary key. */
    val primaryKey: Boolean,
    /** Default value if any. */
    val defaultValue: String?
)

/** Result of executing a SQL statement. */
sealed class SQLExecutionResult {
  /** Result from a SELECT query. */
  data class Query(val columns: List<String>, val rows: List<List<Any?>>) : SQLExecutionResult()

  /** Result from an INSERT, UPDATE, or DELETE statement. */
  data class Mutation(val rowsAffected: Int) : SQLExecutionResult()
}
