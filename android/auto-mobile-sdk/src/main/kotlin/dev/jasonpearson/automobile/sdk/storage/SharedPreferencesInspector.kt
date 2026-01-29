package dev.jasonpearson.automobile.sdk.storage

import android.content.Context

/**
 * Public API for SharedPreferences inspection.
 *
 * The SharedPreferencesInspector must be initialized with a Context before use. It is disabled by
 * default and must be explicitly enabled in debug builds.
 *
 * Usage:
 * ```kotlin
 * // In Application.onCreate() or similar initialization code
 * AutoMobileSDK.initialize(applicationContext) // This initializes SharedPreferencesInspector
 *
 * // Enable inspection (typically only in debug builds)
 * if (BuildConfig.DEBUG) {
 *     SharedPreferencesInspector.setEnabled(true)
 * }
 * ```
 */
object SharedPreferencesInspector {
  private var context: Context? = null
  private var _enabled: Boolean = false
  private var _driver: SharedPreferencesDriverImpl? = null

  /**
   * Initialize the SharedPreferencesInspector with application context.
   *
   * This is called internally by AutoMobileSDK.initialize().
   *
   * @param context Application context
   */
  internal fun initialize(context: Context) {
    this.context = context.applicationContext
    // Driver is created lazily when needed
  }

  /** Returns whether SharedPreferences inspection is enabled. */
  fun isEnabled(): Boolean = _enabled

  /**
   * Enable or disable SharedPreferences inspection.
   *
   * When disabled, all ContentProvider calls will return an error. This should typically only be
   * enabled in debug builds.
   *
   * @param enabled Whether to enable SharedPreferences inspection
   */
  fun setEnabled(enabled: Boolean) {
    _enabled = enabled
    if (!enabled) {
      // Stop listening when disabled
      _driver?.stopAllListening()
    }
  }

  /**
   * Get the SharedPreferences driver instance.
   *
   * @throws SharedPreferencesError.NotInitialized if initialize() has not been called
   */
  internal fun getDriver(): SharedPreferencesDriver {
    val ctx = context ?: throw SharedPreferencesError.NotInitialized()

    // Create driver lazily
    if (_driver == null) {
      _driver = SharedPreferencesDriverImpl(ctx)
    }

    return _driver!!
  }

  /**
   * Reset internal state. Used for testing.
   *
   * @hide
   */
  internal fun reset() {
    _driver?.stopAllListening()
    _driver = null
    _enabled = false
    context = null
  }
}
