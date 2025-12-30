package dev.jasonpearson.automobile.sdk

/**
 * Listener interface for receiving navigation events.
 */
fun interface NavigationListener {
    /**
     * Called when a navigation event occurs.
     *
     * @param event The navigation event that occurred
     */
    fun onNavigationEvent(event: NavigationEvent)
}
