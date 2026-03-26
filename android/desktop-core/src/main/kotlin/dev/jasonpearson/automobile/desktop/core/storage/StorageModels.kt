package dev.jasonpearson.automobile.desktop.core.storage

/**
 * Represents a database available on the device.
 */
data class DatabaseInfo(
    val name: String,
    val path: String,
    val sizeBytes: Long,
    val tables: List<TableInfo>,
)

/**
 * Represents a table in a database.
 */
data class TableInfo(
    val name: String,
    val rowCount: Long,
    val columns: List<ColumnInfo>,
)

/**
 * Represents a column in a table.
 */
data class ColumnInfo(
    val name: String,
    val type: String,
    val isPrimaryKey: Boolean,
    val isNullable: Boolean,
    val defaultValue: String?,
)

/**
 * Result of a SQL query execution.
 */
data class QueryResult(
    val columns: List<String>,
    val rows: List<List<Any?>>,
    val rowCount: Int,
    val executionTimeMs: Long,
    val error: String? = null,
)

/**
 * A saved/favorite query.
 */
data class SavedQuery(
    val id: String,
    val name: String,
    val sql: String,
    val databaseName: String,
    val createdAt: Long,
)

/**
 * Query history entry.
 */
data class QueryHistoryEntry(
    val id: String,
    val sql: String,
    val databaseName: String,
    val executedAt: Long,
    val executionTimeMs: Long,
    val rowsAffected: Int,
    val success: Boolean,
    val error: String? = null,
)

/**
 * Represents a key-value storage file (SharedPreferences on Android, UserDefaults on iOS).
 */
data class KeyValueFile(
    val name: String,
    val path: String,
    val platform: StoragePlatform,
    val entries: List<KeyValueEntry>,
)

/**
 * A single key-value entry.
 */
data class KeyValueEntry(
    val key: String,
    val value: Any?,
    val type: KeyValueType,
)

enum class KeyValueType(val protocolName: kotlin.String) {
    String("STRING"),
    Int("INT"),
    Long("LONG"),
    Float("FLOAT"),
    Boolean("BOOLEAN"),
    StringSet("STRING_SET"),
    Unknown("UNKNOWN"),
}

enum class StoragePlatform {
    Android,
    iOS,
}

/**
 * View modes for database inspector.
 */
enum class DatabaseViewMode {
    Data,
    Structure,
    SQL,
    QueryHistory,
}

// Mock data for development
object StorageMockData {

    val databases = listOf(
        DatabaseInfo(
            name = "app.db",
            path = "/data/data/com.chat.app/databases/app.db",
            sizeBytes = 524288,
            tables = listOf(
                TableInfo(
                    name = "users",
                    rowCount = 156,
                    columns = listOf(
                        ColumnInfo("id", "INTEGER", isPrimaryKey = true, isNullable = false, defaultValue = null),
                        ColumnInfo("username", "TEXT", isPrimaryKey = false, isNullable = false, defaultValue = null),
                        ColumnInfo("email", "TEXT", isPrimaryKey = false, isNullable = true, defaultValue = null),
                        ColumnInfo("created_at", "INTEGER", isPrimaryKey = false, isNullable = false, defaultValue = "0"),
                        ColumnInfo("is_active", "INTEGER", isPrimaryKey = false, isNullable = false, defaultValue = "1"),
                    ),
                ),
                TableInfo(
                    name = "messages",
                    rowCount = 2847,
                    columns = listOf(
                        ColumnInfo("id", "INTEGER", isPrimaryKey = true, isNullable = false, defaultValue = null),
                        ColumnInfo("sender_id", "INTEGER", isPrimaryKey = false, isNullable = false, defaultValue = null),
                        ColumnInfo("receiver_id", "INTEGER", isPrimaryKey = false, isNullable = false, defaultValue = null),
                        ColumnInfo("content", "TEXT", isPrimaryKey = false, isNullable = false, defaultValue = null),
                        ColumnInfo("timestamp", "INTEGER", isPrimaryKey = false, isNullable = false, defaultValue = null),
                        ColumnInfo("is_read", "INTEGER", isPrimaryKey = false, isNullable = false, defaultValue = "0"),
                    ),
                ),
                TableInfo(
                    name = "conversations",
                    rowCount = 42,
                    columns = listOf(
                        ColumnInfo("id", "INTEGER", isPrimaryKey = true, isNullable = false, defaultValue = null),
                        ColumnInfo("participant_ids", "TEXT", isPrimaryKey = false, isNullable = false, defaultValue = null),
                        ColumnInfo("last_message_id", "INTEGER", isPrimaryKey = false, isNullable = true, defaultValue = null),
                        ColumnInfo("updated_at", "INTEGER", isPrimaryKey = false, isNullable = false, defaultValue = null),
                    ),
                ),
                TableInfo(
                    name = "settings",
                    rowCount = 8,
                    columns = listOf(
                        ColumnInfo("key", "TEXT", isPrimaryKey = true, isNullable = false, defaultValue = null),
                        ColumnInfo("value", "TEXT", isPrimaryKey = false, isNullable = true, defaultValue = null),
                    ),
                ),
            ),
        ),
        DatabaseInfo(
            name = "cache.db",
            path = "/data/data/com.chat.app/databases/cache.db",
            sizeBytes = 131072,
            tables = listOf(
                TableInfo(
                    name = "image_cache",
                    rowCount = 523,
                    columns = listOf(
                        ColumnInfo("url", "TEXT", isPrimaryKey = true, isNullable = false, defaultValue = null),
                        ColumnInfo("local_path", "TEXT", isPrimaryKey = false, isNullable = false, defaultValue = null),
                        ColumnInfo("cached_at", "INTEGER", isPrimaryKey = false, isNullable = false, defaultValue = null),
                        ColumnInfo("expires_at", "INTEGER", isPrimaryKey = false, isNullable = true, defaultValue = null),
                    ),
                ),
            ),
        ),
    )

    val mockQueryResult = QueryResult(
        columns = listOf("id", "username", "email", "created_at", "is_active"),
        rows = listOf(
            listOf(1, "alice", "alice@example.com", 1704067200000L, 1),
            listOf(2, "bob", "bob@example.com", 1704153600000L, 1),
            listOf(3, "charlie", "charlie@example.com", 1704240000000L, 1),
            listOf(4, "diana", "diana@example.com", 1704326400000L, 0),
            listOf(5, "eve", "eve@example.com", 1704412800000L, 1),
            listOf(6, "frank", null, 1704499200000L, 1),
            listOf(7, "grace", "grace@example.com", 1704585600000L, 1),
            listOf(8, "henry", "henry@example.com", 1704672000000L, 1),
        ),
        rowCount = 8,
        executionTimeMs = 12,
    )

    val savedQueries = listOf(
        SavedQuery("q1", "Active users", "SELECT * FROM users WHERE is_active = 1", "app.db", 1704000000000L),
        SavedQuery("q2", "Recent messages", "SELECT * FROM messages ORDER BY timestamp DESC LIMIT 100", "app.db", 1704100000000L),
        SavedQuery("q3", "User count", "SELECT COUNT(*) FROM users", "app.db", 1704200000000L),
    )

    val queryHistory = listOf(
        QueryHistoryEntry("h1", "SELECT * FROM users WHERE is_active = 1", "app.db", 1705000000000L, 15, 8, true),
        QueryHistoryEntry("h2", "SELECT COUNT(*) FROM messages", "app.db", 1704990000000L, 8, 1, true),
        QueryHistoryEntry("h3", "UPDATE users SET is_active = 0 WHERE id = 4", "app.db", 1704980000000L, 22, 1, true),
        QueryHistoryEntry("h4", "SELECT * FROM nonexistent", "app.db", 1704970000000L, 5, 0, false, "no such table: nonexistent"),
        QueryHistoryEntry("h5", "SELECT * FROM conversations ORDER BY updated_at DESC", "app.db", 1704960000000L, 18, 42, true),
    )

    val keyValueFiles = listOf(
        KeyValueFile(
            name = "app_preferences",
            path = "/data/data/com.chat.app/shared_prefs/app_preferences.xml",
            platform = StoragePlatform.Android,
            entries = listOf(
                KeyValueEntry("user_id", 12345L, KeyValueType.Long),
                KeyValueEntry("username", "alice", KeyValueType.String),
                KeyValueEntry("auth_token", "eyJhbGciOiJIUzI1NiIs...", KeyValueType.String),
                KeyValueEntry("notifications_enabled", true, KeyValueType.Boolean),
                KeyValueEntry("theme", "dark", KeyValueType.String),
                KeyValueEntry("font_size", 14, KeyValueType.Int),
                KeyValueEntry("last_sync_time", 1705000000000L, KeyValueType.Long),
                KeyValueEntry("onboarding_complete", true, KeyValueType.Boolean),
            ),
        ),
        KeyValueFile(
            name = "feature_flags",
            path = "/data/data/com.chat.app/shared_prefs/feature_flags.xml",
            platform = StoragePlatform.Android,
            entries = listOf(
                KeyValueEntry("new_chat_ui", true, KeyValueType.Boolean),
                KeyValueEntry("video_calls", false, KeyValueType.Boolean),
                KeyValueEntry("reactions", true, KeyValueType.Boolean),
                KeyValueEntry("max_group_size", 50, KeyValueType.Int),
            ),
        ),
        KeyValueFile(
            name = "cache_settings",
            path = "/data/data/com.chat.app/shared_prefs/cache_settings.xml",
            platform = StoragePlatform.Android,
            entries = listOf(
                KeyValueEntry("max_cache_size_mb", 100, KeyValueType.Int),
                KeyValueEntry("cache_expiry_hours", 24, KeyValueType.Int),
                KeyValueEntry("auto_cleanup", true, KeyValueType.Boolean),
            ),
        ),
    )
}
