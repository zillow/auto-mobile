package dev.jasonpearson.automobile.ide.daemon

import java.time.Instant
import org.junit.Assert.assertEquals
import org.junit.Test

class PerformanceAuditStreamCacheTest {

  @Test
  fun `evicts entries past ttl`() {
    val clock = FakePerformanceAuditClock(10_000L)
    val cache = PerformanceAuditStreamCache(clock, maxEntries = 10, ttlMs = 5_000L)

    cache.merge(listOf(entry(id = 1, timestampMs = 1_000L)))
    cache.merge(listOf(entry(id = 2, timestampMs = 9_000L)))

    val snapshot = cache.snapshot()
    assertEquals(listOf(2L), snapshot.map { it.id })
  }

  @Test
  fun `evicts least recently added entries when size limit exceeded`() {
    val clock = FakePerformanceAuditClock(10_000L)
    val cache = PerformanceAuditStreamCache(clock, maxEntries = 2, ttlMs = 60_000L)

    cache.merge(listOf(entry(id = 1, timestampMs = 9_000L)))
    cache.merge(listOf(entry(id = 2, timestampMs = 9_100L)))
    cache.merge(listOf(entry(id = 3, timestampMs = 9_200L)))

    val snapshot = cache.snapshot()
    assertEquals(listOf(2L, 3L), snapshot.map { it.id })
  }

  @Test
  fun `filters entries by session and device`() {
    val clock = FakePerformanceAuditClock(10_000L)
    val cache = PerformanceAuditStreamCache(clock, maxEntries = 10, ttlMs = 60_000L)

    cache.merge(
        listOf(
            entry(id = 1, timestampMs = 9_000L, deviceId = "device-a", sessionId = "s1"),
            entry(id = 2, timestampMs = 9_100L, deviceId = "device-b", sessionId = "s2"),
        )
    )

    val snapshot =
        cache.snapshot(PerformanceAuditStreamFilter(deviceId = "device-b", sessionId = "s2"))
    assertEquals(listOf(2L), snapshot.map { it.id })
  }

  private fun entry(
      id: Long,
      timestampMs: Long,
      deviceId: String = "device",
      sessionId: String = "session",
      packageName: String = "package",
  ): PerformanceAuditHistoryEntry {
    return PerformanceAuditHistoryEntry(
        id = id,
        deviceId = deviceId,
        sessionId = sessionId,
        packageName = packageName,
        timestamp = Instant.ofEpochMilli(timestampMs).toString(),
        passed = true,
        metrics = PerformanceAuditMetrics(),
        diagnostics = null,
    )
  }
}
