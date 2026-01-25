package dev.jasonpearson.automobile.sdk.database

import android.content.ContentProvider
import android.content.ContentValues
import android.database.Cursor
import android.net.Uri
import android.os.Bundle
import org.json.JSONArray
import org.json.JSONObject

/**
 * ContentProvider for database inspection via ADB.
 *
 * This provider is only included in debug builds and allows database inspection via `adb shell
 * content call` commands.
 *
 * Example usage:
 * ```bash
 * adb shell content call --uri content://com.example.app.automobile.database \
 *     --method listDatabases
 *
 * adb shell content call --uri content://com.example.app.automobile.database \
 *     --method listTables --extra databasePath:s:/data/data/com.example.app/databases/mydb.db
 *
 * adb shell content call --uri content://com.example.app.automobile.database \
 *     --method executeSQL \
 *     --extra databasePath:s:/data/data/com.example.app/databases/mydb.db \
 *     --extra query:s:'SELECT * FROM users LIMIT 10'
 * ```
 */
class DatabaseInspectorProvider : ContentProvider() {

  override fun onCreate(): Boolean {
    // Always return true - actual initialization happens in call()
    return true
  }

  override fun call(method: String, arg: String?, extras: Bundle?): Bundle {
    val result = Bundle()

    // Check if inspection is enabled
    if (!DatabaseInspector.isEnabled()) {
      result.putBoolean("success", false)
      result.putString("errorType", "DISABLED")
      result.putString("error", "Database inspection is disabled")
      return result
    }

    try {
      val driver = DatabaseInspector.getDriver()
      val response =
          when (method) {
            "listDatabases" -> handleListDatabases(driver)
            "listTables" -> handleListTables(driver, extras)
            "getTableData" -> handleGetTableData(driver, extras)
            "getTableStructure" -> handleGetTableStructure(driver, extras)
            "executeSQL" -> handleExecuteSQL(driver, extras)
            else -> throw IllegalArgumentException("Unknown method: $method")
          }
      result.putBoolean("success", true)
      result.putString("result", response.toString())
    } catch (e: DatabaseError) {
      result.putBoolean("success", false)
      result.putString("errorType", e::class.simpleName ?: "UNKNOWN")
      result.putString("error", e.message ?: "Unknown error")
    } catch (e: IllegalArgumentException) {
      result.putBoolean("success", false)
      result.putString("errorType", "INVALID_ARGUMENT")
      result.putString("error", e.message ?: "Invalid argument")
    } catch (e: Exception) {
      result.putBoolean("success", false)
      result.putString("errorType", e::class.simpleName ?: "UNKNOWN")
      result.putString("error", e.message ?: "Unknown error")
    }

    return result
  }

  private fun handleListDatabases(driver: DatabaseDriver): JSONObject {
    val databases = driver.getDatabases()
    val jsonArray = JSONArray()

    databases.forEach { db ->
      jsonArray.put(
          JSONObject().apply {
            put("name", db.name)
            put("path", db.path)
          })
    }

    return JSONObject().put("databases", jsonArray)
  }

  private fun handleListTables(driver: DatabaseDriver, extras: Bundle?): JSONObject {
    val databasePath =
        extras?.getString("databasePath") ?: throw IllegalArgumentException("databasePath required")

    val tables = driver.getTables(databasePath)
    val jsonArray = JSONArray()
    tables.forEach { jsonArray.put(it) }

    return JSONObject().put("tables", jsonArray)
  }

  private fun handleGetTableData(driver: DatabaseDriver, extras: Bundle?): JSONObject {
    val databasePath =
        extras?.getString("databasePath") ?: throw IllegalArgumentException("databasePath required")
    val table = extras.getString("table") ?: throw IllegalArgumentException("table required")
    val limit = extras.getString("limit")?.toIntOrNull() ?: 50
    val offset = extras.getString("offset")?.toIntOrNull() ?: 0

    val data = driver.getTableData(databasePath, table, limit, offset)

    val columnsArray = JSONArray()
    data.columns.forEach { columnsArray.put(it) }

    val rowsArray = JSONArray()
    data.rows.forEach { row ->
      val rowArray = JSONArray()
      row.forEach { value -> rowArray.put(value ?: JSONObject.NULL) }
      rowsArray.put(rowArray)
    }

    return JSONObject().apply {
      put("columns", columnsArray)
      put("rows", rowsArray)
      put("total", data.total)
    }
  }

  private fun handleGetTableStructure(driver: DatabaseDriver, extras: Bundle?): JSONObject {
    val databasePath =
        extras?.getString("databasePath") ?: throw IllegalArgumentException("databasePath required")
    val table = extras.getString("table") ?: throw IllegalArgumentException("table required")

    val structure = driver.getTableStructure(databasePath, table)

    val columnsArray = JSONArray()
    structure.columns.forEach { col ->
      columnsArray.put(
          JSONObject().apply {
            put("name", col.name)
            put("type", col.type)
            put("nullable", col.nullable)
            put("primaryKey", col.primaryKey)
            put("defaultValue", col.defaultValue ?: JSONObject.NULL)
          })
    }

    return JSONObject().put("columns", columnsArray)
  }

  private fun handleExecuteSQL(driver: DatabaseDriver, extras: Bundle?): JSONObject {
    val databasePath =
        extras?.getString("databasePath") ?: throw IllegalArgumentException("databasePath required")
    val query = extras.getString("query") ?: throw IllegalArgumentException("query required")

    return when (val result = driver.executeSQL(databasePath, query)) {
      is SQLExecutionResult.Query -> {
        val columnsArray = JSONArray()
        result.columns.forEach { columnsArray.put(it) }

        val rowsArray = JSONArray()
        result.rows.forEach { row ->
          val rowArray = JSONArray()
          row.forEach { value -> rowArray.put(value ?: JSONObject.NULL) }
          rowsArray.put(rowArray)
        }

        JSONObject().apply {
          put("type", "query")
          put("columns", columnsArray)
          put("rows", rowsArray)
        }
      }
      is SQLExecutionResult.Mutation -> {
        JSONObject().apply {
          put("type", "mutation")
          put("rowsAffected", result.rowsAffected)
        }
      }
    }
  }

  // Required ContentProvider methods - not used for content call
  override fun query(
      uri: Uri,
      projection: Array<String>?,
      selection: String?,
      selectionArgs: Array<String>?,
      sortOrder: String?
  ): Cursor? = null

  override fun getType(uri: Uri): String? = null

  override fun insert(uri: Uri, values: ContentValues?): Uri? = null

  override fun delete(uri: Uri, selection: String?, selectionArgs: Array<String>?): Int = 0

  override fun update(
      uri: Uri,
      values: ContentValues?,
      selection: String?,
      selectionArgs: Array<String>?
  ): Int = 0
}
