package dev.jasonpearson.automobile.sdk.events

import dev.jasonpearson.automobile.protocol.SdkCustomEvent
import dev.jasonpearson.automobile.protocol.SdkEvent
import dev.jasonpearson.automobile.protocol.SdkLogEvent
import dev.jasonpearson.automobile.protocol.SdkNetworkRequestEvent
import org.junit.Test
import java.util.concurrent.CopyOnWriteArrayList
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class SdkEventBufferTest {

  private fun makeEvent(i: Int): SdkEvent = SdkCustomEvent(
    timestamp = i.toLong(),
    name = "event-$i",
  )

  @Test
  fun `flush on capacity`() {
    val flushed = mutableListOf<List<SdkEvent>>()
    val buffer = SdkEventBuffer(
      maxBufferSize = 3,
      flushIntervalMs = 60_000, // Very long so timer won't fire
      onFlush = { flushed.add(it) },
      executor = Executors.newSingleThreadScheduledExecutor(),
    )

    buffer.add(makeEvent(1))
    buffer.add(makeEvent(2))
    assertEquals(0, flushed.size, "Should not flush before capacity")

    buffer.add(makeEvent(3))
    assertEquals(1, flushed.size, "Should flush at capacity")
    assertEquals(3, flushed[0].size)
  }

  @Test
  fun `manual flush`() {
    val flushed = mutableListOf<List<SdkEvent>>()
    val buffer = SdkEventBuffer(
      maxBufferSize = 100,
      flushIntervalMs = 60_000,
      onFlush = { flushed.add(it) },
      executor = Executors.newSingleThreadScheduledExecutor(),
    )

    buffer.add(makeEvent(1))
    buffer.add(makeEvent(2))
    buffer.flush()

    assertEquals(1, flushed.size)
    assertEquals(2, flushed[0].size)
  }

  @Test
  fun `flush is no-op when empty`() {
    val flushed = mutableListOf<List<SdkEvent>>()
    val buffer = SdkEventBuffer(
      maxBufferSize = 100,
      flushIntervalMs = 60_000,
      onFlush = { flushed.add(it) },
      executor = Executors.newSingleThreadScheduledExecutor(),
    )

    buffer.flush()
    assertEquals(0, flushed.size)
  }

  @Test
  fun `shutdown flushes remaining events`() {
    val flushed = mutableListOf<List<SdkEvent>>()
    val buffer = SdkEventBuffer(
      maxBufferSize = 100,
      flushIntervalMs = 60_000,
      onFlush = { flushed.add(it) },
      executor = Executors.newSingleThreadScheduledExecutor(),
    )

    buffer.add(makeEvent(1))
    buffer.add(makeEvent(2))
    buffer.shutdown()

    assertEquals(1, flushed.size)
    assertEquals(2, flushed[0].size)
  }

  @Test
  fun `add after shutdown is ignored`() {
    val flushed = mutableListOf<List<SdkEvent>>()
    val buffer = SdkEventBuffer(
      maxBufferSize = 100,
      flushIntervalMs = 60_000,
      onFlush = { flushed.add(it) },
      executor = Executors.newSingleThreadScheduledExecutor(),
    )

    buffer.shutdown()
    buffer.add(makeEvent(1))

    // Only the shutdown flush, which was empty
    assertEquals(0, flushed.size)
  }

  @Test
  fun `thread safety - concurrent adds`() {
    val flushed = CopyOnWriteArrayList<List<SdkEvent>>()
    val buffer = SdkEventBuffer(
      maxBufferSize = 50,
      flushIntervalMs = 60_000,
      onFlush = { flushed.add(ArrayList(it)) },
      executor = Executors.newSingleThreadScheduledExecutor(),
    )

    val latch = CountDownLatch(1)
    val threads = (1..10).map { threadNum ->
      Thread {
        latch.await()
        for (i in 1..10) {
          buffer.add(makeEvent(threadNum * 100 + i))
        }
      }
    }

    threads.forEach { it.start() }
    latch.countDown()
    threads.forEach { it.join(5000) }
    buffer.flush()

    val totalEvents = flushed.sumOf { it.size }
    assertEquals(100, totalEvents, "All 100 events should be flushed")
  }

  @Test
  fun `onFlush exceptions are swallowed`() {
    var callCount = 0
    val buffer = SdkEventBuffer(
      maxBufferSize = 2,
      flushIntervalMs = 60_000,
      onFlush = {
        callCount++
        if (callCount == 1) throw RuntimeException("test error")
      },
      executor = Executors.newSingleThreadScheduledExecutor(),
    )

    // First flush throws but doesn't crash
    buffer.add(makeEvent(1))
    buffer.add(makeEvent(2))

    // Second flush succeeds
    buffer.add(makeEvent(3))
    buffer.add(makeEvent(4))

    assertEquals(2, callCount)
  }
}
