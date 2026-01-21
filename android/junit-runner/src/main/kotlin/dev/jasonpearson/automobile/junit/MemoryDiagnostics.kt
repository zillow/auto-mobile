package dev.jasonpearson.automobile.junit

import java.io.File
import java.lang.management.ManagementFactory
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter

internal data class MemorySnapshot(
    val timestampMs: Long,
    val heapUsedBytes: Long,
    val heapCommittedBytes: Long,
    val heapMaxBytes: Long,
    val nonHeapUsedBytes: Long,
    val nonHeapCommittedBytes: Long,
    val nonHeapMaxBytes: Long,
)

internal object MemoryDiagnostics {
  private const val DEFAULT_HEAP_DUMP_DIR = "heap-dump"
  private const val DEFAULT_TOOL_TIMEOUT_MS = 20_000L
  private val labelSanitizer = RegexCache.getRegex("[^a-zA-Z0-9_-]")
  private val timestampFormatter =
      DateTimeFormatter.ofPattern("yyyyMMdd-HHmmss-SSS").withZone(ZoneId.systemDefault())

  fun captureSnapshot(): MemorySnapshot {
    val bean = ManagementFactory.getMemoryMXBean()
    val heap = bean.heapMemoryUsage
    val nonHeap = bean.nonHeapMemoryUsage
    return MemorySnapshot(
        timestampMs = System.currentTimeMillis(),
        heapUsedBytes = heap.used,
        heapCommittedBytes = heap.committed,
        heapMaxBytes = heap.max,
        nonHeapUsedBytes = nonHeap.used,
        nonHeapCommittedBytes = nonHeap.committed,
        nonHeapMaxBytes = nonHeap.max,
    )
  }

  fun forceGc() {
    System.gc()
  }

  fun dumpHeap(label: String, reason: String? = null): File? {
    val baseDir = resolveHeapDumpDir()
    if (!baseDir.exists() && !baseDir.mkdirs()) {
      System.err.println(
          "MemoryDiagnostics: Failed to create heap dump directory: ${baseDir.absolutePath}"
      )
      return null
    }

    val sanitizedLabel = sanitizeLabel(label)
    val timestamp = timestampFormatter.format(Instant.now())
    val heapDumpFile = File(baseDir, "${timestamp}_${sanitizedLabel}.hprof")

    val pid = currentPid()
    val jcmd = findTool("jcmd")
    val jmap = findTool("jmap")

    val command =
        when {
          jcmd != null -> listOf(jcmd, pid.toString(), "GC.heap_dump", heapDumpFile.absolutePath)
          jmap != null ->
              listOf(jmap, "-dump:format=b,file=${heapDumpFile.absolutePath}", pid.toString())
          else -> null
        }

    if (command == null) {
      System.err.println("MemoryDiagnostics: jcmd/jmap not found; cannot create heap dump.")
      return null
    }

    val output = runTool(command, DEFAULT_TOOL_TIMEOUT_MS)
    writeCommandOutput(
        File(baseDir, "${timestamp}_${sanitizedLabel}_heap_dump.log"),
        command,
        output,
        reason,
    )

    return if (heapDumpFile.exists()) heapDumpFile else null
  }

  fun captureDiagnostics(label: String, reason: String? = null): File? {
    val baseDir = resolveHeapDumpDir()
    if (!baseDir.exists() && !baseDir.mkdirs()) {
      System.err.println(
          "MemoryDiagnostics: Failed to create heap dump directory: ${baseDir.absolutePath}"
      )
      return null
    }

    val sanitizedLabel = sanitizeLabel(label)
    val timestamp = timestampFormatter.format(Instant.now())
    val diagnosticsDir = File(baseDir, "diagnostics/${timestamp}_${sanitizedLabel}")
    if (!diagnosticsDir.exists() && !diagnosticsDir.mkdirs()) {
      System.err.println(
          "MemoryDiagnostics: Failed to create diagnostics directory: ${diagnosticsDir.absolutePath}"
      )
      return null
    }

    val pid = currentPid()
    val snapshot = captureSnapshot()
    val summary = buildString {
      appendLine("Timestamp: $timestamp")
      appendLine("PID: $pid")
      if (!reason.isNullOrBlank()) {
        appendLine("Reason: $reason")
      }
      appendLine("Heap Used: ${formatBytes(snapshot.heapUsedBytes)}")
      appendLine("Heap Committed: ${formatBytes(snapshot.heapCommittedBytes)}")
      appendLine("Heap Max: ${formatBytes(snapshot.heapMaxBytes)}")
      appendLine("Non-Heap Used: ${formatBytes(snapshot.nonHeapUsedBytes)}")
      appendLine("Non-Heap Committed: ${formatBytes(snapshot.nonHeapCommittedBytes)}")
      appendLine("Non-Heap Max: ${formatBytes(snapshot.nonHeapMaxBytes)}")
    }
    File(diagnosticsDir, "summary.txt").writeText(summary)

    val errors = mutableListOf<String>()

    runAndWriteTool(
        diagnosticsDir,
        "jstat-gc",
        findTool("jstat"),
        listOf("-gc", pid.toString(), "1", "1"),
        errors,
    )
    runAndWriteTool(
        diagnosticsDir,
        "jstat-gccapacity",
        findTool("jstat"),
        listOf("-gccapacity", pid.toString(), "1", "1"),
        errors,
    )

    runAndWriteTool(
        diagnosticsDir,
        "jcmd-heap-info",
        findTool("jcmd"),
        listOf(pid.toString(), "GC.heap_info"),
        errors,
    )
    runAndWriteTool(
        diagnosticsDir,
        "jcmd-class-histogram",
        findTool("jcmd"),
        listOf(pid.toString(), "GC.class_histogram"),
        errors,
    )
    runAndWriteTool(
        diagnosticsDir,
        "jcmd-vm-flags",
        findTool("jcmd"),
        listOf(pid.toString(), "VM.flags"),
        errors,
    )
    runAndWriteTool(
        diagnosticsDir,
        "jcmd-vm-system-properties",
        findTool("jcmd"),
        listOf(pid.toString(), "VM.system_properties"),
        errors,
    )
    runAndWriteTool(
        diagnosticsDir,
        "jcmd-gc-finalizer-info",
        findTool("jcmd"),
        listOf(pid.toString(), "GC.finalizer_info"),
        errors,
    )
    runAndWriteTool(
        diagnosticsDir,
        "jcmd-thread-print",
        findTool("jcmd"),
        listOf(pid.toString(), "Thread.print"),
        errors,
    )

    if (errors.isNotEmpty()) {
      File(diagnosticsDir, "errors.txt").writeText(errors.joinToString("\n"))
    }

    return diagnosticsDir
  }

  private fun resolveHeapDumpDir(): File {
    val configured =
        System.getProperty("automobile.junit.memory.heapdump.dir", DEFAULT_HEAP_DUMP_DIR)
    val trimmed = configured.trim()
    return File(if (trimmed.isEmpty()) DEFAULT_HEAP_DUMP_DIR else trimmed)
  }

  private fun sanitizeLabel(label: String): String {
    return label.replace(labelSanitizer, "_")
  }

  private fun currentPid(): Long {
    return ProcessHandle.current().pid()
  }

  private fun findTool(toolName: String): String? {
    val javaHome = File(System.getProperty("java.home", ""))
    val directCandidate = File(javaHome, "bin/$toolName")
    val parentCandidate = javaHome.parentFile?.let { File(it, "bin/$toolName") }
    val windowsCandidate = File(javaHome, "bin/$toolName.exe")
    val parentWindowsCandidate = javaHome.parentFile?.let { File(it, "bin/$toolName.exe") }

    listOf(directCandidate, parentCandidate, windowsCandidate, parentWindowsCandidate)
        .firstOrNull { it != null && it.exists() && it.canExecute() }
        ?.let {
          return it.absolutePath
        }

    val path = System.getenv("PATH") ?: return null
    val segments = path.split(File.pathSeparator)
    val candidates =
        segments
            .map { segment ->
              listOf(
                  File(segment, toolName),
                  File(segment, "$toolName.exe"),
              )
            }
            .flatten()
    return candidates.firstOrNull { it.exists() && it.canExecute() }?.absolutePath
  }

  private fun runAndWriteTool(
      diagnosticsDir: File,
      filePrefix: String,
      tool: String?,
      args: List<String>,
      errors: MutableList<String>,
  ) {
    if (tool == null) {
      errors.add("$filePrefix: tool not found")
      return
    }

    val command = listOf(tool) + args
    val output = runTool(command, DEFAULT_TOOL_TIMEOUT_MS)
    val outputFile = File(diagnosticsDir, "$filePrefix.txt")
    writeCommandOutput(outputFile, command, output, null)

    if (output.exitCode != 0) {
      errors.add("$filePrefix: exitCode=${output.exitCode}")
    }
  }

  private fun runTool(command: List<String>, timeoutMs: Long): ToolOutput {
    return try {
      val result = AutoMobileSharedUtils.executeCommand(command, timeoutMs)
      ToolOutput(result.exitCode, result.output, result.errorOutput)
    } catch (e: Exception) {
      ToolOutput(-1, "", e.message ?: "Unknown error")
    }
  }

  private fun writeCommandOutput(
      file: File,
      command: List<String>,
      output: ToolOutput,
      reason: String?,
  ) {
    val content = buildString {
      appendLine("Command: ${command.joinToString(" ")}")
      if (!reason.isNullOrBlank()) {
        appendLine("Reason: $reason")
      }
      appendLine("Exit Code: ${output.exitCode}")
      if (output.stdout.isNotBlank()) {
        appendLine()
        appendLine("STDOUT:")
        appendLine(output.stdout)
      }
      if (output.stderr.isNotBlank()) {
        appendLine()
        appendLine("STDERR:")
        appendLine(output.stderr)
      }
    }
    file.writeText(content)
  }

  private fun formatBytes(bytes: Long): String {
    if (bytes < 0) {
      return "unknown"
    }
    val mb = bytes / (1024.0 * 1024.0)
    return String.format("%.2f MiB", mb)
  }

  private data class ToolOutput(val exitCode: Int, val stdout: String, val stderr: String)
}
