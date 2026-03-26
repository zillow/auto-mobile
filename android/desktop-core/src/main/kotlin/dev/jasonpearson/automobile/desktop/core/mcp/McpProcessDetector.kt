package dev.jasonpearson.automobile.desktop.core.mcp

import java.io.BufferedReader
import java.io.File
import java.io.InputStreamReader

/**
 * Data class for MCP process information
 */
data class McpProcess(
    val pid: Int,
    val name: String,
    val connectionType: McpConnectionType,
    val port: Int? = null,
    val socketPath: String? = null,
    val uptimeMs: Long = 0,
    val status: String = "Running",
    val commandLine: String? = null,
)

enum class McpConnectionType(val label: String, val icon: String) {
    StreamableHttp("Streamable HTTP", "🌐"),
    Stdio("STDIO", "📝"),
    UnixSocket("Unix Socket", "🔌"),
}

/**
 * Interface for detecting MCP server processes
 */
interface McpProcessDetector {
    fun detectProcesses(): List<McpProcess>
}

/**
 * Fake implementation for testing and demo purposes
 */
class FakeMcpProcessDetector : McpProcessDetector {
    override fun detectProcesses(): List<McpProcess> = listOf(
        McpProcess(
            pid = 12345,
            name = "auto-mobile-daemon",
            connectionType = McpConnectionType.StreamableHttp,
            port = 3000,
            uptimeMs = 3600000, // 1 hour
        ),
        McpProcess(
            pid = 12346,
            name = "auto-mobile-mcp",
            connectionType = McpConnectionType.UnixSocket,
            socketPath = "/tmp/auto-mobile-daemon-501.sock",
            uptimeMs = 1800000, // 30 min
        ),
        McpProcess(
            pid = 12400,
            name = "auto-mobile-stdio",
            connectionType = McpConnectionType.Stdio,
            uptimeMs = 600000, // 10 min
        ),
    )
}

/**
 * Runs a subprocess and returns its stdout lines, or null on failure.
 */
interface ProcessRunner {
    fun runAndReadLines(command: List<String>): List<String>?
}

class SystemProcessRunner : ProcessRunner {
    override fun runAndReadLines(command: List<String>): List<String>? {
        return try {
            val pb = ProcessBuilder(command)
            pb.redirectErrorStream(true)
            val process = pb.start()
            val lines = BufferedReader(InputStreamReader(process.inputStream)).use { reader ->
                reader.readLines()
            }
            process.waitFor()
            lines
        } catch (e: Exception) {
            null
        }
    }
}

/**
 * Checks whether daemon socket files exist in /tmp.
 */
interface SocketFileChecker {
    fun findDaemonSocketFiles(): List<String>
}

class RealSocketFileChecker : SocketFileChecker {
    override fun findDaemonSocketFiles(): List<String> {
        val tmpDir = File("/tmp")
        if (!tmpDir.isDirectory) return emptyList()
        return tmpDir.listFiles { f ->
            f.name.startsWith("auto-mobile-daemon") && f.name.endsWith(".sock")
        }?.map { it.absolutePath } ?: emptyList()
    }
}

/**
 * Real implementation that detects actual MCP processes on the system
 */
class RealMcpProcessDetector(
    private val timeProvider: TimeProvider = SystemTimeProvider,
    private val processRunner: ProcessRunner = SystemProcessRunner(),
    private val socketFileChecker: SocketFileChecker = RealSocketFileChecker(),
) : McpProcessDetector {

    override fun detectProcesses(): List<McpProcess> {
        val processes = mutableListOf<McpProcess>()

        // Find auto-mobile processes via ps
        val psProcesses = findAutoMobileProcesses()

        // Fast-path: check if any daemon socket files exist at all
        val socketFilesExist = socketFileChecker.findDaemonSocketFiles().isNotEmpty()

        // Match processes with their connection types
        psProcesses.forEach { (pid, name, startTime, cmdLine) ->
            val uptimeMs = timeProvider.currentTimeMillis() - startTime

            // Determine connection type based on what THIS specific process is actually doing
            val socketPath = if (socketFilesExist) isListeningOnSocket(pid) else null

            val (connectionType, port, resolvedSocketPath) = when {
                socketPath != null -> {
                    Triple(McpConnectionType.UnixSocket, null, socketPath)
                }
                // Check if THIS process is the daemon running in HTTP mode
                // Only --daemon-mode is the actual daemon; --daemon start is just the manager
                cmdLine.contains("--daemon-mode") -> {
                    Triple(McpConnectionType.StreamableHttp, extractPort(cmdLine) ?: 3000, null)
                }
                // Check for explicit port indicators
                cmdLine.contains("--port") || cmdLine.contains(":3000") || cmdLine.contains("http") -> {
                    Triple(McpConnectionType.StreamableHttp, extractPort(cmdLine) ?: 3000, null)
                }
                else -> {
                    // Default to STDIO if nothing else matches
                    Triple(McpConnectionType.Stdio, null, null)
                }
            }

            processes.add(
                McpProcess(
                    pid = pid,
                    name = name,
                    connectionType = connectionType,
                    port = port,
                    socketPath = resolvedSocketPath,
                    uptimeMs = uptimeMs,
                    commandLine = cmdLine,
                )
            )
        }

        return processes
    }

    private fun findAutoMobileProcesses(): List<ProcessInfo> {
        val lines = processRunner.runAndReadLines(listOf("ps", "-eo", "pid,lstart,command"))
            ?: return emptyList()

        return lines
            .filter { it.contains("auto-mobile") && !it.contains("grep") }
            .mapNotNull { line -> parseProcessLine(line) }
    }

    internal fun parseProcessLine(line: String): ProcessInfo? {
        // Parse: "  PID                      STARTED COMMAND"
        // Example: "97956 Wed Jan 22 11:00:00 2025 bun /path/to/auto-mobile"
        val trimmed = line.trim()
        val parts = trimmed.split(Regex("\\s+"), limit = 6)

        if (parts.size < 6) return null

        val pid = parts[0].toIntOrNull() ?: return null

        // Parse lstart date (format: "Wed Jan 22 11:00:00 2025")
        val dateStr = "${parts[1]} ${parts[2]} ${parts[3]} ${parts[4]} ${parts[5].substringBefore(' ')}"
        val startTime = parseLstartDate(dateStr)

        val command = parts.getOrNull(5)?.substringAfter(' ') ?: parts[5]
        val name = extractProcessName(command)

        return ProcessInfo(pid, name, startTime, command)
    }

    private fun parseLstartDate(dateStr: String): Long {
        return try {
            val format = java.text.SimpleDateFormat("EEE MMM dd HH:mm:ss yyyy", java.util.Locale.US)
            format.parse(dateStr)?.time ?: timeProvider.currentTimeMillis()
        } catch (e: Exception) {
            timeProvider.currentTimeMillis()
        }
    }

    internal fun extractProcessName(command: String): String {
        return when {
            command.contains("auto-mobile-daemon") -> "auto-mobile-daemon"
            command.contains("auto-mobile") -> "auto-mobile"
            else -> command.substringAfterLast('/').substringBefore(' ')
        }
    }

    internal fun extractPort(cmdLine: String): Int? {
        val portRegex = Regex("--port[=\\s](\\d+)|:(\\d{4,5})")
        val match = portRegex.find(cmdLine)
        return match?.groupValues?.drop(1)?.firstOrNull { it.isNotEmpty() }?.toIntOrNull()
    }

    internal fun classifyConnection(
        socketPath: String?,
        cmdLine: String,
    ): Triple<McpConnectionType, Int?, String?> {
        return when {
            socketPath != null -> {
                Triple(McpConnectionType.UnixSocket, null, socketPath)
            }
            cmdLine.contains("--daemon-mode") -> {
                Triple(McpConnectionType.StreamableHttp, extractPort(cmdLine) ?: 3000, null)
            }
            cmdLine.contains("--port") || cmdLine.contains(":3000") || cmdLine.contains("http") -> {
                Triple(McpConnectionType.StreamableHttp, extractPort(cmdLine) ?: 3000, null)
            }
            else -> {
                Triple(McpConnectionType.Stdio, null, null)
            }
        }
    }

    private fun isListeningOnSocket(pid: Int): String? {
        val lines = processRunner.runAndReadLines(listOf("lsof", "-p", pid.toString(), "-a", "-U"))
            ?: return null

        return lines
            .filter { it.contains("/tmp/auto-mobile-daemon") && it.contains(".sock") }
            .mapNotNull { line ->
                val parts = line.trim().split(Regex("\\s+"))
                parts.lastOrNull()?.takeIf { it.startsWith("/tmp/auto-mobile-daemon") }
            }
            .firstOrNull()
    }

    internal data class ProcessInfo(
        val pid: Int,
        val name: String,
        val startTime: Long,
        val commandLine: String,
    )
}

/**
 * Time provider interface for testing
 */
interface TimeProvider {
    fun currentTimeMillis(): Long
}

/**
 * System time provider for production use
 */
object SystemTimeProvider : TimeProvider {
    override fun currentTimeMillis(): Long = System.currentTimeMillis()
}

/**
 * Fake time provider for testing
 */
class FakeTimeProvider(var currentTime: Long = 0L) : TimeProvider {
    override fun currentTimeMillis(): Long = currentTime

    fun advanceBy(ms: Long) {
        currentTime += ms
    }
}
