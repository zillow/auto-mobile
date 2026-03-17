package dev.jasonpearson.automobile.sdk.events

import dev.jasonpearson.automobile.protocol.SdkCustomEvent
import dev.jasonpearson.automobile.protocol.SdkEvent
import dev.jasonpearson.automobile.protocol.SdkEventBatch
import dev.jasonpearson.automobile.protocol.SdkEventSerializer
import org.junit.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class SdkEventBroadcasterTest {

    private fun makeEvent(name: String): SdkEvent = SdkCustomEvent(
        timestamp = 1000L,
        name = name,
    )

    @Test
    fun `empty events returns empty list`() {
        val batches = SdkEventBroadcaster.splitIntoBatches(emptyList(), "com.example")
        assertTrue(batches.isEmpty())
    }

    @Test
    fun `single small event returns one batch`() {
        val events = listOf(makeEvent("click"))
        val batches = SdkEventBroadcaster.splitIntoBatches(events, "com.example")
        assertEquals(1, batches.size)
        assertTrue(batches[0].contains("click"))
    }

    @Test
    fun `batch under limit returns single json`() {
        val events = (1..5).map { makeEvent("event-$it") }
        val batches = SdkEventBroadcaster.splitIntoBatches(events, "com.example")
        assertEquals(1, batches.size)
    }

    @Test
    fun `batch over limit splits into multiple`() {
        val events = (1..10).map { makeEvent("event-$it") }
        // Use a very small max to force splitting
        val batches = SdkEventBroadcaster.splitIntoBatches(events, "com.example", maxBytes = 200)
        assertTrue(batches.size > 1, "Expected multiple batches, got ${batches.size}")
        // Verify all events are present across all batches
        val allEvents = batches.flatMap { json ->
            (SdkEventSerializer.fromJson(json) as? SdkEventBatch)?.events ?: emptyList()
        }
        assertEquals(10, allEvents.size)
    }

    @Test
    fun `single oversized event sent with null applicationId`() {
        // Create a single event and set maxBytes very small to force the oversized path
        val events = listOf(makeEvent("big-event"))
        val batches = SdkEventBroadcaster.splitIntoBatches(events, "com.example", maxBytes = 10)
        assertEquals(1, batches.size)
        // The oversized single-event batch should have null applicationId
        val parsed = SdkEventSerializer.fromJson(batches[0]) as? SdkEventBatch
        assertEquals(null, parsed?.applicationId)
    }

    @Test
    fun `preserves applicationId in normal batches`() {
        val events = listOf(makeEvent("event-1"))
        val batches = SdkEventBroadcaster.splitIntoBatches(events, "com.example.app")
        val parsed = SdkEventSerializer.fromJson(batches[0]) as? SdkEventBatch
        assertEquals("com.example.app", parsed?.applicationId)
    }

    @Test
    fun `recursive split handles odd number of events`() {
        val events = (1..7).map { makeEvent("event-$it") }
        val batches = SdkEventBroadcaster.splitIntoBatches(events, "com.example", maxBytes = 300)
        val allEvents = batches.flatMap { json ->
            (SdkEventSerializer.fromJson(json) as? SdkEventBatch)?.events ?: emptyList()
        }
        assertEquals(7, allEvents.size, "All 7 events should be present")
    }
}
