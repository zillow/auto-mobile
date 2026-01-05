package dev.jasonpearson.automobile.sdk.adapters

import dev.jasonpearson.automobile.sdk.AutoMobileSDK
import dev.jasonpearson.automobile.sdk.NavigationEvent
import dev.jasonpearson.automobile.sdk.NavigationSource

/**
 * Adapter for Circuit navigation library by Slack.
 *
 * Circuit uses a different navigation approach with screens and presenters. To use this adapter,
 * you'll need to manually call trackNavigation when navigating.
 *
 * Usage:
 * ```kotlin
 * // When navigating in Circuit
 * CircuitAdapter.trackNavigation(
 *     destination = screen::class.simpleName ?: "Unknown",
 *     arguments = mapOf("screenParam" to value)
 * )
 * ```
 *
 * For automatic tracking, consider wrapping your Circuit Navigator implementation to call
 * trackNavigation on navigation events.
 */
object CircuitAdapter : NavigationFrameworkAdapter {
  private var isActive = false

  override fun start() {
    isActive = true
  }

  override fun stop() {
    isActive = false
  }

  override fun isActive(): Boolean = isActive

  /**
   * Manually track a navigation event in Circuit.
   *
   * @param destination The destination screen name
   * @param arguments Optional navigation arguments
   * @param metadata Optional metadata about the navigation
   */
  fun trackNavigation(
      destination: String,
      arguments: Map<String, Any?> = emptyMap(),
      metadata: Map<String, String> = emptyMap(),
  ) {
    if (!isActive) return

    AutoMobileSDK.notifyNavigationEvent(
        NavigationEvent(
            destination = destination,
            source = NavigationSource.CIRCUIT,
            arguments = arguments,
            metadata = metadata,
        )
    )
  }
}
