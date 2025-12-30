package dev.jasonpearson.automobile.sdk.adapters

/**
 * Base interface for navigation framework adapters.
 *
 * Each navigation framework (Compose, Circuit, XML Navigation, etc.) should implement
 * this interface to provide integration with the AutoMobile SDK.
 */
interface NavigationFrameworkAdapter {
    /**
     * Starts listening for navigation events in the framework.
     * This method should set up listeners/observers on the framework's navigation system.
     */
    fun start()

    /**
     * Stops listening for navigation events in the framework.
     * This method should clean up any listeners/observers.
     */
    fun stop()

    /**
     * Returns whether the adapter is currently active.
     */
    fun isActive(): Boolean
}
