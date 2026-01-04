package dev.jasonpearson.automobile.accessibilityservice

import kotlinx.coroutines.cancel
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.runTest
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/**
 * Unit tests for WebSocketServer that verify basic functionality:
 * - Server lifecycle (start/stop)
 * - Server state management
 *
 * Note: Full integration tests with actual network I/O are in WebSocketServerIntegrationTest
 */
@RunWith(RobolectricTestRunner::class)
class WebSocketServerTest {

    private lateinit var server: WebSocketServer
    private lateinit var testScope: TestScope

    @Before
    fun setUp() {
        testScope = TestScope()
        // Use port 0 to let OS assign an available port, avoiding conflicts when tests run in parallel
        server = WebSocketServer(port = 0, scope = testScope)
    }

    @After
    fun tearDown() {
        if (server.isRunning()) {
            server.stop()
        }
        testScope.cancel()
    }

    @Test
    fun `server starts successfully`() = runTest {
        // Given
        assertFalse("Server should not be running initially", server.isRunning())

        // When
        server.start()

        // Then
        assertTrue("Server should be running", server.isRunning())
        assertEquals("Should have no connections initially", 0, server.getConnectionCount())
    }

    @Test
    fun `server stops successfully`() = runTest {
        // Given
        server.start()
        assertTrue(server.isRunning())

        // When
        server.stop()

        // Then
        assertFalse("Server should be stopped", server.isRunning())
    }

    @Test
    fun `server does not start twice`() = runTest {
        // Given
        server.start()

        // When - try to start again
        server.start()

        // Then - should still be running normally
        assertTrue("Server should still be running", server.isRunning())
    }

    @Test
    fun `server connection count starts at zero`() = runTest {
        // Given
        server.start()

        // Then
        assertEquals("Connection count should start at 0", 0, server.getConnectionCount())
    }

    @Test
    fun `server can be created with custom port`() = runTest {
        // Given
        val customPort = 9999
        val customServer = WebSocketServer(port = customPort, scope = testScope)

        // When
        customServer.start()

        // Then
        assertTrue("Custom server should be running", customServer.isRunning())

        // Cleanup
        customServer.stop()
    }
}
