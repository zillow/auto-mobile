package dev.jasonpearson.automobile.ide.failures

import dev.jasonpearson.automobile.ide.time.FakeClock
import org.junit.Assert.assertEquals
import org.junit.Test

class FailuresDashboardTest {

    @Test
    fun `formatTimeAgo returns Just now for timestamps less than 1 minute ago`() {
        val clock = FakeClock(100_000L) // Current time is 100 seconds
        val timestamp = 50_000L // 50 seconds ago
        assertEquals("Just now", formatTimeAgo(timestamp, clock))
    }

    @Test
    fun `formatTimeAgo returns minutes for timestamps less than 1 hour ago`() {
        val clock = FakeClock(1800_000L) // Current time is 30 minutes in ms
        val timestamp = 0L // 30 minutes ago
        assertEquals("30m ago", formatTimeAgo(timestamp, clock))
    }

    @Test
    fun `formatTimeAgo returns hours for timestamps less than 24 hours ago`() {
        val clock = FakeClock(7200_000L) // 2 hours in ms
        val timestamp = 0L // 2 hours ago
        assertEquals("2h ago", formatTimeAgo(timestamp, clock))
    }

    @Test
    fun `formatTimeAgo returns days for timestamps more than 24 hours ago`() {
        val clock = FakeClock(172800_000L) // 48 hours in ms (2 days)
        val timestamp = 0L // 2 days ago
        assertEquals("2d ago", formatTimeAgo(timestamp, clock))
    }

    @Test
    fun `formatTimeAgo returns Just now for timestamp exactly at current time`() {
        val clock = FakeClock(100_000L)
        val timestamp = 100_000L // 0 seconds ago
        assertEquals("Just now", formatTimeAgo(timestamp, clock))
    }

    @Test
    fun `formatTimeAgo returns 1m ago at exactly 60 seconds`() {
        val clock = FakeClock(60_000L)
        val timestamp = 0L // 60 seconds ago
        assertEquals("1m ago", formatTimeAgo(timestamp, clock))
    }

    @Test
    fun `formatTimeAgo returns 1h ago at exactly 60 minutes`() {
        // At exactly 60 minutes (3600_000ms), diff is NOT < 3600_000, so it returns hours
        val clock = FakeClock(3600_000L)
        val timestamp = 0L // exactly 60 minutes ago
        assertEquals("1h ago", formatTimeAgo(timestamp, clock))
    }

    @Test
    fun `formatTimeAgo returns 1d ago at exactly 24 hours`() {
        // At exactly 24 hours (86400_000ms), diff is NOT < 86400_000, so it returns days
        val clock = FakeClock(86400_000L)
        val timestamp = 0L // exactly 24 hours ago
        assertEquals("1d ago", formatTimeAgo(timestamp, clock))
    }
}
