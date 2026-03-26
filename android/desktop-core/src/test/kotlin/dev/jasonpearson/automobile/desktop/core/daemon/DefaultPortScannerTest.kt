package dev.jasonpearson.automobile.desktop.core.daemon

import kotlin.test.assertEquals
import kotlin.test.assertTrue
import kotlinx.coroutines.runBlocking
import org.junit.Test

class DefaultPortScannerTest {

    @Test
    fun buildCommandListSkipsSsOnMacOS() {
        val scanner = DefaultPortScanner(
            commandRunner = FakePortCommandRunner(),
            platformInfo = FakePlatformInfo("mac os x"),
        )
        val commands = scanner.buildCommandList("mac os x")
        val flat = commands.flatten()
        assertTrue("ss" !in flat, "ss should not be included on macOS")
        assertTrue(commands.any { it.first() == "lsof" }, "lsof should be present")
        assertTrue(commands.any { it.first() == "netstat" }, "netstat should be present")
    }

    @Test
    fun buildCommandListSkipsSsOnDarwin() {
        val scanner = DefaultPortScanner(
            commandRunner = FakePortCommandRunner(),
            platformInfo = FakePlatformInfo("darwin"),
        )
        val commands = scanner.buildCommandList("darwin")
        val flat = commands.flatten()
        assertTrue("ss" !in flat, "ss should not be included on darwin")
    }

    @Test
    fun buildCommandListIncludesSsOnLinux() {
        val scanner = DefaultPortScanner(
            commandRunner = FakePortCommandRunner(),
            platformInfo = FakePlatformInfo("linux"),
        )
        val commands = scanner.buildCommandList("linux")
        assertTrue(commands.any { it.first() == "ss" }, "ss should be included on Linux")
    }

    @Test
    fun buildCommandListUsesNetstatOnWindows() {
        val scanner = DefaultPortScanner(
            commandRunner = FakePortCommandRunner(),
            platformInfo = FakePlatformInfo("windows 10"),
        )
        val commands = scanner.buildCommandList("windows 10")
        assertEquals(1, commands.size)
        assertEquals("netstat", commands[0][0])
    }

    @Test
    fun parsePortsExtractsListeningPorts() {
        val scanner = DefaultPortScanner(
            commandRunner = FakePortCommandRunner(),
            platformInfo = FakePlatformInfo("linux"),
        )
        val output = """
            COMMAND   PID USER   FD   TYPE DEVICE SIZE/OFF NODE NAME
            node    12345 user   22u  IPv4  0x1234  0t0  TCP *:3000 (LISTEN)
            node    12345 user   23u  IPv4  0x1235  0t0  TCP *:9164 (LISTEN)
            node    12345 user   24u  IPv4  0x1236  0t0  TCP *:8080 (ESTABLISHED)
        """.trimIndent()
        val ports = scanner.parsePorts(output)
        assertEquals(listOf(3000, 9164), ports)
    }

    @Test
    fun parsePortsHandlesEmptyOutput() {
        val scanner = DefaultPortScanner(
            commandRunner = FakePortCommandRunner(),
            platformInfo = FakePlatformInfo("linux"),
        )
        assertEquals(emptyList(), scanner.parsePorts(""))
    }

    @Test
    fun scanListeningPortsAggregatesFromAllCommands() {
        val runner = FakePortCommandRunner(
            responses = mapOf(
                listOf("lsof", "-iTCP", "-sTCP:LISTEN", "-n", "-P") to
                    "node 123 user 22u IPv4 0x1 0t0 TCP *:3000 (LISTEN)",
                listOf("netstat", "-an") to
                    "tcp  0  0  0.0.0.0:9164  0.0.0.0:*  LISTEN",
            ),
        )
        val scanner = DefaultPortScanner(
            commandRunner = runner,
            platformInfo = FakePlatformInfo("mac os x"),
        )
        val ports = runBlocking { scanner.scanListeningPorts() }
        assertTrue(3000 in ports, "should find port 3000 from lsof")
        assertTrue(9164 in ports, "should find port 9164 from netstat")
    }

    @Test
    fun scanListeningPortsHandlesCommandFailures() {
        val runner = FakePortCommandRunner(
            responses = mapOf(
                listOf("lsof", "-iTCP", "-sTCP:LISTEN", "-n", "-P") to
                    "node 123 user 22u IPv4 0x1 0t0 TCP *:3000 (LISTEN)",
                // netstat returns null (failure)
            ),
        )
        val scanner = DefaultPortScanner(
            commandRunner = runner,
            platformInfo = FakePlatformInfo("mac os x"),
        )
        val ports = runBlocking { scanner.scanListeningPorts() }
        assertEquals(setOf(3000), ports)
    }
}

private class FakePortCommandRunner(
    private val responses: Map<List<String>, String> = emptyMap(),
) : PortCommandRunner {
    override fun runCommand(command: List<String>): String? = responses[command]
}

private class FakePlatformInfo(override val osName: String) : PlatformInfo
