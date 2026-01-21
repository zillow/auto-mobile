package dev.jasonpearson.automobile.ide.daemon

import java.time.Instant

data class PerformanceAuditStreamCursor(
    val lastTimestamp: String? = null,
    val lastId: Long? = null,
)

data class PerformanceAuditStreamSnapshot(
    val results: List<PerformanceAuditHistoryEntry>,
    val cursor: PerformanceAuditStreamCursor,
)

class PerformanceAuditStreamService(
    private val socketClient: PerformanceAuditStreamSocketClient =
        PerformanceAuditStreamSocketClient(),
    private val cache: PerformanceAuditStreamCache = PerformanceAuditStreamCacheStore.shared,
    private val clock: PerformanceAuditClock = SystemPerformanceAuditClock(),
    private val defaultWindowMs: Long = PerformanceAuditStreamCache.DEFAULT_TTL_MS,
    private val defaultLimit: Int = 200,
) {
  private var cursor = PerformanceAuditStreamCursor()

  fun poll(filter: PerformanceAuditStreamFilter = PerformanceAuditStreamFilter()):
      PerformanceAuditStreamSnapshot {
    val windowMs = filter.timeWindowMs ?: defaultWindowMs
    val startTime = formatTimestamp(clock.nowMs() - windowMs)
    val response =
        socketClient.poll(
            PerformanceAuditStreamRequest(
                sinceTimestamp = cursor.lastTimestamp,
                sinceId = cursor.lastId,
                startTime = startTime,
                endTime = null,
                limit = defaultLimit,
                deviceId = filter.deviceId,
                sessionId = filter.sessionId,
                packageName = filter.packageName,
            )
        )

    if (response.results.isNotEmpty()) {
      cache.merge(response.results)
    }

    cursor =
        PerformanceAuditStreamCursor(
            lastTimestamp = response.lastTimestamp ?: cursor.lastTimestamp,
            lastId = response.lastId ?: cursor.lastId,
        )

    return PerformanceAuditStreamSnapshot(cache.snapshot(filter.copy(timeWindowMs = windowMs)), cursor)
  }

  fun resetCursor() {
    cursor = PerformanceAuditStreamCursor()
  }

  private fun formatTimestamp(epochMs: Long): String {
    return Instant.ofEpochMilli(epochMs).toString()
  }
}
