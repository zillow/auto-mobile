package dev.jasonpearson.automobile.sdk.events

import dev.jasonpearson.automobile.protocol.SdkEvent
import java.util.concurrent.Executors
import java.util.concurrent.ScheduledExecutorService
import java.util.concurrent.ScheduledFuture
import java.util.concurrent.TimeUnit
import java.util.concurrent.locks.ReentrantLock
import kotlin.concurrent.withLock

/**
 * Thread-safe buffer for SDK events that flushes on capacity or timer.
 *
 * Events are collected and flushed as a batch to reduce Intent broadcast frequency.
 * Flush occurs when [maxBufferSize] is reached or every [flushIntervalMs] milliseconds,
 * whichever comes first.
 *
 * @param maxBufferSize Maximum events before forced flush (default 50)
 * @param flushIntervalMs Periodic flush interval in milliseconds (default 500)
 * @param onFlush Callback invoked with the batch of events to send
 * @param executor Optional executor for periodic flush scheduling (for testing)
 */
class SdkEventBuffer(
  private val maxBufferSize: Int = 50,
  private val flushIntervalMs: Long = 500,
  private val onFlush: (List<SdkEvent>) -> Unit,
  private val executor: ScheduledExecutorService = Executors.newSingleThreadScheduledExecutor { r ->
    Thread(r, "SdkEventBuffer").apply { isDaemon = true }
  },
) {
  private val lock = ReentrantLock()
  private val buffer = mutableListOf<SdkEvent>()
  private var flushTask: ScheduledFuture<*>? = null
  @Volatile private var isShutdown = false

  /** Start the periodic flush timer. */
  fun start() {
    lock.withLock {
      if (flushTask == null && !isShutdown) {
        flushTask = executor.scheduleAtFixedRate(
          { flush() },
          flushIntervalMs,
          flushIntervalMs,
          TimeUnit.MILLISECONDS,
        )
      }
    }
  }

  /** Add an event to the buffer. Flushes immediately if buffer is full. */
  fun add(event: SdkEvent) {
    if (isShutdown) return

    val shouldFlush: Boolean
    val snapshot: List<SdkEvent>

    lock.withLock {
      buffer.add(event)
      if (buffer.size >= maxBufferSize) {
        snapshot = ArrayList(buffer)
        buffer.clear()
        shouldFlush = true
      } else {
        snapshot = emptyList()
        shouldFlush = false
      }
    }

    if (shouldFlush) {
      deliverBatch(snapshot)
    }
  }

  /** Flush any buffered events immediately. */
  fun flush() {
    val snapshot: List<SdkEvent>

    lock.withLock {
      if (buffer.isEmpty()) return
      snapshot = ArrayList(buffer)
      buffer.clear()
    }

    deliverBatch(snapshot)
  }

  /** Shutdown the buffer, flushing remaining events. */
  fun shutdown() {
    isShutdown = true
    flushTask?.cancel(false)
    flush()
    executor.shutdown()
  }

  private fun deliverBatch(events: List<SdkEvent>) {
    if (events.isEmpty()) return
    try {
      onFlush(events)
    } catch (_: Exception) {
      // Swallow exceptions to prevent caller disruption
    }
  }
}
