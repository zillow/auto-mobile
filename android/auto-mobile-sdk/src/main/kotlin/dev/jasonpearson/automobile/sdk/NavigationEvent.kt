package dev.jasonpearson.automobile.sdk

/**
 * Represents a navigation event in the application.
 *
 * @property destination The destination identifier (route, screen name, deep link, etc.)
 * @property timestamp When the navigation event occurred
 * @property source The navigation framework that generated this event
 * @property arguments Optional navigation arguments/parameters
 * @property metadata Additional metadata about the navigation event
 */
data class NavigationEvent(
    val destination: String,
    val timestamp: Long = System.currentTimeMillis(),
    val source: NavigationSource,
    val arguments: Map<String, Any?> = emptyMap(),
    val metadata: Map<String, String> = emptyMap(),
)

/** Identifies the source/framework of a navigation event. */
enum class NavigationSource {
  /** Jetpack Navigation Component (XML-based) */
  NAVIGATION_COMPONENT,

  /** Jetpack Compose Navigation */
  COMPOSE_NAVIGATION,

  /** Circuit navigation library */
  CIRCUIT,

  /** Custom or unknown navigation framework */
  CUSTOM,

  /** Deep link navigation */
  DEEP_LINK,

  /** Activity launch */
  ACTIVITY,
}
