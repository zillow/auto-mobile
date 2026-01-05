package dev.jasonpearson.automobile.sdk

import android.content.Context
import android.content.Intent
import java.util.concurrent.CopyOnWriteArrayList

/**
 * Main SDK class for tracking navigation events across various Android navigation frameworks.
 *
 * This SDK provides a unified interface for hooking into navigation events whether you're using:
 * - XML-based Navigation Component
 * - Jetpack Compose Navigation
 * - Circuit navigation library
 * - Custom navigation solutions
 *
 * Usage:
 * ```kotlin
 * // Initialize the SDK with context (required for broadcasting)
 * AutoMobileSDK.initialize(applicationContext)
 *
 * // Register a listener
 * AutoMobileSDK.addNavigationListener { event ->
 *     println("Navigated to: ${event.destination}")
 * }
 *
 * // Emit navigation events from your framework adapter
 * AutoMobileSDK.notifyNavigationEvent(
 *     NavigationEvent(
 *         destination = "home",
 *         source = NavigationSource.COMPOSE_NAVIGATION
 *     )
 * )
 * ```
 */
object AutoMobileSDK {
  private val listeners = CopyOnWriteArrayList<NavigationListener>()
  private var isEnabled = true
  private var context: Context? = null

  const val ACTION_NAVIGATION_EVENT = "dev.jasonpearson.automobile.sdk.NAVIGATION_EVENT"
  const val EXTRA_DESTINATION = "destination"
  const val EXTRA_SOURCE = "source"
  const val EXTRA_TIMESTAMP = "timestamp"
  const val EXTRA_APPLICATION_ID = "application_id"
  const val ACTION_RECOMPOSITION_CONTROL = "dev.jasonpearson.automobile.sdk.RECOMPOSITION_CONTROL"
  const val ACTION_RECOMPOSITION_SNAPSHOT = "dev.jasonpearson.automobile.sdk.RECOMPOSITION_SNAPSHOT"
  const val EXTRA_RECOMPOSITION_ENABLED = "enabled"
  const val EXTRA_RECOMPOSITION_SNAPSHOT = "snapshot_json"

  /**
   * Initialize the SDK with application context. Required for broadcasting navigation events across
   * processes.
   *
   * @param context Application context (use applicationContext, not activity context)
   */
  fun initialize(context: Context) {
    this.context = context.applicationContext
    RecompositionTracker.initialize(this.context!!)
  }

  /**
   * Adds a navigation listener to receive navigation events.
   *
   * @param listener The listener to add
   */
  fun addNavigationListener(listener: NavigationListener) {
    listeners.add(listener)
  }

  /**
   * Removes a previously added navigation listener.
   *
   * @param listener The listener to remove
   */
  fun removeNavigationListener(listener: NavigationListener) {
    listeners.remove(listener)
  }

  /** Removes all navigation listeners. */
  fun clearNavigationListeners() {
    listeners.clear()
  }

  /**
   * Notifies all registered listeners of a navigation event. This method is typically called by
   * framework adapters. Also broadcasts the event via Intent for cross-process communication.
   *
   * @param event The navigation event to emit
   */
  fun notifyNavigationEvent(event: NavigationEvent) {
    if (!isEnabled) return

    // Notify in-process listeners
    listeners.forEach { listener ->
      try {
        listener.onNavigationEvent(event)
      } catch (e: Exception) {
        // Catch exceptions to prevent one listener from breaking others
        e.printStackTrace()
      }
    }

    // Broadcast event for cross-process communication (e.g., to accessibility service)
    context?.let { ctx ->
      try {
        val intent =
            Intent(ACTION_NAVIGATION_EVENT).apply {
              putExtra(EXTRA_DESTINATION, event.destination)
              putExtra(EXTRA_SOURCE, event.source.name)
              putExtra(EXTRA_TIMESTAMP, System.currentTimeMillis())
              putExtra(EXTRA_APPLICATION_ID, ctx.packageName)
              // Serialize arguments as strings
              event.arguments.forEach { (key, value) ->
                putExtra("arg_$key", value?.toString() ?: "null")
              }
              // Serialize metadata
              event.metadata.forEach { (key, value) -> putExtra("meta_$key", value) }
            }
        ctx.sendBroadcast(intent)
      } catch (e: Exception) {
        e.printStackTrace()
      }
    }
  }

  /**
   * Enables or disables navigation event tracking.
   *
   * @param enabled Whether navigation tracking should be enabled
   */
  fun setEnabled(enabled: Boolean) {
    isEnabled = enabled
  }

  /** Returns whether navigation tracking is currently enabled. */
  fun isEnabled(): Boolean = isEnabled

  /** Returns the current number of registered listeners. */
  fun getListenerCount(): Int = listeners.size
}
