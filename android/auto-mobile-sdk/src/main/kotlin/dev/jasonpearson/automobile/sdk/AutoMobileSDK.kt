package dev.jasonpearson.automobile.sdk

import android.content.Context
import android.content.Intent
import dev.jasonpearson.automobile.protocol.NavigationSourceType
import dev.jasonpearson.automobile.protocol.SdkCustomEvent
import dev.jasonpearson.automobile.protocol.SdkEventSerializer
import dev.jasonpearson.automobile.protocol.SdkNavigationEvent
import dev.jasonpearson.automobile.sdk.anr.AutoMobileAnr
import dev.jasonpearson.automobile.sdk.biometrics.AutoMobileBiometrics
import dev.jasonpearson.automobile.sdk.crashes.AutoMobileCrashes
import dev.jasonpearson.automobile.sdk.database.DatabaseInspector
import dev.jasonpearson.automobile.sdk.events.SdkEventBroadcaster
import dev.jasonpearson.automobile.sdk.events.SdkEventBuffer
import dev.jasonpearson.automobile.sdk.failures.AutoMobileFailures
import dev.jasonpearson.automobile.sdk.logging.AutoMobileLog
import dev.jasonpearson.automobile.sdk.network.AutoMobileNetwork
import dev.jasonpearson.automobile.sdk.os.AutoMobileBroadcastInterceptor
import dev.jasonpearson.automobile.sdk.os.AutoMobileOsEvents
import dev.jasonpearson.automobile.sdk.storage.SharedPreferencesInspector
import androidx.annotation.RequiresPermission
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
  private var eventBuffer: SdkEventBuffer? = null

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
  @RequiresPermission(android.Manifest.permission.ACCESS_NETWORK_STATE)
  fun initialize(context: Context) {
    this.context = context.applicationContext
    val appContext = this.context!!

    // Create shared event buffer with broadcast flush callback
    val buffer = SdkEventBuffer(
      onFlush = { events -> SdkEventBroadcaster.broadcastBatch(appContext, events) },
    )
    buffer.start()
    eventBuffer = buffer

    // Initialize telemetry subsystems with the shared buffer
    AutoMobileNetwork.initialize(appContext.packageName, buffer)
    AutoMobileLog.initialize(appContext.packageName, buffer)
    AutoMobileOsEvents.initialize(appContext, buffer)
    AutoMobileBroadcastInterceptor.initialize(appContext, buffer)

    // Initialize existing subsystems
    RecompositionTracker.initialize(appContext)
    AutoMobileNotifications.initialize(appContext)
    DatabaseInspector.initialize(appContext)
    SharedPreferencesInspector.initialize(appContext)
    AutoMobileFailures.initialize(appContext)
    AutoMobileCrashes.initialize(appContext)
    AutoMobileAnr.initialize(appContext)
    AutoMobileBiometrics.initialize(appContext)
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
        val timestamp = System.currentTimeMillis()

        // Create protocol event for type-safe serialization
        val sdkEvent = SdkNavigationEvent(
          timestamp = timestamp,
          applicationId = ctx.packageName,
          destination = event.destination,
          source = event.source.toProtocolType(),
          arguments = event.arguments.mapValues { it.value?.toString() ?: "null" },
          metadata = event.metadata,
        )

        val intent =
            Intent(ACTION_NAVIGATION_EVENT).apply {
              // Type-safe serialized event (new protocol)
              putExtra(SdkEventSerializer.EXTRA_SDK_EVENT_JSON, SdkEventSerializer.toJson(sdkEvent))
              putExtra(SdkEventSerializer.EXTRA_SDK_EVENT_TYPE, SdkEventSerializer.EventTypes.NAVIGATION)

              // Legacy extras for backward compatibility with older AccessibilityService versions
              putExtra(EXTRA_DESTINATION, event.destination)
              putExtra(EXTRA_SOURCE, event.source.name)
              putExtra(EXTRA_TIMESTAMP, timestamp)
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
   * Convert SDK NavigationSource to protocol NavigationSourceType.
   */
  private fun NavigationSource.toProtocolType(): NavigationSourceType {
    return when (this) {
      NavigationSource.NAVIGATION_COMPONENT -> NavigationSourceType.NAVIGATION_COMPONENT
      NavigationSource.COMPOSE_NAVIGATION -> NavigationSourceType.COMPOSE_NAVIGATION
      NavigationSource.CIRCUIT -> NavigationSourceType.CIRCUIT
      NavigationSource.CUSTOM -> NavigationSourceType.CUSTOM
      NavigationSource.DEEP_LINK -> NavigationSourceType.DEEP_LINK
      NavigationSource.ACTIVITY -> NavigationSourceType.ACTIVITY
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

  /**
   * Track a custom app-defined event.
   *
   * @param name The event name
   * @param properties Optional key-value properties
   */
  fun trackEvent(name: String, properties: Map<String, String> = emptyMap()) {
    if (!isEnabled) return
    val buf = eventBuffer ?: return
    buf.add(
      SdkCustomEvent(
        timestamp = System.currentTimeMillis(),
        applicationId = context?.packageName,
        name = name,
        properties = properties,
      )
    )
  }

  /** Returns the shared event buffer, or null if not initialized. */
  fun getEventBuffer(): SdkEventBuffer? = eventBuffer
}
