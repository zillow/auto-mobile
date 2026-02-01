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

interface TestRecordingClient {
  fun startTestRecording(platform: String? = null): TestRecordingStartResult

  fun stopTestRecording(
      recordingId: String? = null,
      planName: String? = null,
  ): TestRecordingStopResult
}

class TestRecordingSocketClient(
    private val socketPathValue: String = TestRecordingSocketPaths.socketPath(),
    private val json: Json = Json {
      ignoreUnknownKeys = true
      explicitNulls = false
    },
) : TestRecordingClient {
  override fun startTestRecording(platform: String?): TestRecordingStartResult {
    val response = sendRequest(TestRecordingSocketCommand(command = "start", platform = platform))
    ensureSuccess(response)
    return TestRecordingStartResult(
        recordingId = response.recordingId ?: throw missingField("recordingId"),
        startedAt = response.startedAt ?: throw missingField("startedAt"),
        deviceId = response.deviceId,
        platform = response.platform,
    )
  }

  override fun stopTestRecording(
      recordingId: String?,
      planName: String?,
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

data class FakeTestRecordingStartCall(val platform: String?)

data class FakeTestRecordingStopCall(val recordingId: String?, val planName: String?)

class FakeTestRecordingClient(
    private val startResponses: List<TestRecordingStartResult> = emptyList(),
    private val stopResponses: List<TestRecordingStopResult> = emptyList(),
) : TestRecordingClient {
  val startCalls = mutableListOf<FakeTestRecordingStartCall>()
  val stopCalls = mutableListOf<FakeTestRecordingStopCall>()
  private var startIndex = 0
  private var stopIndex = 0

  override fun startTestRecording(platform: String?): TestRecordingStartResult {
    startCalls.add(FakeTestRecordingStartCall(platform))
    if (startResponses.isEmpty()) {
      throw IllegalStateException("No start responses configured")
    }
    val response = startResponses.getOrNull(startIndex) ?: startResponses.last()
    startIndex += 1
    return response
  }

  override fun stopTestRecording(recordingId: String?, planName: String?): TestRecordingStopResult {
    stopCalls.add(FakeTestRecordingStopCall(recordingId, planName))
    if (stopResponses.isEmpty()) {
      throw IllegalStateException("No stop responses configured")
    }
    val response = stopResponses.getOrNull(stopIndex) ?: stopResponses.last()
    stopIndex += 1
    return response
  }

  companion object {
    /** Creates a FakeTestRecordingClient with sample responses for UI development/testing. */
    fun withSampleResponses(): FakeTestRecordingClient {
      val sampleYaml =
          """
          |name: recorded-plan-2026-02-01T10-30-00
          |description: Recorded test plan with 5 steps
          |steps:
          |  - tool: tapOn
          |    params:
          |      elementId: "com.example.app:id/login_button"
          |      description: "Login button"
          |  - tool: inputText
          |    params:
          |      text: "user@example.com"
          |      elementId: "com.example.app:id/email_field"
          |  - tool: inputText
          |    params:
          |      text: "password123"
          |      elementId: "com.example.app:id/password_field"
          |  - tool: tapOn
          |    params:
          |      elementId: "com.example.app:id/submit_button"
          |      description: "Submit button"
          |  - tool: observe
          |    params:
          |      waitForIdle: true
          """
              .trimMargin()

      return FakeTestRecordingClient(
          startResponses =
              listOf(
                  TestRecordingStartResult(
                      recordingId = "rec-001",
                      startedAt = "2026-02-01T10:30:00Z",
                      deviceId = "emulator-5554",
                      platform = "android",
                  )
              ),
          stopResponses =
              listOf(
                  TestRecordingStopResult(
                      recordingId = "rec-001",
                      startedAt = "2026-02-01T10:30:00Z",
                      stoppedAt = "2026-02-01T10:30:12Z",
                      durationMs = 12345L,
                      planName = "recorded-plan-2026-02-01T10-30-00",
                      planContent = sampleYaml,
                      stepCount = 5,
                      deviceId = "emulator-5554",
                      platform = "android",
                  )
              ),
      )
    }
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
