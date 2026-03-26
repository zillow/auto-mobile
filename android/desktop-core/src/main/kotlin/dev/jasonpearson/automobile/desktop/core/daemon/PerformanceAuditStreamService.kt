package dev.jasonpearson.automobile.desktop.core.daemon

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
    private val socketClient: PerformanceAuditStreamClient =
        PerformanceAuditStreamSocketClient(),
    private val cache: PerformanceAuditStreamCache = PerformanceAuditStreamCacheStore.shared,
    private val clock: PerformanceAuditClock = SystemPerformanceAuditClock(),
    private val defaultWindowMs: Long = PerformanceAuditStreamCache.DEFAULT_TTL_MS,
    private val defaultLimit: Int = 200,
) {
  private data class FilterKey(
      val deviceId: String?,
      val sessionId: String?,
      val packageName: String?,
  )

  private val cursors = mutableMapOf<FilterKey, PerformanceAuditStreamCursor>()

  fun poll(filter: PerformanceAuditStreamFilter = PerformanceAuditStreamFilter()):
      PerformanceAuditStreamSnapshot {
    val windowMs = filter.timeWindowMs ?: defaultWindowMs
    val startTime = formatTimestamp(clock.nowMs() - windowMs)
    val key = FilterKey(filter.deviceId, filter.sessionId, filter.packageName)
    val cursor = cursors[key] ?: PerformanceAuditStreamCursor()
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

    cursors[key] =
        PerformanceAuditStreamCursor(
            lastTimestamp = response.lastTimestamp ?: cursor.lastTimestamp,
            lastId = response.lastId ?: cursor.lastId,
        )

    return PerformanceAuditStreamSnapshot(
        cache.snapshot(filter.copy(timeWindowMs = windowMs)),
        cursors[key] ?: PerformanceAuditStreamCursor(),
    )
  }

  fun resetCursor() {
    cursors.clear()
  }

  fun resetCursor(filter: PerformanceAuditStreamFilter) {
    val key = FilterKey(filter.deviceId, filter.sessionId, filter.packageName)
    cursors.remove(key)
  }

  private fun formatTimestamp(epochMs: Long): String {
    return Instant.ofEpochMilli(epochMs).toString()
  }
}
