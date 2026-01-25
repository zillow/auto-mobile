package dev.jasonpearson.automobile.sdk.database

import android.content.Context

/**
 * Public API for database inspection.
 *
 * The DatabaseInspector must be initialized with a Context before use. It is disabled by default
 * and must be explicitly enabled in debug builds.
 *
 * Usage:
 * ```kotlin
 * // In Application.onCreate() or similar initialization code
 * AutoMobileSDK.initialize(applicationContext) // This initializes DatabaseInspector
 *
 * // Enable inspection (typically only in debug builds)
 * if (BuildConfig.DEBUG) {
 *     DatabaseInspector.setEnabled(true)
 * }
 * ```
 */
object DatabaseInspector {
  private var context: Context? = null
  private var _enabled: Boolean = false
  private var _driver: SQLiteDatabaseDriver? = null

  /**
   * Initialize the DatabaseInspector with application context.
   *
   * This is called internally by AutoMobileSDK.initialize().
   *
   * @param context Application context
   */
  internal fun initialize(context: Context) {
    this.context = context.applicationContext
    // Driver is created lazily when needed
  }

  /** Returns whether database inspection is enabled. */
  fun isEnabled(): Boolean = _enabled

  /**
   * Enable or disable database inspection.
   *
   * When disabled, all ContentProvider calls will return an error. This should typically only be
   * enabled in debug builds.
   *
   * @param enabled Whether to enable database inspection
   */
  fun setEnabled(enabled: Boolean) {
    _enabled = enabled
    if (!enabled) {
      // Close any open database connections when disabled
      _driver?.closeAll()
    }
  }

  /**
   * Get the database driver instance.
   *
   * @throws DatabaseError.NotInitialized if initialize() has not been called
   */
  internal fun getDriver(): DatabaseDriver {
    val ctx = context ?: throw DatabaseError.NotInitialized()

    // Create driver lazily
    if (_driver == null) {
      _driver = SQLiteDatabaseDriver(ctx)
    }

    return _driver!!
  }

  /** Close all open database connections. Call this when the app is being destroyed. */
  fun closeAll() {
    _driver?.closeAll()
  }

  /**
   * Reset internal state. Used for testing.
   *
   * @hide
   */
  internal fun reset() {
    _driver?.closeAll()
    _driver = null
    _enabled = false
    context = null
  }
}
