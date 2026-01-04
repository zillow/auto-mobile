package dev.jasonpearson.automobile.junit

import java.io.Closeable
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.atomic.AtomicBoolean
import kotlin.concurrent.thread
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

internal object DaemonHeartbeat {
  private const val DEFAULT_INTERVAL_MS = 10_000L
  private val json = Json { ignoreUnknownKeys = true }

  fun start(sessionId: String, intervalMs: Long = DEFAULT_INTERVAL_MS): Closeable {
    val running = AtomicBoolean(true)
    val heartbeatThread = thread(
        start = true,
        isDaemon = true,
        name = "auto-mobile-daemon-heartbeat") {
          while (running.get()) {
            try {
              sendHeartbeat(sessionId)
            } catch (_: Exception) {
              // Best-effort heartbeat; ignore failures
            }

            try {
              Thread.sleep(intervalMs)
            } catch (_: InterruptedException) {
              running.set(false)
            }
          }
        }

    return Closeable {
      running.set(false)
      heartbeatThread.interrupt()
    }
  }

  private fun sendHeartbeat(sessionId: String) {
    val port = readDaemonPort() ?: return
    val endpoint = URL("http://localhost:$port/heartbeat")
    val connection = endpoint.openConnection() as HttpURLConnection
    connection.requestMethod = "POST"
    connection.setRequestProperty("Content-Type", "application/json")
    connection.connectTimeout = 2000
    connection.readTimeout = 2000
    connection.doOutput = true

    val payload = """{"sessionId":"$sessionId"}"""
    connection.outputStream.use { it.write(payload.toByteArray()) }

    connection.inputStream.use { it.readBytes() }
    connection.disconnect()
  }

  private fun readDaemonPort(): Int? {
    val pidFile = File(daemonPidPath())
    if (!pidFile.exists()) {
      return null
    }

    return try {
      val content = pidFile.readText()
      val element = json.parseToJsonElement(content).jsonObject
      element["port"]?.jsonPrimitive?.intOrNull
    } catch (_: Exception) {
      null
    }
  }

  private fun daemonPidPath(): String {
    val userId = getUserId()
    return "/tmp/auto-mobile-daemon-$userId.pid"
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
    } catch (_: Exception) {
      userName
    }
  }
}
