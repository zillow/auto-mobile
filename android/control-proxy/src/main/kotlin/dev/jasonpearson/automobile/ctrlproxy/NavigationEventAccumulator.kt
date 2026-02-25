package dev.jasonpearson.automobile.ctrlproxy

import dev.jasonpearson.automobile.sdk.AutoMobileSDK
import dev.jasonpearson.automobile.sdk.NavigationEvent
import java.util.concurrent.CopyOnWriteArrayList
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.serialization.Serializable

/**
 * Data class representing a navigation event with timestamp. Serializable for WebSocket
 * transmission.
 */
@Serializable
data class TimestampedNavigationEvent(
    val destination: String,
    val source: String,
    val arguments: Map<String, String>,
    val metadata: Map<String, String>,
    val timestamp: Long, // System.currentTimeMillis()
    val sequenceNumber: Long, // Monotonically increasing sequence number
    val applicationId: String? = null, // Package name of the app that generated this event
)

/**
 * Accumulates navigation events from AutoMobileSDK and provides them for WebSocket broadcast.
 *
 * This class:
 * - Registers as a listener to AutoMobileSDK navigation events
 * - Stores events with precise timestamps
 * - Maintains a circular buffer of recent events (last 100)
 * - Emits events via StateFlow for reactive consumption
 * - Provides accumulated events since a given timestamp
 */
class NavigationEventAccumulator {
  private val events = CopyOnWriteArrayList<TimestampedNavigationEvent>()
  private var sequenceNumber = 0L
  private val maxEvents = 100 // Keep last 100 events

  // StateFlow for reactive consumption - emits latest event
  private val _latestEvent = MutableStateFlow<TimestampedNavigationEvent?>(null)
  val latestEvent: StateFlow<TimestampedNavigationEvent?> = _latestEvent.asStateFlow()

  // StateFlow for event count - useful for detecting changes
  private val _eventCount = MutableStateFlow(0)
  val eventCount: StateFlow<Int> = _eventCount.asStateFlow()

  /** Initialize and register navigation listener with AutoMobileSDK. */
  fun initialize() {
    AutoMobileSDK.addNavigationListener { event -> onNavigationEvent(event) }
  }

  /** Manually add a navigation event from external sources (e.g., broadcasts). */
  fun addEvent(
      destination: String,
      source: String,
      arguments: Map<String, String>,
      metadata: Map<String, String>,
      applicationId: String? = null,
  ) {
    val timestamp = System.currentTimeMillis()
    val sequence = sequenceNumber++

    val timestampedEvent =
        TimestampedNavigationEvent(
            destination = destination,
            source = source,
            arguments = arguments,
            metadata = metadata,
            timestamp = timestamp,
            sequenceNumber = sequence,
            applicationId = applicationId,
        )

    events.add(timestampedEvent)
    if (events.size > maxEvents) {
      events.removeAt(0)
    }

    _latestEvent.value = timestampedEvent
    _eventCount.value = events.size
  }

  /** Handle incoming navigation event from AutoMobileSDK. */
  private fun onNavigationEvent(event: NavigationEvent) {
    val timestamp = System.currentTimeMillis()
    val sequence = sequenceNumber++

    // Convert NavigationEvent to TimestampedNavigationEvent
    // Convert arguments map to String-keyed map (serialize non-string values)
    val stringArguments =
        event.arguments.mapValues { (_, value) ->
          when (value) {
            null -> "null"
            is String -> value
            is Number -> value.toString()
            is Boolean -> value.toString()
            else -> value.toString()
          }
        }

    val timestampedEvent =
        TimestampedNavigationEvent(
            destination = event.destination,
            source = event.source.name,
            arguments = stringArguments,
            metadata = event.metadata,
            timestamp = timestamp,
            sequenceNumber = sequence,
        )

    // Add to events list
    events.add(timestampedEvent)

    // Maintain circular buffer - remove oldest if exceeds max
    if (events.size > maxEvents) {
      events.removeAt(0)
    }

    // Emit latest event
    _latestEvent.value = timestampedEvent
    _eventCount.value = events.size
  }

  /** Get all accumulated events. */
  fun getAllEvents(): List<TimestampedNavigationEvent> {
    return events.toList()
  }

  /** Get events since a given timestamp (inclusive). */
  fun getEventsSince(sinceTimestamp: Long): List<TimestampedNavigationEvent> {
    return events.filter { it.timestamp >= sinceTimestamp }
  }

  /** Get events since a given sequence number (exclusive). */
  fun getEventsSinceSequence(sinceSequence: Long): List<TimestampedNavigationEvent> {
    return events.filter { it.sequenceNumber > sinceSequence }
  }

  /** Get the most recent N events. */
  fun getRecentEvents(count: Int): List<TimestampedNavigationEvent> {
    val size = events.size
    return if (size <= count) {
      events.toList()
    } else {
      events.subList(size - count, size).toList()
    }
  }

  /** Clear all accumulated events. */
  fun clear() {
    events.clear()
    _latestEvent.value = null
    _eventCount.value = 0
  }

  /** Get current statistics. */
  fun getStats(): NavigationStats {
    return NavigationStats(
        totalEvents = events.size,
        oldestTimestamp = events.firstOrNull()?.timestamp,
        newestTimestamp = events.lastOrNull()?.timestamp,
        currentSequence = sequenceNumber,
    )
  }
}

@Serializable
data class NavigationStats(
    val totalEvents: Int,
    val oldestTimestamp: Long?,
    val newestTimestamp: Long?,
    val currentSequence: Long,
)
