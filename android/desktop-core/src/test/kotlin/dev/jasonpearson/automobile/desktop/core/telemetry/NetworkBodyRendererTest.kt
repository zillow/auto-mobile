package dev.jasonpearson.automobile.desktop.core.telemetry

import org.junit.Assert.assertEquals
import org.junit.Test

class NetworkBodyRendererTest {

    @Test
    fun `formatByteSize formats bytes`() {
        assertEquals("0 B", formatByteSize(0))
        assertEquals("512 B", formatByteSize(512))
        assertEquals("1023 B", formatByteSize(1023))
    }

    @Test
    fun `formatByteSize formats kilobytes`() {
        assertEquals("1.0 kB", formatByteSize(1024))
        assertEquals("5.8 kB", formatByteSize(5939))
    }

    @Test
    fun `formatByteSize formats megabytes`() {
        assertEquals("1.0 MB", formatByteSize(1024 * 1024))
        assertEquals("2.5 MB", formatByteSize((2.5 * 1024 * 1024).toLong()))
    }

    @Test
    fun `formatByteSize handles negative (unknown)`() {
        assertEquals("unknown", formatByteSize(-1))
    }
}
