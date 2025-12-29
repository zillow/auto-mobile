package dev.jasonpearson.automobile.sdk

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

    /**
     * Removes all navigation listeners.
     */
    fun clearNavigationListeners() {
        listeners.clear()
    }

    /**
     * Notifies all registered listeners of a navigation event.
     * This method is typically called by framework adapters.
     *
     * @param event The navigation event to emit
     */
    fun notifyNavigationEvent(event: NavigationEvent) {
        if (!isEnabled) return
        listeners.forEach { listener ->
            try {
                listener.onNavigationEvent(event)
            } catch (e: Exception) {
                // Catch exceptions to prevent one listener from breaking others
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

    /**
     * Returns whether navigation tracking is currently enabled.
     */
    fun isEnabled(): Boolean = isEnabled

    /**
     * Returns the current number of registered listeners.
     */
    fun getListenerCount(): Int = listeners.size
}
