# AutoMobile SDK

Android library SDK for tracking navigation events across various navigation frameworks including Navigation3, Jetpack Compose Navigation, Circuit, and custom solutions.

## Features

- Universal navigation event tracking across multiple frameworks
- Navigation3 (androidx.navigation3) support
- Circuit navigation support
- Manual tracking for custom navigation solutions
- Simple listener-based API
- Maven Central publishing ready

## Installation

### Gradle (Kotlin DSL)

```kotlin
dependencies {
    implementation("dev.jasonpearson.auto-mobile:auto-mobile-sdk:0.0.1-SNAPSHOT")
}
```

### Gradle (Groovy DSL)

```groovy
dependencies {
    implementation 'dev.jasonpearson.auto-mobile:auto-mobile-sdk:0.0.1-SNAPSHOT'
}
```

## Usage

### Navigation3 Integration

For apps using androidx.navigation3, add tracking calls in your `NavDisplay` entry providers:

```kotlin
@Composable
fun AppNavigation() {
    val backStack = rememberNavBackStack(startDestination)

    // Register a navigation listener
    LaunchedEffect(Unit) {
        AutoMobileSDK.addNavigationListener { event ->
            Log.d("Navigation", "Navigated to: ${event.destination}")
            // Handle navigation event
        }
    }

    NavDisplay(
        backStack = backStack,
        onBack = { backStack.removeLastOrNull() },
        entryProvider = entryProvider {
            entry<HomeDestination> { homeDestination ->
                // Track navigation with arguments extraction
                Navigation3Adapter.TrackNavigation(
                    destination = homeDestination,
                    extractArguments = {
                        mapOf(
                            "selectedTab" to it.selectedTab,
                            "selectedSubTab" to it.selectedSubTab
                        )
                    }
                )

                HomeScreen(...)
            }

            entry<SettingsDestination> { destination ->
                // Simple tracking without arguments
                Navigation3Adapter.TrackNavigation(destination)

                SettingsScreen(...)
            }
        }
    )
}
```

### Circuit Integration

For Circuit navigation, use manual tracking:

```kotlin
// When navigating in Circuit
CircuitAdapter.trackNavigation(
    destination = "ProfileScreen",
    arguments = mapOf("userId" to userId)
)
```

### Manual Tracking

For custom navigation solutions:

```kotlin
// Start tracking
Navigation3Adapter.start()

// Track navigation manually
Navigation3Adapter.trackManually(
    destinationName = "CustomScreen",
    arguments = mapOf("param1" to "value1"),
    metadata = mapOf("transition" to "slide")
)

// Stop tracking
Navigation3Adapter.stop()
```

## API Reference

### AutoMobileSDK

Main SDK class for registering navigation listeners.

```kotlin
// Add a navigation listener
AutoMobileSDK.addNavigationListener { event ->
    // Handle navigation event
}

// Remove a specific listener
AutoMobileSDK.removeNavigationListener(listener)

// Clear all listeners
AutoMobileSDK.clearNavigationListeners()

// Enable/disable tracking
AutoMobileSDK.setEnabled(true)

// Check if tracking is enabled
val isEnabled = AutoMobileSDK.isEnabled()

// Get listener count
val count = AutoMobileSDK.getListenerCount()
```

### NavigationEvent

Data class representing a navigation event:

```kotlin
data class NavigationEvent(
    val destination: String,              // Destination name/route
    val timestamp: Long,                  // Event timestamp
    val source: NavigationSource,         // Navigation framework source
    val arguments: Map<String, Any?>,     // Navigation arguments
    val metadata: Map<String, String>     // Additional metadata
)
```

### NavigationSource

Enum identifying the navigation framework:

```kotlin
enum class NavigationSource {
    NAVIGATION_COMPONENT,  // XML-based Navigation Component
    COMPOSE_NAVIGATION,    // Compose/Navigation3
    CIRCUIT,               // Circuit navigation
    CUSTOM,                // Custom navigation
    DEEP_LINK,            // Deep link navigation
    ACTIVITY              // Activity launch
}
```

## Example: Analytics Integration

```kotlin
@Composable
fun AppNavigation() {
    val analyticsTracker = remember { AnalyticsTracker.getInstance() }

    LaunchedEffect(Unit) {
        AutoMobileSDK.addNavigationListener { event ->
            // Track to analytics
            analyticsTracker.trackScreenView(
                screenName = event.destination,
                parameters = event.arguments
            )

            // Log navigation for debugging
            Log.d("Navigation",
                "Screen: ${event.destination}, " +
                "Source: ${event.source}, " +
                "Args: ${event.arguments}"
            )
        }
    }

    // ... rest of navigation setup
}
```

## Example: Testing Integration

```kotlin
class NavigationTest {
    @Before
    fun setup() {
        AutoMobileSDK.clearNavigationListeners()
        AutoMobileSDK.setEnabled(true)
    }

    @Test
    fun `navigation events are tracked`() {
        val events = mutableListOf<NavigationEvent>()

        AutoMobileSDK.addNavigationListener { event ->
            events.add(event)
        }

        // Trigger navigation
        Navigation3Adapter.trackManually("TestScreen")

        // Verify
        assertEquals(1, events.size)
        assertEquals("TestScreen", events[0].destination)
    }
}
```

## Building from Source

```bash
cd android
./gradlew :auto-mobile-sdk:build
```

## Running Tests

```bash
./gradlew :auto-mobile-sdk:test
```

## Publishing

```bash
./gradlew :auto-mobile-sdk:publishToMavenCentral
```

## License

Apache License 2.0

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
