package dev.jasonpearson.automobile.desktop.core.mcp

import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import org.junit.Test

class McpProcessDetectorTest {

    private val timeProvider = FakeTimeProvider(currentTime = 1_700_000_000_000L)

    @Test
    fun parseProcessLineExtractsPidAndCommand() {
        val detector = RealMcpProcessDetector(
            timeProvider = timeProvider,
            processRunner = FakeProcessRunner(),
            socketFileChecker = FakeSocketFileChecker(),
        )
        val line = "97956 Wed Jan 22 11:00:00 2025 bun /path/to/auto-mobile --daemon-mode"
        val info = detector.parseProcessLine(line)

        assertNotNull(info)
        assertEquals(97956, info.pid)
        assertEquals("auto-mobile", info.name)
    }

    @Test
    fun parseProcessLineReturnsNullForShortLine() {
        val detector = RealMcpProcessDetector(
            timeProvider = timeProvider,
            processRunner = FakeProcessRunner(),
            socketFileChecker = FakeSocketFileChecker(),
        )
        val info = detector.parseProcessLine("123 short")
        assertNull(info)
    }

    @Test
    fun parseProcessLineReturnsNullForNonNumericPid() {
        val detector = RealMcpProcessDetector(
            timeProvider = timeProvider,
            processRunner = FakeProcessRunner(),
            socketFileChecker = FakeSocketFileChecker(),
        )
        val info = detector.parseProcessLine("abc Wed Jan 22 11:00:00 2025 bun /path/to/auto-mobile")
        assertNull(info)
    }

    @Test
    fun extractProcessNameRecognizesDaemon() {
        val detector = RealMcpProcessDetector(
            timeProvider = timeProvider,
            processRunner = FakeProcessRunner(),
            socketFileChecker = FakeSocketFileChecker(),
        )
        assertEquals("auto-mobile-daemon", detector.extractProcessName("bun /path/to/auto-mobile-daemon"))
        assertEquals("auto-mobile", detector.extractProcessName("bun /path/to/auto-mobile --stdio"))
    }

    @Test
    fun extractPortFromCommandLine() {
        val detector = RealMcpProcessDetector(
            timeProvider = timeProvider,
            processRunner = FakeProcessRunner(),
            socketFileChecker = FakeSocketFileChecker(),
        )
        assertEquals(9164, detector.extractPort("--port 9164"))
        assertEquals(9164, detector.extractPort("--port=9164"))
        assertEquals(3000, detector.extractPort("localhost:3000/health"))
        assertNull(detector.extractPort("--no-port-here"))
    }

    @Test
    fun classifyConnectionReturnsUnixSocketWhenSocketPathPresent() {
        val detector = RealMcpProcessDetector(
            timeProvider = timeProvider,
            processRunner = FakeProcessRunner(),
            socketFileChecker = FakeSocketFileChecker(),
        )
        val (type, port, path) = detector.classifyConnection(
            socketPath = "/tmp/auto-mobile-daemon-501.sock",
            cmdLine = "bun /path/to/auto-mobile",
        )
        assertEquals(McpConnectionType.UnixSocket, type)
        assertNull(port)
        assertEquals("/tmp/auto-mobile-daemon-501.sock", path)
    }

    @Test
    fun classifyConnectionReturnsHttpForDaemonMode() {
        val detector = RealMcpProcessDetector(
            timeProvider = timeProvider,
            processRunner = FakeProcessRunner(),
            socketFileChecker = FakeSocketFileChecker(),
        )
        val (type, port, path) = detector.classifyConnection(
            socketPath = null,
            cmdLine = "bun /path/to/auto-mobile --daemon-mode --port 9164",
        )
        assertEquals(McpConnectionType.StreamableHttp, type)
        assertEquals(9164, port)
        assertNull(path)
    }

    @Test
    fun classifyConnectionReturnsStdioByDefault() {
        val detector = RealMcpProcessDetector(
            timeProvider = timeProvider,
            processRunner = FakeProcessRunner(),
            socketFileChecker = FakeSocketFileChecker(),
        )
        val (type, port, path) = detector.classifyConnection(
            socketPath = null,
            cmdLine = "bun /path/to/auto-mobile --stdio",
        )
        assertEquals(McpConnectionType.Stdio, type)
        assertNull(port)
        assertNull(path)
    }

    @Test
    fun fastPathSkipsLsofWhenNoSocketFilesExist() {
        val psRunner = FakeProcessRunner(
            responses = mapOf(
                listOf("ps", "-eo", "pid,lstart,command") to listOf(
                    "97956 Wed Jan 22 11:00:00 2025 bun /path/to/auto-mobile --stdio",
                ),
            ),
        )
        val detector = RealMcpProcessDetector(
            timeProvider = timeProvider,
            processRunner = psRunner,
            socketFileChecker = FakeSocketFileChecker(files = emptyList()),
        )

        val processes = detector.detectProcesses()

        assertEquals(1, processes.size)
        assertEquals(McpConnectionType.Stdio, processes[0].connectionType)
        // lsof should never have been called
        assertEquals(
            listOf(listOf("ps", "-eo", "pid,lstart,command")),
            psRunner.commandsExecuted,
        )
    }

    @Test
    fun detectsUnixSocketWhenSocketFileExistsAndLsofFindsIt() {
        val psRunner = FakeProcessRunner(
            responses = mapOf(
                listOf("ps", "-eo", "pid,lstart,command") to listOf(
                    "97956 Wed Jan 22 11:00:00 2025 bun /path/to/auto-mobile",
                ),
                listOf("lsof", "-p", "97956", "-a", "-U") to listOf(
                    "bun  97956 jason  17u  unix 0x1234 0t0  /tmp/auto-mobile-daemon-501.sock",
                ),
            ),
        )
        val detector = RealMcpProcessDetector(
            timeProvider = timeProvider,
            processRunner = psRunner,
            socketFileChecker = FakeSocketFileChecker(
                files = listOf("/tmp/auto-mobile-daemon-501.sock"),
            ),
        )

        val processes = detector.detectProcesses()

        assertEquals(1, processes.size)
        assertEquals(McpConnectionType.UnixSocket, processes[0].connectionType)
        assertEquals("/tmp/auto-mobile-daemon-501.sock", processes[0].socketPath)
    }
}

private class FakeProcessRunner(
    private val responses: Map<List<String>, List<String>> = emptyMap(),
) : ProcessRunner {
    val commandsExecuted = mutableListOf<List<String>>()

    override fun runAndReadLines(command: List<String>): List<String>? {
        commandsExecuted.add(command)
        return responses[command]
    }
}

private class FakeSocketFileChecker(
    private val files: List<String> = emptyList(),
) : SocketFileChecker {
    override fun findDaemonSocketFiles(): List<String> = files
}
