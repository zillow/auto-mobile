package dev.jasonpearson.automobile.sdk.network

import dev.jasonpearson.automobile.protocol.NetworkMockRuleDto
import java.util.concurrent.atomic.AtomicInteger
import org.junit.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertNull

class NetworkMockRuleStoreTest {

  private fun createStore(clock: () -> Long = { 1000L }): NetworkMockRuleStore {
    return NetworkMockRuleStore(clock)
  }

  private fun rule(
      mockId: String = "mock-1",
      host: String = "api\\.example\\.com",
      path: String = "/users",
      method: String = "*",
      limit: Int? = null,
      remaining: Int? = null,
      statusCode: Int = 500,
  ) = NetworkMockRuleDto(
      mockId = mockId,
      host = host,
      path = path,
      method = method,
      limit = limit,
      remaining = remaining,
      statusCode = statusCode,
      responseHeaders = mapOf("X-Mock" to "true"),
      responseBody = """{"error":"mocked"}""",
      contentType = "application/json",
  )

  @Test
  fun `matches rule by host and path`() {
    val store = createStore()
    store.setRules(listOf(rule()))

    val match = store.findMatchingRule("api.example.com", "/users", "GET")
    assertNotNull(match)
    assertEquals("mock-1", match.mockId)
    assertEquals(500, match.statusCode)
  }

  @Test
  fun `returns null when no rules match`() {
    val store = createStore()
    store.setRules(listOf(rule()))

    assertNull(store.findMatchingRule("other.com", "/users", "GET"))
    assertNull(store.findMatchingRule("api.example.com", "/posts", "GET"))
  }

  @Test
  fun `matches regex host pattern`() {
    val store = createStore()
    store.setRules(listOf(rule(host = ".*\\.example\\.com")))

    assertNotNull(store.findMatchingRule("api.example.com", "/users", "GET"))
    assertNotNull(store.findMatchingRule("cdn.example.com", "/users", "GET"))
    assertNull(store.findMatchingRule("other.io", "/users", "GET"))
  }

  @Test
  fun `matches regex path pattern`() {
    val store = createStore()
    store.setRules(listOf(rule(path = "/users/\\d+")))

    assertNotNull(store.findMatchingRule("api.example.com", "/users/123", "GET"))
    assertNull(store.findMatchingRule("api.example.com", "/users/abc", "GET"))
  }

  @Test
  fun `wildcard method matches any method`() {
    val store = createStore()
    store.setRules(listOf(rule(method = "*")))

    assertNotNull(store.findMatchingRule("api.example.com", "/users", "GET"))
    assertNotNull(store.findMatchingRule("api.example.com", "/users", "POST"))
    assertNotNull(store.findMatchingRule("api.example.com", "/users", "DELETE"))
  }

  @Test
  fun `specific method only matches that method`() {
    val store = createStore()
    store.setRules(listOf(rule(method = "POST")))

    assertNotNull(store.findMatchingRule("api.example.com", "/users", "POST"))
    assertNull(store.findMatchingRule("api.example.com", "/users", "GET"))
  }

  @Test
  fun `method matching is case insensitive`() {
    val store = createStore()
    store.setRules(listOf(rule(method = "post")))

    assertNotNull(store.findMatchingRule("api.example.com", "/users", "POST"))
  }

  @Test
  fun `limit decrements remaining and stops matching when exhausted`() {
    val store = createStore()
    store.setRules(listOf(rule(limit = 2, remaining = 2)))

    assertNotNull(store.findMatchingRule("api.example.com", "/users", "GET"))
    assertNotNull(store.findMatchingRule("api.example.com", "/users", "GET"))
    assertNull(store.findMatchingRule("api.example.com", "/users", "GET"))
  }

  @Test
  fun `unlimited rule matches indefinitely`() {
    val store = createStore()
    store.setRules(listOf(rule(limit = null, remaining = null)))

    repeat(100) {
      assertNotNull(store.findMatchingRule("api.example.com", "/users", "GET"))
    }
  }

  @Test
  fun `setRules replaces all rules`() {
    val store = createStore()
    store.setRules(listOf(rule(mockId = "first")))
    assertEquals(1, store.getRuleCount())

    store.setRules(listOf(rule(mockId = "second"), rule(mockId = "third", path = "/posts")))
    assertEquals(2, store.getRuleCount())

    val match = store.findMatchingRule("api.example.com", "/users", "GET")
    assertNotNull(match)
    assertEquals("second", match.mockId)
  }

  @Test
  fun `clear removes all rules`() {
    val store = createStore()
    store.setRules(listOf(rule()))
    store.clear()

    assertEquals(0, store.getRuleCount())
    assertNull(store.findMatchingRule("api.example.com", "/users", "GET"))
  }

  @Test
  fun `skips rules with invalid regex`() {
    val store = createStore()
    store.setRules(listOf(
        rule(mockId = "bad", host = "[invalid"),
        rule(mockId = "good"),
    ))

    assertEquals(1, store.getRuleCount())
    val match = store.findMatchingRule("api.example.com", "/users", "GET")
    assertNotNull(match)
    assertEquals("good", match.mockId)
  }

  @Test
  fun `matched rule includes response data`() {
    val store = createStore()
    store.setRules(listOf(rule()))

    val match = store.findMatchingRule("api.example.com", "/users", "GET")!!
    assertEquals("""{"error":"mocked"}""", match.responseBody)
    assertEquals("application/json", match.contentType)
    assertEquals(mapOf("X-Mock" to "true"), match.responseHeaders)
  }

  // --- Error simulation tests ---

  @Test
  fun `getActiveErrorSimulation returns config when not expired`() {
    val store = createStore(clock = { 1000L })
    store.setErrorSimulation(true, "http500", null, 5000L)

    val sim = store.getActiveErrorSimulation()
    assertNotNull(sim)
    assertEquals("http500", sim.errorType)
  }

  @Test
  fun `getActiveErrorSimulation returns null when expired`() {
    val store = createStore(clock = { 6000L })
    store.setErrorSimulation(true, "http500", null, 5000L)

    assertNull(store.getActiveErrorSimulation())
  }

  @Test
  fun `getActiveErrorSimulation returns null when disabled`() {
    val store = createStore()
    store.setErrorSimulation(false, null, null, null)

    assertNull(store.getActiveErrorSimulation())
  }

  @Test
  fun `error simulation respects limit`() {
    val store = createStore(clock = { 1000L })
    store.setErrorSimulation(true, "timeout", 2, 99999L)

    assertNotNull(store.getActiveErrorSimulation())
    assertNotNull(store.getActiveErrorSimulation())
    assertNull(store.getActiveErrorSimulation())
  }

  @Test
  fun `error simulation without limit works indefinitely`() {
    val store = createStore(clock = { 1000L })
    store.setErrorSimulation(true, "dnsFailure", null, 99999L)

    repeat(50) {
      assertNotNull(store.getActiveErrorSimulation())
    }
  }

  @Test
  fun `clear also clears error simulation`() {
    val store = createStore(clock = { 1000L })
    store.setErrorSimulation(true, "http500", null, 99999L)
    store.clear()

    assertNull(store.getActiveErrorSimulation())
  }

  @Test
  fun `ruleMatcher interface delegates correctly`() {
    val store = createStore(clock = { 1000L })
    store.setRules(listOf(rule()))
    store.setErrorSimulation(true, "timeout", null, 99999L)

    val matcher = store.ruleMatcher
    assertNotNull(matcher.findMatchingRule("api.example.com", "/users", "GET"))
    assertNotNull(matcher.getErrorSimulation())
  }
}
