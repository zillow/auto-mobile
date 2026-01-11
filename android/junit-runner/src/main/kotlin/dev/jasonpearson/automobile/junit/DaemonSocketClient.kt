package dev.jasonpearson.automobile.junit

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
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

internal object DaemonSocketClientManager {
  // Use ThreadLocal to give each thread its own socket connection
  // This enables true parallel execution since socket server queues requests per connection
  private val threadLocalClient = ThreadLocal<DaemonSocketClient>()
  private val clientLock = Any()
  @Volatile
  private var daemonEnsured = false

  fun callTool(toolName: String, arguments: JsonObject, timeoutMs: Long): DaemonResponse {
    val socketClient = getOrCreateClient()
    return socketClient.callTool(toolName, arguments, timeoutMs)
  }

  fun readResource(uri: String, timeoutMs: Long): DaemonResponse {
    val socketClient = getOrCreateClient()
    return socketClient.readResource(uri, timeoutMs)
  }

  fun sessionUuid(): String {
    return getOrCreateClient().sessionUuid
  }

  private fun getOrCreateClient(): DaemonSocketClient {
    // Each thread gets its own connection for parallel execution
    val existing = threadLocalClient.get()
    if (existing != null && existing.isConnected()) {
      return existing
    }

    val socketPath = DaemonSocketPaths.socketPath()

    // Ensure daemon is running (restart if socket disappeared after crash/exit)
    synchronized(clientLock) {
      // Reset daemonEnsured if socket doesn't exist (daemon crashed/exited)
      if (!File(socketPath).exists()) {
        daemonEnsured = false
      }

      if (!daemonEnsured) {
        ensureDaemonRunning()
        daemonEnsured = true
      }
    }

    // Create new client for this thread
    val newClient = DaemonSocketClient(socketPath)
    threadLocalClient.set(newClient)
    return newClient
  }

  private fun ensureDaemonRunning() {
    val socketPath = DaemonSocketPaths.socketPath()
    val forceRestart = SystemPropertyCache.getBoolean("automobile.daemon.force.restart", false)
    if (!forceRestart && DaemonSocketClient.isAvailable(socketPath)) {
      return
    }

    val startCommand =
        if (forceRestart) {
          DaemonSocketPaths.buildDaemonRestartCommand()
        } else {
          DaemonSocketPaths.buildDaemonStartCommand()
        }
    val debugMode = SystemPropertyCache.getBoolean("automobile.debug", false)
    if (debugMode) {
      println("Starting AutoMobile daemon with: ${startCommand.joinToString(" ")}")
    }

    val environmentOverrides = resolveDaemonEnvironmentOverrides()
    AutoMobileSharedUtils.executeCommand(
        startCommand,
        DaemonSocketPaths.daemonStartTimeoutMs(),
        environmentOverrides,
    )

    val started =
        DaemonSocketClient.waitForAvailability(
            socketPath,
            DaemonSocketPaths.daemonStartTimeoutMs(),
        )
    if (!started) {
      throw DaemonUnavailableException(
          "Daemon failed to start within ${DaemonSocketPaths.daemonStartTimeoutMs()}ms"
      )
    }

    // NOTE: Device pool initialization check removed to allow parallel test execution.
    // The daemon initializes its device pool at startup, and tests will wait for
    // devices as needed when they call executePlan.
  }

  /**
   * Wait for daemon device pool to have at least one device
   * This is a blocking health check that prevents tests from running
   * until devices are available.
   */
  private fun waitForDevicePoolReady(timeoutMs: Long) {
    val debugMode = SystemPropertyCache.getBoolean("automobile.debug", false)
    val json = Json { ignoreUnknownKeys = true }
    if (debugMode) {
      println("Waiting for daemon device pool to initialize...")
    }

    val startTime = System.currentTimeMillis()
    var lastDeviceCount = -1
    var nextRefreshTime = startTime + 2000 // First refresh after 2 seconds

    while (System.currentTimeMillis() - startTime < timeoutMs) {
      try {
        val socketClient = DaemonSocketClient(DaemonSocketPaths.socketPath())

        // Trigger device refresh every 2 seconds if pool is still empty
        val now = System.currentTimeMillis()
        if (now >= nextRefreshTime && lastDeviceCount == 0) {
          if (debugMode) {
            println("Triggering device pool refresh...")
          }
          try {
            val refreshResponse = socketClient.callDaemonMethod(
                "daemon/refreshDevices",
                5000
            )
            if (debugMode && refreshResponse.success) {
              val addedDevices = refreshResponse.result
                  ?.jsonObject?.get("addedDevices")
                  ?.jsonPrimitive?.intOrNull ?: 0
              println("Device pool refresh complete: added $addedDevices devices")
            }
          } catch (e: Exception) {
            if (debugMode) {
              println("Device refresh error: ${e.message}")
            }
          }
          nextRefreshTime = now + 2000 // Schedule next refresh in 2 seconds
        }

        val response = socketClient.callTool(
            "listDevices",
            JsonObject(mapOf("platform" to JsonPrimitive("android"))),
            5000
        )
        socketClient.close()

        if (response.success) {
          val payloadText = response.result
              ?.jsonObject?.get("content")
              ?.jsonArray?.firstOrNull()
              ?.jsonObject?.get("text")
              ?.jsonPrimitive?.content
          val parsedResult = payloadText?.let { json.parseToJsonElement(it).jsonObject }
          val poolStatus = parsedResult?.get("poolStatus")?.jsonObject
          val totalDevices = poolStatus
              ?.get("total")
              ?.jsonPrimitive
              ?.intOrNull
              ?: parsedResult?.get("totalCount")?.jsonPrimitive?.intOrNull
              ?: 0

          if (totalDevices > 0) {
            if (debugMode) {
              println("Device pool ready with $totalDevices device(s)")
            }
            return
          }

          // Log only if device count changed
          if (totalDevices != lastDeviceCount) {
            if (debugMode) {
              println("Device pool still empty, waiting...")
            }
            lastDeviceCount = totalDevices
          }
        }
      } catch (e: Exception) {
        // Ignore errors during health check, will retry
        if (debugMode) {
          println("Device pool check error: ${e.message}")
        }
      }

      Thread.sleep(500)
    }

    // Device pool is still empty after timeout - throw error
    throw DaemonUnavailableException(
        "Daemon device pool is empty after ${timeoutMs}ms. " +
        "Start an emulator or connect a physical device before running tests."
    )
  }

  private fun resolveDaemonEnvironmentOverrides(): Map<String, String> {
    val resolvedOverrides = mutableMapOf<String, String>()
    val accessibilityApkProperty =
        SystemPropertyCache.get("automobile.accessibility.apk.path", "").trim()
    val accessibilityApkEnv = System.getenv("AUTOMOBILE_ACCESSIBILITY_APK_PATH")?.trim().orEmpty()
    val accessibilityApkPath =
        when {
          accessibilityApkProperty.isNotEmpty() -> accessibilityApkProperty
          accessibilityApkEnv.isNotEmpty() -> accessibilityApkEnv
          else -> findLocalAccessibilityApkPath().orEmpty()
        }
    if (accessibilityApkPath.isNotEmpty()) {
      resolvedOverrides["AUTOMOBILE_ACCESSIBILITY_APK_PATH"] = accessibilityApkPath
    }
    return resolvedOverrides
  }

  private fun findLocalAccessibilityApkPath(): String? {
    val candidates =
        listOf(
            File("accessibility-service/build/outputs/apk/debug/accessibility-service-debug.apk"),
            File("../accessibility-service/build/outputs/apk/debug/accessibility-service-debug.apk"),
            File("../../accessibility-service/build/outputs/apk/debug/accessibility-service-debug.apk"),
        )
    return candidates.firstOrNull { it.exists() }?.absolutePath
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
    val configured =
        SystemPropertyCache.get(
            "automobile.daemon.startup.timeout.ms",
            DEFAULT_DAEMON_STARTUP_TIMEOUT_MS.toString(),
        )
    return configured.toLongOrNull() ?: DEFAULT_DAEMON_STARTUP_TIMEOUT_MS
  }

  fun buildDaemonStartCommand(): List<String> {
    return buildDaemonCommand("start")
  }

  fun buildDaemonRestartCommand(): List<String> {
    return buildDaemonCommand("restart")
  }

  private fun buildDaemonCommand(subCommand: String): List<String> {
    val command = ArrayList<String>(4)
    if (localAutoMobileExists()) {
      command.add("bun")
      command.add(localAutoMobilePath)
    } else {
      command.add("bunx")
      command.add("auto-mobile")
    }
    command.add("--daemon")
    command.add(subCommand)
    return command
  }

  private fun localAutoMobileExists(): Boolean {
    return localAutoMobileExistsCache
        ?: File(localAutoMobilePath).exists().also { localAutoMobileExistsCache = it }
  }

  private fun getUserId(): String {
    val userName = System.getProperty("user.name", "default").ifBlank { "default" }
    val osName = System.getProperty("os.name").lowercase()
    if (osName.contains("win")) {
      return userName
    }

    return try {
      val process = ProcessBuilder("id", "-u").start()
      val exitCode = process.waitFor(2, java.util.concurrent.TimeUnit.SECONDS)
      if (!exitCode) {
        process.destroy()
        return userName
      }
      val uid = process.inputStream.bufferedReader().readText().trim()
      if (uid.isNotEmpty()) uid else userName
    } catch (e: Exception) {
      userName
    }
  }
}

internal class DaemonSocketClient(private val socketPath: String) : Closeable {
  private val json = Json { ignoreUnknownKeys = true }
  private val pending = ConcurrentHashMap<String, CompletableFuture<DaemonResponse>>()
  private val writeLock = Any()
  @Volatile private var closed = false

  // Unique session UUID for this client/thread to enable per-thread plan execution locking
  val sessionUuid: String = UUID.randomUUID().toString()

  private val channel: SocketChannel = connect()
  private val reader: BufferedReader
  private val writer: BufferedWriter
  private val readThread: Thread

  init {
    val inputStream = Channels.newInputStream(channel)
    val outputStream = Channels.newOutputStream(channel)
    reader = BufferedReader(InputStreamReader(inputStream, StandardCharsets.UTF_8))
    writer = BufferedWriter(OutputStreamWriter(outputStream, StandardCharsets.UTF_8))

    readThread =
        thread(start = true, isDaemon = true, name = "auto-mobile-daemon-reader") { readLoop() }
  }

  fun isConnected(): Boolean {
    return !closed && channel.isOpen
  }

  fun callTool(toolName: String, arguments: JsonObject, timeoutMs: Long): DaemonResponse {
    if (!isConnected()) {
      throw DaemonUnavailableException("Daemon socket connection is not available")
    }

    val requestId = UUID.randomUUID().toString()
    val request =
        DaemonRequest(
            id = requestId,
            type = "mcp_request",
            method = "tools/call",
            params = buildJsonParams(toolName, arguments),
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

  fun readResource(uri: String, timeoutMs: Long): DaemonResponse {
    if (!isConnected()) {
      throw DaemonUnavailableException("Daemon socket connection is not available")
    }

    val requestId = UUID.randomUUID().toString()
    val request =
        DaemonRequest(
            id = requestId,
            type = "mcp_request",
            method = "resources/read",
            params = JsonObject(mapOf("uri" to JsonPrimitive(uri))),
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

  fun callDaemonMethod(
      method: String,
      timeoutMs: Long,
      params: JsonObject = JsonObject(emptyMap()),
  ): DaemonResponse {
    if (!isConnected()) {
      throw DaemonUnavailableException("Daemon socket connection is not available")
    }

    val requestId = UUID.randomUUID().toString()
    val request =
        DaemonRequest(
            id = requestId,
            type = "daemon_request",
            method = method,
            params = params,
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
    // Include sessionUuid in tool arguments to enable per-thread plan execution locking
    val argumentsWithSession = JsonObject(arguments.toMutableMap().apply {
      put("sessionUuid", JsonPrimitive(sessionUuid))
    })
    return JsonObject(mapOf("name" to JsonPrimitive(toolName), "arguments" to argumentsWithSession))
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
    val params: JsonObject,
)

@Serializable
internal data class DaemonResponse(
    val id: String,
    val type: String,
    val success: Boolean,
    val result: JsonElement? = null,
    val error: String? = null,
)

internal class DaemonUnavailableException(message: String) : Exception(message)

/** Interface for checking daemon connectivity. Allows for easy testing with fakes. */
internal interface DaemonConnectivityChecker {
  fun isDaemonAlive(): Boolean

  fun waitForDaemon(timeoutMs: Long): Boolean
}

/** Default implementation that checks actual daemon socket connectivity. */
internal class DefaultDaemonConnectivityChecker : DaemonConnectivityChecker {
  override fun isDaemonAlive(): Boolean {
    return DaemonSocketClient.isAvailable(DaemonSocketPaths.socketPath())
  }

  override fun waitForDaemon(timeoutMs: Long): Boolean {
    return DaemonSocketClient.waitForAvailability(DaemonSocketPaths.socketPath(), timeoutMs)
  }
}
