package dev.jasonpearson.automobile.sdk.adapters

import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.navigation3.runtime.NavKey
import dev.jasonpearson.automobile.sdk.AutoMobileSDK
import dev.jasonpearson.automobile.sdk.NavigationEvent
import dev.jasonpearson.automobile.sdk.NavigationSource

/**
 * Adapter for Navigation3 (androidx.navigation3) framework.
 *
 * This adapter provides a simple way to track navigation events in Navigation3.
 *
 * Usage in your NavDisplay entry providers:
 * ```kotlin
 * entry<HomeDestination> { homeDestination ->
 *     Navigation3Adapter.TrackNavigation(
 *         destination = homeDestination,
 *         extractArguments = { mapOf("selectedTab" to it.selectedTab) }
 *     )
 *
 *     Box(modifier = Modifier.destinationSemanticModifier<HomeDestination>()) {
 *         HomeScreen(...)
 *     }
 * }
 * ```
 */
object Navigation3Adapter : NavigationFrameworkAdapter {
    private var isActive = false

    override fun start() {
        isActive = true
    }

    override fun stop() {
        isActive = false
    }

    override fun isActive(): Boolean = isActive

    /**
     * Composable function to track navigation to a specific destination.
     * Call this at the top of each entry<> block in your NavDisplay.
     *
     * @param destination The NavKey destination being navigated to
     * @param extractArguments Optional function to extract arguments from the destination
     * @param extractMetadata Optional function to extract metadata from the destination
     */
    @Composable
    fun <T : NavKey> TrackNavigation(
        destination: T,
        extractArguments: (T) -> Map<String, Any?> = { emptyMap() },
        extractMetadata: (T) -> Map<String, String> = { emptyMap() }
    ) {
        // Enable tracking when first used
        DisposableEffect(Unit) {
            if (!isActive) start()
            onDispose { }
        }

        LaunchedEffect(destination) {
            if (!isActive) return@LaunchedEffect

            val destinationName = destination::class.simpleName ?: destination.toString()
            val arguments = try {
                extractArguments(destination)
            } catch (e: Exception) {
                emptyMap()
            }
            val metadata = try {
                extractMetadata(destination)
            } catch (e: Exception) {
                emptyMap()
            }

            AutoMobileSDK.notifyNavigationEvent(
                NavigationEvent(
                    destination = destinationName,
                    source = NavigationSource.COMPOSE_NAVIGATION,
                    arguments = arguments,
                    metadata = metadata
                )
            )
        }
    }

    /**
     * Simplified tracking function that doesn't extract arguments.
     */
    @Composable
    fun <T : NavKey> TrackNavigation(destination: T) {
        TrackNavigation(
            destination = destination,
            extractArguments = { emptyMap() },
            extractMetadata = { emptyMap() }
        )
    }

    /**
     * Manually track a navigation event without using Compose.
     * Useful for tracking navigation in non-Composable contexts.
     *
     * @param destinationName The destination name
     * @param arguments Optional navigation arguments
     * @param metadata Optional metadata
     */
    fun trackManually(
        destinationName: String,
        arguments: Map<String, Any?> = emptyMap(),
        metadata: Map<String, String> = emptyMap()
    ) {
        if (!isActive) start()

        AutoMobileSDK.notifyNavigationEvent(
            NavigationEvent(
                destination = destinationName,
                source = NavigationSource.COMPOSE_NAVIGATION,
                arguments = arguments,
                metadata = metadata
            )
        )
    }
}
