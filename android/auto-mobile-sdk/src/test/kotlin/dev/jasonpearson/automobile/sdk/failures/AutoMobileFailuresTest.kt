package dev.jasonpearson.automobile.sdk.failures

import org.junit.After
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test

class AutoMobileFailuresTest {

    @Before
    fun setup() {
        // Clear events before each test
        AutoMobileFailures.clearEvents()
    }

    @After
    fun tearDown() {
        // Clean up after each test
        AutoMobileFailures.clearEvents()
    }

    @Test
    fun `getEventCount should return zero when no events recorded`() {
        assertEquals(0, AutoMobileFailures.getEventCount())
    }

    @Test
    fun `getRecentEvents should return empty list when no events recorded`() {
        assertTrue(AutoMobileFailures.getRecentEvents().isEmpty())
    }

    @Test
    fun `clearEvents should reset event count to zero`() {
        // Even without context, clearEvents should work
        AutoMobileFailures.clearEvents()
        assertEquals(0, AutoMobileFailures.getEventCount())
    }

    @Test
    fun `recordHandledException should not crash when context not initialized`() {
        // This should not throw an exception, just log a warning
        val exception = NullPointerException("Test exception")
        AutoMobileFailures.recordHandledException(exception)

        // No events should be recorded since context is null
        assertEquals(0, AutoMobileFailures.getEventCount())
    }

    @Test
    fun `recordHandledException with message should not crash when context not initialized`() {
        val exception = IllegalArgumentException("Test exception")
        AutoMobileFailures.recordHandledException(exception, "Custom message")

        assertEquals(0, AutoMobileFailures.getEventCount())
    }

    @Test
    fun `recordHandledException with screen should not crash when context not initialized`() {
        val exception = RuntimeException("Test exception")
        AutoMobileFailures.recordHandledException(exception, "Custom message", "TestScreen")

        assertEquals(0, AutoMobileFailures.getEventCount())
    }

    @Test
    fun `constants should have correct values`() {
        assertEquals(
            "dev.jasonpearson.automobile.sdk.HANDLED_EXCEPTION",
            AutoMobileFailures.ACTION_HANDLED_EXCEPTION,
        )
        assertEquals("timestamp", AutoMobileFailures.EXTRA_TIMESTAMP)
        assertEquals("exception_class", AutoMobileFailures.EXTRA_EXCEPTION_CLASS)
        assertEquals("exception_message", AutoMobileFailures.EXTRA_EXCEPTION_MESSAGE)
        assertEquals("stack_trace", AutoMobileFailures.EXTRA_STACK_TRACE)
        assertEquals("custom_message", AutoMobileFailures.EXTRA_CUSTOM_MESSAGE)
        assertEquals("current_screen", AutoMobileFailures.EXTRA_CURRENT_SCREEN)
        assertEquals("package_name", AutoMobileFailures.EXTRA_PACKAGE_NAME)
        assertEquals("app_version", AutoMobileFailures.EXTRA_APP_VERSION)
        assertEquals("device_model", AutoMobileFailures.EXTRA_DEVICE_MODEL)
        assertEquals("device_manufacturer", AutoMobileFailures.EXTRA_DEVICE_MANUFACTURER)
        assertEquals("os_version", AutoMobileFailures.EXTRA_OS_VERSION)
        assertEquals("sdk_int", AutoMobileFailures.EXTRA_SDK_INT)
    }
}
