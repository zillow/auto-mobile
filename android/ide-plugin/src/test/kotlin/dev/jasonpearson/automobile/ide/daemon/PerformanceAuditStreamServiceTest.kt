package dev.jasonpearson.automobile.ide.daemon

import java.time.Instant
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class PerformanceAuditStreamServiceTest {

  @Test
  fun `poll returns cached results from snapshot`() {
    val clock = FakePerformanceAuditClock(10_000L)
    val cache = PerformanceAuditStreamCache(clock, maxEntries = 10, ttlMs = 300_000L)
    val entry = entry(id = 1, timestampMs = 9_000L)
    val client = FakePerformanceAuditStreamClient(
        listOf(
            PerformanceAuditStreamResponse(
                success = true,
                results = listOf(entry),
                lastTimestamp = "2024-01-01T00:00:09Z",
                lastId = 1L,
            ),
        )
    )
    val service = createService(client, cache, clock)

    val snapshot = service.poll()

    assertEquals(1, snapshot.results.size)
    assertEquals(1L, snapshot.results[0].id)
  }

  @Test
  fun `poll updates cursor after receiving results`() {
    val clock = FakePerformanceAuditClock(10_000L)
    val cache = PerformanceAuditStreamCache(clock, maxEntries = 10, ttlMs = 300_000L)
    val client = FakePerformanceAuditStreamClient(
        listOf(
            PerformanceAuditStreamResponse(
                success = true,
                results = listOf(entry(id = 1, timestampMs = 9_000L)),
                lastTimestamp = "2024-01-01T00:00:09Z",
                lastId = 1L,
            ),
        )
    )
    val service = createService(client, cache, clock)

    val snapshot = service.poll()

    assertEquals("2024-01-01T00:00:09Z", snapshot.cursor.lastTimestamp)
    assertEquals(1L, snapshot.cursor.lastId)
  }

  @Test
  fun `poll sends cursor in subsequent requests`() {
    val clock = FakePerformanceAuditClock(10_000L)
    val cache = PerformanceAuditStreamCache(clock, maxEntries = 10, ttlMs = 300_000L)
    val client = FakePerformanceAuditStreamClient(
        listOf(
            PerformanceAuditStreamResponse(
                success = true,
                results = listOf(entry(id = 1, timestampMs = 9_000L)),
                lastTimestamp = "2024-01-01T00:00:09Z",
                lastId = 1L,
            ),
            PerformanceAuditStreamResponse(
                success = true,
                results = listOf(entry(id = 2, timestampMs = 9_500L)),
                lastTimestamp = "2024-01-01T00:00:09.500Z",
                lastId = 2L,
            ),
        )
    )
    val service = createService(client, cache, clock)

    service.poll()
    service.poll()

    val firstRequest = client.requests[0]
    val secondRequest = client.requests[1]

    assertNull(firstRequest.sinceTimestamp)
    assertNull(firstRequest.sinceId)
    assertEquals("2024-01-01T00:00:09Z", secondRequest.sinceTimestamp)
    assertEquals(1L, secondRequest.sinceId)
  }

  @Test
  fun `resetCursor clears all cursors`() {
    val clock = FakePerformanceAuditClock(10_000L)
    val cache = PerformanceAuditStreamCache(clock, maxEntries = 10, ttlMs = 300_000L)
    val client = FakePerformanceAuditStreamClient(
        listOf(
            PerformanceAuditStreamResponse(
                success = true,
                results = emptyList(),
                lastTimestamp = "2024-01-01T00:00:10Z",
                lastId = 10L,
            ),
        )
    )
    val service = createService(client, cache, clock)

    service.poll(PerformanceAuditStreamFilter(deviceId = "device-a"))
    service.poll(PerformanceAuditStreamFilter(deviceId = "device-b"))
    service.resetCursor()
    service.poll(PerformanceAuditStreamFilter(deviceId = "device-a"))
    service.poll(PerformanceAuditStreamFilter(deviceId = "device-b"))

    val thirdRequest = client.requests[2]
    val fourthRequest = client.requests[3]

    assertNull(thirdRequest.sinceTimestamp)
    assertNull(thirdRequest.sinceId)
    assertNull(fourthRequest.sinceTimestamp)
    assertNull(fourthRequest.sinceId)
  }

  @Test
  fun `resetCursor with filter clears only that filter's cursor`() {
    val clock = FakePerformanceAuditClock(10_000L)
    val cache = PerformanceAuditStreamCache(clock, maxEntries = 10, ttlMs = 300_000L)
    val client = FakePerformanceAuditStreamClient(
        listOf(
            PerformanceAuditStreamResponse(
                success = true,
                results = emptyList(),
                lastTimestamp = "2024-01-01T00:00:10Z",
                lastId = 10L,
            ),
            PerformanceAuditStreamResponse(
                success = true,
                results = emptyList(),
                lastTimestamp = "2024-01-01T00:00:12Z",
                lastId = 12L,
            ),
        )
    )
    val service = createService(client, cache, clock)

    service.poll(PerformanceAuditStreamFilter(deviceId = "device-a"))
    service.poll(PerformanceAuditStreamFilter(deviceId = "device-b"))
    service.resetCursor(PerformanceAuditStreamFilter(deviceId = "device-a"))
    service.poll(PerformanceAuditStreamFilter(deviceId = "device-a"))
    service.poll(PerformanceAuditStreamFilter(deviceId = "device-b"))

    val thirdRequest = client.requests[2]
    val fourthRequest = client.requests[3]

    // device-a cursor was reset, so no cursor sent
    assertNull(thirdRequest.sinceTimestamp)
    assertNull(thirdRequest.sinceId)
    // device-b cursor was NOT reset, so cursor should be sent
    assertEquals("2024-01-01T00:00:12Z", fourthRequest.sinceTimestamp)
    assertEquals(12L, fourthRequest.sinceId)
  }

  @Test
  fun `poll uses correct time window based on filter`() {
    val clock = FakePerformanceAuditClock(600_000L)
    val cache = PerformanceAuditStreamCache(clock, maxEntries = 10, ttlMs = 600_000L)
    val client = FakePerformanceAuditStreamClient(
        listOf(
            PerformanceAuditStreamResponse(
                success = true,
                results = emptyList(),
                lastTimestamp = null,
                lastId = null,
            ),
        )
    )
    val service = createService(client, cache, clock, defaultWindowMs = 300_000L)

    // Poll with custom time window
    service.poll(PerformanceAuditStreamFilter(timeWindowMs = 60_000L))

    val request = client.requests[0]

    // startTime should be clock.nowMs() - timeWindowMs = 600_000 - 60_000 = 540_000ms
    // which is 540 seconds = 9 minutes from epoch
    val expectedStartTime = Instant.ofEpochMilli(540_000L).toString()
    assertEquals(expectedStartTime, request.startTime)
  }

  @Test
  fun `poll uses default time window when filter has no timeWindowMs`() {
    val clock = FakePerformanceAuditClock(600_000L)
    val cache = PerformanceAuditStreamCache(clock, maxEntries = 10, ttlMs = 600_000L)
    val client = FakePerformanceAuditStreamClient(
        listOf(
            PerformanceAuditStreamResponse(
                success = true,
                results = emptyList(),
                lastTimestamp = null,
                lastId = null,
            ),
        )
    )
    val defaultWindowMs = 300_000L
    val service = createService(client, cache, clock, defaultWindowMs = defaultWindowMs)

    service.poll()

    val request = client.requests[0]

    // startTime should be clock.nowMs() - defaultWindowMs = 600_000 - 300_000 = 300_000ms
    val expectedStartTime = Instant.ofEpochMilli(300_000L).toString()
    assertEquals(expectedStartTime, request.startTime)
  }

  @Test
  fun `uses separate cursor per filter key`() {
    val clock = FakePerformanceAuditClock(10_000L)
    val cache = PerformanceAuditStreamCache(clock, maxEntries = 10, ttlMs = 300_000L)
    val client = FakePerformanceAuditStreamClient(
        listOf(
            PerformanceAuditStreamResponse(
                success = true,
                results = emptyList(),
                lastTimestamp = "2024-01-01T00:00:10Z",
                lastId = 10L,
            ),
            PerformanceAuditStreamResponse(
                success = true,
                results = emptyList(),
                lastTimestamp = "2024-01-01T00:00:12Z",
                lastId = 12L,
            ),
        )
    )
    val service = createService(client, cache, clock)

    service.poll(PerformanceAuditStreamFilter(deviceId = "device-a"))
    service.poll(PerformanceAuditStreamFilter(deviceId = "device-b"))

    val firstRequest = client.requests[0]
    val secondRequest = client.requests[1]

    assertEquals("device-a", firstRequest.deviceId)
    assertNull(firstRequest.sinceTimestamp)
    assertEquals("device-b", secondRequest.deviceId)
    assertNull(secondRequest.sinceTimestamp)
  }

  @Test
  fun `poll merges results into cache`() {
    val clock = FakePerformanceAuditClock(10_000L)
    val cache = PerformanceAuditStreamCache(clock, maxEntries = 10, ttlMs = 300_000L)
    val client = FakePerformanceAuditStreamClient(
        listOf(
            PerformanceAuditStreamResponse(
                success = true,
                results = listOf(entry(id = 1, timestampMs = 9_000L)),
                lastTimestamp = "2024-01-01T00:00:09Z",
                lastId = 1L,
            ),
            PerformanceAuditStreamResponse(
                success = true,
                results = listOf(entry(id = 2, timestampMs = 9_500L)),
                lastTimestamp = "2024-01-01T00:00:09.500Z",
                lastId = 2L,
            ),
        )
    )
    val service = createService(client, cache, clock)

    service.poll()
    val snapshot = service.poll()

    // Both entries should be in cache and returned
    assertEquals(2, snapshot.results.size)
    assertTrue(snapshot.results.any { it.id == 1L })
    assertTrue(snapshot.results.any { it.id == 2L })
  }

  private fun createService(
      client: FakePerformanceAuditStreamClient,
      cache: PerformanceAuditStreamCache,
      clock: FakePerformanceAuditClock,
      defaultWindowMs: Long = 300_000L,
      defaultLimit: Int = 10,
  ): PerformanceAuditStreamService {
    return PerformanceAuditStreamService(
        socketClient = client,
        cache = cache,
        clock = clock,
        defaultWindowMs = defaultWindowMs,
        defaultLimit = defaultLimit,
    )
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

  private class FakePerformanceAuditStreamClient(
      private val responses: List<PerformanceAuditStreamResponse>,
  ) : PerformanceAuditStreamClient {
    val requests = mutableListOf<PerformanceAuditStreamRequest>()
    private var index = 0

    override fun poll(request: PerformanceAuditStreamRequest): PerformanceAuditStreamResponse {
      requests.add(request)
      val response = responses.getOrNull(index) ?: responses.last()
      index += 1
      return response
    }
  }
}
