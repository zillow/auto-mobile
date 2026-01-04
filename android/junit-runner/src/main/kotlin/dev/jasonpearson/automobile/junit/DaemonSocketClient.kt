package dev.jasonpearson.automobile.junit

import com.sun.security.auth.module.UnixSystem
import java.io.BufferedReader
import java.io.BufferedWriter
import java.io.Closeable
import java.io.File
import java.io.InputStreamReader
import java.io.OutputStreamWriter
import java.net.UnixDomainSocketAddress
import java.nio.channels.Channels
import java.nio.channels.SocketChannel
import java.nio.charset.StandardCharsets
import java.nio.file.Files
import java.util.UUID
import java.util.concurrent.CompletableFuture
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.TimeUnit
import java.util.concurrent.TimeoutException
import kotlin.concurrent.thread
import kotlinx.serialization.Serializable
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

internal object DaemonSocketClientManager {
  private val clientLock = Any()
  private var client: DaemonSocketClient? = null

  fun callTool(
      toolName: String,
      arguments: JsonObject,
      timeoutMs: Long
  ): DaemonResponse {
    val socketClient = getOrCreateClient()
    return socketClient.callTool(toolName, arguments, timeoutMs)
  }

  private fun getOrCreateClient(): DaemonSocketClient {
    synchronized(clientLock) {
      val existing = client
      if (existing != null && existing.isConnected()) {
        return existing
      }

      ensureDaemonRunning()
      val newClient = DaemonSocketClient(DaemonSocketPaths.socketPath())
      client = newClient
      return newClient
    }
  }

  private fun ensureDaemonRunning() {
    if (DaemonSocketClient.isAvailable(DaemonSocketPaths.socketPath())) {
      return
    }

    val startCommand = DaemonSocketPaths.buildDaemonStartCommand()
    val debugMode = SystemPropertyCache.getBoolean("automobile.debug", false)
    if (debugMode) {
      println("Starting AutoMobile daemon with: ${startCommand.joinToString(" ")}")
    }

    AutoMobileSharedUtils.executeCommand(startCommand, DaemonSocketPaths.daemonStartTimeoutMs())

    val started = DaemonSocketClient.waitForAvailability(
        DaemonSocketPaths.socketPath(),
        DaemonSocketPaths.daemonStartTimeoutMs()
    )
    if (!started) {
      throw DaemonUnavailableException(
          "Daemon failed to start within ${DaemonSocketPaths.daemonStartTimeoutMs()}ms")
    }
  }
}

internal object DaemonSocketPaths {
  private const val DEFAULT_DAEMON_STARTUP_TIMEOUT_MS = 10000L
  private var localAutoMobileExistsCache: Boolean? = null
  private val localAutoMobilePath: String
    get() = File("../../dist/src/index.js").absolutePath

  fun socketPath(): String {
    val userId = getUserId()
    return "/tmp/auto-mobile-daemon-$userId.sock"
  }

  fun daemonStartTimeoutMs(): Long {
    val configured = SystemPropertyCache.get("automobile.daemon.startup.timeout.ms", DEFAULT_DAEMON_STARTUP_TIMEOUT_MS.toString())
    return configured.toLongOrNull() ?: DEFAULT_DAEMON_STARTUP_TIMEOUT_MS
  }

  fun buildDaemonStartCommand(): List<String> {
    val command = ArrayList<String>(4)
    if (localAutoMobileExists()) {
      command.add("bun")
      command.add(localAutoMobilePath)
    } else {
      command.add("bunx")
      command.add("auto-mobile")
    }
    command.add("--daemon")
    command.add("start")
    return command
  }

  private fun localAutoMobileExists(): Boolean {
    return localAutoMobileExistsCache
        ?: File(localAutoMobilePath).exists().also { localAutoMobileExistsCache = it }
  }

  private fun getUserId(): String {
    val osName = System.getProperty("os.name").lowercase()
    if (osName.contains("win")) {
      return System.getProperty("user.name", "default")
    }

    return try {
      UnixSystem().uid.toString()
    } catch (e: Exception) {
      System.getProperty("user.name", "default")
    }
  }
}

internal class DaemonSocketClient(
    private val socketPath: String
) : Closeable {
  private val json = Json { ignoreUnknownKeys = true }
  private val pending = ConcurrentHashMap<String, CompletableFuture<DaemonResponse>>()
  private val writeLock = Any()
  @Volatile private var closed = false

  private val channel: SocketChannel = connect()
  private val reader: BufferedReader
  private val writer: BufferedWriter
  private val readThread: Thread

  init {
    val inputStream = Channels.newInputStream(channel)
    val outputStream = Channels.newOutputStream(channel)
    reader = BufferedReader(InputStreamReader(inputStream, StandardCharsets.UTF_8))
    writer = BufferedWriter(OutputStreamWriter(outputStream, StandardCharsets.UTF_8))

    readThread = thread(start = true, isDaemon = true, name = "auto-mobile-daemon-reader") {
      readLoop()
    }
  }

  fun isConnected(): Boolean {
    return !closed && channel.isOpen
  }

  fun callTool(
      toolName: String,
      arguments: JsonObject,
      timeoutMs: Long
  ): DaemonResponse {
    if (!isConnected()) {
      throw DaemonUnavailableException("Daemon socket connection is not available")
    }

    val requestId = UUID.randomUUID().toString()
    val request = DaemonRequest(
        id = requestId,
        type = "mcp_request",
        method = "tools/call",
        params = buildJsonParams(toolName, arguments)
    )

    val responseFuture = CompletableFuture<DaemonResponse>()
    pending[requestId] = responseFuture

    sendRequest(request)

    return try {
      responseFuture.get(timeoutMs, TimeUnit.MILLISECONDS)
    } catch (e: TimeoutException) {
      pending.remove(requestId)
      throw DaemonUnavailableException("Daemon request timeout after ${timeoutMs}ms")
    }
  }

  override fun close() {
    if (closed) {
      return
    }
    closed = true
    try {
      channel.close()
    } catch (e: Exception) {
      // Ignore close errors
    }
    failPendingRequests("Daemon socket closed")
  }

  private fun connect(): SocketChannel {
    if (!Files.exists(File(socketPath).toPath())) {
      throw DaemonUnavailableException("Daemon socket not found: $socketPath")
    }

    return SocketChannel.open(UnixDomainSocketAddress.of(socketPath))
  }

  private fun sendRequest(request: DaemonRequest) {
    val payload = json.encodeToString(request)
    synchronized(writeLock) {
      writer.write(payload)
      writer.newLine()
      writer.flush()
    }
  }

  private fun readLoop() {
    try {
      while (!closed) {
        val line = reader.readLine() ?: break
        if (line.isBlank()) {
          continue
        }
        try {
          val response = json.decodeFromString(DaemonResponse.serializer(), line)
          handleResponse(response)
        } catch (e: Exception) {
          println("Failed to parse daemon response: ${e.message}")
        }
      }
    } catch (e: Exception) {
      if (!closed) {
        println("Daemon socket read error: ${e.message}")
      }
    } finally {
      close()
    }
  }

  private fun handleResponse(response: DaemonResponse) {
    val future = pending.remove(response.id)
    if (future != null) {
      future.complete(response)
    }
  }

  private fun buildJsonParams(toolName: String, arguments: JsonObject): JsonObject {
    return JsonObject(
        mapOf(
            "name" to JsonPrimitive(toolName),
            "arguments" to arguments
        )
    )
  }

  private fun failPendingRequests(message: String) {
    val exception = DaemonUnavailableException(message)
    pending.values.forEach { future -> future.completeExceptionally(exception) }
    pending.clear()
  }

  companion object {
    fun isAvailable(socketPath: String): Boolean {
      return try {
        val client = DaemonSocketClient(socketPath)
        client.close()
        true
      } catch (e: Exception) {
        false
      }
    }

    fun waitForAvailability(socketPath: String, timeoutMs: Long): Boolean {
      val start = System.currentTimeMillis()
      while (System.currentTimeMillis() - start < timeoutMs) {
        if (isAvailable(socketPath)) {
          return true
        }
        Thread.sleep(100)
      }
      return false
    }
  }
}

@Serializable
internal data class DaemonRequest(
    val id: String,
    val type: String,
    val method: String,
    val params: JsonObject
)

@Serializable
internal data class DaemonResponse(
    val id: String,
    val type: String,
    val success: Boolean,
    val result: JsonElement? = null,
    val error: String? = null
)

internal class DaemonUnavailableException(message: String) : Exception(message)
