package dev.jasonpearson.automobile.desktop.core.daemon

import java.time.Instant
import java.time.format.DateTimeParseException
import java.util.LinkedHashMap

interface PerformanceAuditClock {
  fun nowMs(): Long
}

class SystemPerformanceAuditClock : PerformanceAuditClock {
  override fun nowMs(): Long = System.currentTimeMillis()
}

class FakePerformanceAuditClock(initialMs: Long) : PerformanceAuditClock {
  private var nowMs: Long = initialMs

  override fun nowMs(): Long = nowMs

  fun advanceBy(deltaMs: Long) {
    nowMs += deltaMs
  }
}

data class PerformanceAuditStreamFilter(
    val deviceId: String? = null,
    val sessionId: String? = null,
    val packageName: String? = null,
    val timeWindowMs: Long? = null,
)

class PerformanceAuditStreamCache(
    private val clock: PerformanceAuditClock,
    private val maxEntries: Int = DEFAULT_MAX_ENTRIES,
    private val ttlMs: Long = DEFAULT_TTL_MS,
) {
  companion object {
    const val DEFAULT_MAX_ENTRIES = 10_000
    const val DEFAULT_TTL_MS = 5 * 60 * 1000L
  }

  private data class CachedEntry(
      val entry: PerformanceAuditHistoryEntry,
      val timestampMs: Long,
  )

  private val entries = LinkedHashMap<Long, CachedEntry>(16, 0.75f, true)

  @Synchronized
  fun merge(newEntries: List<PerformanceAuditHistoryEntry>) {
    if (newEntries.isEmpty()) {
      return
    }
    for (entry in newEntries) {
      val timestampMs = parseTimestampMs(entry.timestamp)
      entries.remove(entry.id)
      entries[entry.id] = CachedEntry(entry, timestampMs)
    }
    pruneExpiredLocked()
    trimToSizeLocked()
  }

  @Synchronized
  fun snapshot(filter: PerformanceAuditStreamFilter = PerformanceAuditStreamFilter()):
      List<PerformanceAuditHistoryEntry> {
    pruneExpiredLocked()
    val windowMs = filter.timeWindowMs ?: ttlMs
    val cutoff = clock.nowMs() - windowMs
    return entries.values
        .asSequence()
        .filter { it.timestampMs >= cutoff }
        .filter { entryMatchesFilter(it.entry, filter) }
        .sortedWith(compareBy<CachedEntry> { it.timestampMs }.thenBy { it.entry.id })
        .map { it.entry }
        .toList()
  }

  @Synchronized
  fun clear() {
    entries.clear()
  }

  private fun entryMatchesFilter(
      entry: PerformanceAuditHistoryEntry,
      filter: PerformanceAuditStreamFilter,
  ): Boolean {
    if (!filter.deviceId.isNullOrBlank() && entry.deviceId != filter.deviceId) {
      return false
    }
    if (!filter.sessionId.isNullOrBlank() && entry.sessionId != filter.sessionId) {
      return false
    }
    if (!filter.packageName.isNullOrBlank() && entry.packageName != filter.packageName) {
      return false
    }
    return true
  }

  private fun parseTimestampMs(timestamp: String): Long {
    return try {
      Instant.parse(timestamp).toEpochMilli()
    } catch (_: DateTimeParseException) {
      clock.nowMs()
    }
  }

  private fun pruneExpiredLocked() {
    if (entries.isEmpty()) {
      return
    }
    val cutoff = clock.nowMs() - ttlMs
    val iterator = entries.entries.iterator()
    while (iterator.hasNext()) {
      val entry = iterator.next().value
      if (entry.timestampMs < cutoff) {
        iterator.remove()
      }
    }
  }

  private fun trimToSizeLocked() {
    if (entries.size <= maxEntries) {
      return
    }
    val iterator = entries.entries.iterator()
    while (entries.size > maxEntries && iterator.hasNext()) {
      iterator.next()
      iterator.remove()
    }
  }
}

object PerformanceAuditStreamCacheStore {
  val shared = PerformanceAuditStreamCache(SystemPerformanceAuditClock())
}
