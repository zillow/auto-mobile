package dev.jasonpearson.automobile.ide.daemon

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class PerformanceAuditStreamServiceTest {

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
    val service =
        PerformanceAuditStreamService(
            socketClient = client,
            cache = cache,
            clock = clock,
            defaultWindowMs = 300_000L,
            defaultLimit = 10,
        )

    service.poll(PerformanceAuditStreamFilter(deviceId = "device-a"))
    service.poll(PerformanceAuditStreamFilter(deviceId = "device-b"))

    val firstRequest = client.requests[0]
    val secondRequest = client.requests[1]

    assertEquals("device-a", firstRequest.deviceId)
    assertNull(firstRequest.sinceTimestamp)
    assertEquals("device-b", secondRequest.deviceId)
    assertNull(secondRequest.sinceTimestamp)
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
