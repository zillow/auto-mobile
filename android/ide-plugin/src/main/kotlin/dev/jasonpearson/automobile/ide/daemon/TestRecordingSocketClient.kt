package dev.jasonpearson.automobile.ide.daemon

import java.io.BufferedReader
import java.io.BufferedWriter
import java.io.File
import java.io.InputStreamReader
import java.io.OutputStreamWriter
import java.net.UnixDomainSocketAddress
import java.nio.channels.Channels
import java.nio.channels.SocketChannel
import java.nio.charset.StandardCharsets
import java.nio.file.Files
import kotlinx.serialization.Serializable
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json

class TestRecordingSocketClient(
    private val socketPathValue: String = TestRecordingSocketPaths.socketPath(),
    private val json: Json = Json { ignoreUnknownKeys = true; explicitNulls = false },
) {
  fun startTestRecording(platform: String? = null): TestRecordingStartResult {
    val response = sendRequest(TestRecordingSocketCommand(command = "start", platform = platform))
    ensureSuccess(response)
    return TestRecordingStartResult(
        recordingId = response.recordingId ?: throw missingField("recordingId"),
        startedAt = response.startedAt ?: throw missingField("startedAt"),
        deviceId = response.deviceId,
        platform = response.platform,
    )
  }

  fun stopTestRecording(
      recordingId: String? = null,
      planName: String? = null,
  ): TestRecordingStopResult {
    val response =
        sendRequest(
            TestRecordingSocketCommand(
                command = "stop",
                recordingId = recordingId,
                planName = planName,
            )
        )
    ensureSuccess(response)
    return TestRecordingStopResult(
        recordingId = response.recordingId ?: throw missingField("recordingId"),
        startedAt = response.startedAt ?: throw missingField("startedAt"),
        stoppedAt = response.stoppedAt ?: throw missingField("stoppedAt"),
        durationMs = response.durationMs ?: throw missingField("durationMs"),
        planName = response.planName ?: throw missingField("planName"),
        planContent = response.planContent ?: throw missingField("planContent"),
        stepCount = response.stepCount ?: throw missingField("stepCount"),
        deviceId = response.deviceId,
        platform = response.platform,
    )
  }

  private fun sendRequest(request: TestRecordingSocketCommand): TestRecordingSocketResponse {
    ensureSocketExists()

    val address = UnixDomainSocketAddress.of(socketPathValue)
    SocketChannel.open(address).use { channel ->
      val reader =
          BufferedReader(
              InputStreamReader(Channels.newInputStream(channel), StandardCharsets.UTF_8)
          )
      val writer =
          BufferedWriter(
              OutputStreamWriter(Channels.newOutputStream(channel), StandardCharsets.UTF_8)
          )

      writer.write(json.encodeToString(request))
      writer.newLine()
      writer.flush()

      val line = reader.readLine() ?: throw McpConnectionException("Test recording socket closed")
      return json.decodeFromString(line)
    }
  }

  private fun ensureSocketExists() {
    val path = File(socketPathValue).toPath()
    if (!Files.exists(path)) {
      throw McpConnectionException("Test recording socket not found at $socketPathValue")
    }
  }

  private fun ensureSuccess(response: TestRecordingSocketResponse) {
    if (!response.success) {
      throw McpConnectionException(response.error ?: "Test recording request failed")
    }
  }

  private fun missingField(name: String): McpConnectionException {
    return McpConnectionException("Test recording response missing $name")
  }
}

object TestRecordingSocketPaths {
  fun socketPath(): String {
    val home = System.getProperty("user.home", "").ifBlank { "." }
    return File(home, ".auto-mobile/test-recording.sock").path
  }
}

@Serializable
private data class TestRecordingSocketCommand(
    val command: String,
    val deviceId: String? = null,
    val platform: String? = null,
    val recordingId: String? = null,
    val planName: String? = null,
)

@Serializable
private data class TestRecordingSocketResponse(
    val success: Boolean,
    val recordingId: String? = null,
    val startedAt: String? = null,
    val stoppedAt: String? = null,
    val deviceId: String? = null,
    val platform: String? = null,
    val planName: String? = null,
    val planContent: String? = null,
    val stepCount: Int? = null,
    val durationMs: Long? = null,
    val error: String? = null,
)
