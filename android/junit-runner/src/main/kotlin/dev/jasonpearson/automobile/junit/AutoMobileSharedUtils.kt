package dev.jasonpearson.automobile.junit

import java.util.concurrent.TimeUnit

/** Shared utilities for AutoMobile tests. */
object AutoMobileSharedUtils {
  // Phase 5: Lazy device checker initialization
  @JvmStatic internal var testDeviceChecker: DeviceChecker? = null
  private val defaultDeviceChecker: DeviceChecker by lazy { DeviceAvailabilityChecker() }
  val deviceChecker: DeviceChecker
    get() = testDeviceChecker ?: defaultDeviceChecker

  fun executeCommand(
      command: List<String>,
      timeoutMs: Long,
      environmentOverrides: Map<String, String> = emptyMap(),
  ): CommandResult {
    val processBuilder = ProcessBuilder(command)
    if (environmentOverrides.isNotEmpty()) {
      val environment = processBuilder.environment()
      environmentOverrides.forEach { (key, value) ->
        if (value.isNotBlank()) {
          environment[key] = value
        }
      }
    }
    val process = processBuilder.start()

    // CRITICAL FIX: Close stdin immediately to prevent the process from hanging
    // waiting for input. This is essential for non-interactive command execution.
    process.outputStream.close()

    // Read output and error streams concurrently to prevent deadlock
    val outputFuture =
        java.util.concurrent.CompletableFuture.supplyAsync {
          process.inputStream.bufferedReader().use { it.readText() }
        }

    val errorFuture =
        java.util.concurrent.CompletableFuture.supplyAsync {
          process.errorStream.bufferedReader().use { it.readText() }
        }

    val completed = process.waitFor(timeoutMs, TimeUnit.MILLISECONDS)

    if (!completed) {
      process.destroyForcibly()
      // Wait a bit to ensure process is destroyed
      process.waitFor(5, TimeUnit.SECONDS)
      throw RuntimeException("Command execution timed out after ${timeoutMs}ms")
    }

    val exitCode = process.exitValue()
    val output = outputFuture.get(5, TimeUnit.SECONDS)
    val errorOutput = errorFuture.get(5, TimeUnit.SECONDS)

    // Write process errors to STDERR so they appear in test logs
    if (errorOutput.isNotEmpty()) {
      System.err.print(errorOutput)
    }

    return CommandResult(exitCode, output, errorOutput)
  }
}

/** Shared command result data class. */
data class CommandResult(val exitCode: Int, val output: String, val errorOutput: String)

/** Interface for checking device availability. */
interface DeviceChecker {
  fun checkDeviceAvailability()

  fun areDevicesAvailable(): Boolean

  fun getDeviceCount(): Int

  /** Get the last error message from device availability check, if any. */
  fun getLastError(): String? = null
}

/**
 * Shared device availability checker for AutoMobile tests. Handles checking for connected Android
 * devices via adb with retry logic for transient ADB server issues.
 *
 * Uses a JVM-wide lock to prevent parallel test executors from racing on ADB server startup.
 */
class DeviceAvailabilityChecker : DeviceChecker {
  @Volatile private var deviceCount = 0

  @Volatile private var checkComplete = false

  @Volatile private var lastError: String? = null

  companion object {
    private const val MAX_RETRIES = 3
    private const val INITIAL_BACKOFF_MS = 500L
    private const val COMMAND_TIMEOUT_MS = 10000L // 10 seconds per attempt

    // JVM-wide lock to prevent parallel test executors from racing on ADB server startup
    private val adbLock = java.util.concurrent.locks.ReentrantLock()
  }

  override fun checkDeviceAvailability() {
    if (checkComplete) {
      return
    }

    // Acquire lock to prevent parallel ADB operations
    adbLock.lock()
    try {
      // Double-check after acquiring lock
      if (checkComplete) {
        return
      }

      checkDeviceAvailabilityLocked()
    } finally {
      adbLock.unlock()
    }
  }

  private fun checkDeviceAvailabilityLocked() {
    println("Checking for available Android devices...")

    val command = listOf("${getAndroidHome()}/platform-tools/adb", "devices")
    println("Running device check: ${command.joinToString(" ")}")

    var lastException: Exception? = null
    var lastResult: CommandResult? = null

    for (attempt in 1..MAX_RETRIES) {
      try {
        val result = executeCommand(command, COMMAND_TIMEOUT_MS)
        lastResult = result

        val debugMode = SystemPropertyCache.getBoolean("automobile.debug", false)
        if (debugMode || attempt > 1) {
          println("Device check attempt $attempt output:\n${result.output}")
          if (result.errorOutput.isNotEmpty()) {
            println("Device check attempt $attempt errors:\n${result.errorOutput}")
          }
          println("Device check attempt $attempt exit code: ${result.exitCode}")
        }

        // Check for ADB server issues that warrant a retry
        val isAdbServerError =
            result.errorOutput.contains("ADB server didn't ACK") ||
                result.errorOutput.contains("Address already in use") ||
                result.errorOutput.contains("failed to start daemon") ||
                result.errorOutput.contains("cannot connect to daemon")

        if (result.exitCode == 0) {
          // Parse adb devices output to count connected devices
          deviceCount =
              result.output
                  .lines()
                  .drop(1) // Skip the "List of devices attached" header
                  .filter { line -> line.trim().isNotEmpty() && line.contains("\t") }
                  .size

          if (deviceCount > 0) {
            println("Found $deviceCount connected device(s)")
            println("Device availability check completed successfully")
          } else {
            println("No devices found - AutoMobile tests will be skipped")
          }

          lastError = null
          checkComplete = true
          return
        } else if (isAdbServerError && attempt < MAX_RETRIES) {
          // ADB server issue - retry with backoff
          val backoffMs = INITIAL_BACKOFF_MS * (1 shl (attempt - 1)) // Exponential backoff
          println(
              "ADB server issue detected (attempt $attempt/$MAX_RETRIES), retrying in ${backoffMs}ms..."
          )
          Thread.sleep(backoffMs)
          continue
        } else {
          // Non-retryable error or max retries reached
          lastError = buildAdbErrorMessage(result)
          println("Warning: Device check failed with exit code ${result.exitCode}")
          if (attempt == MAX_RETRIES && isAdbServerError) {
            println(
                "ADB server failed to start after $MAX_RETRIES attempts. This may be a CI environment issue."
            )
          }
        }
      } catch (e: Exception) {
        lastException = e
        println("Error during device availability check (attempt $attempt): ${e.message}")

        if (attempt < MAX_RETRIES) {
          val backoffMs = INITIAL_BACKOFF_MS * (1 shl (attempt - 1))
          println("Retrying in ${backoffMs}ms...")
          Thread.sleep(backoffMs)
          continue
        }
      }
    }

    // All retries exhausted
    lastError = lastException?.message ?: lastResult?.let { buildAdbErrorMessage(it) }
    deviceCount = 0
    checkComplete = true
  }

  private fun buildAdbErrorMessage(result: CommandResult): String {
    val errorDetails = StringBuilder()
    errorDetails.append("ADB device check failed (exit code ${result.exitCode})")

    if (result.errorOutput.contains("Address already in use")) {
      errorDetails.append(": ADB server port conflict - another process may be using port 5037")
    } else if (result.errorOutput.contains("failed to start daemon")) {
      errorDetails.append(": ADB daemon failed to start")
    } else if (result.errorOutput.contains("cannot connect to daemon")) {
      errorDetails.append(": Cannot connect to ADB daemon")
    } else if (result.errorOutput.isNotEmpty()) {
      errorDetails.append(": ${result.errorOutput.take(200)}")
    }

    return errorDetails.toString()
  }

  /** Get the last error message from device availability check, if any. */
  override fun getLastError(): String? = lastError

  override fun areDevicesAvailable(): Boolean {
    if (!checkComplete) {
      checkDeviceAvailability()
    }
    return deviceCount > 0
  }

  /**
   * Get the number of connected Android devices. This can be used to limit parallelism to match
   * available devices.
   */
  override fun getDeviceCount(): Int {
    if (!checkComplete) {
      checkDeviceAvailability()
    }
    return deviceCount
  }

  private fun executeCommand(command: List<String>, timeoutMs: Long): CommandResult {
    return AutoMobileSharedUtils.executeCommand(command, timeoutMs)
  }

  private fun getAndroidHome(): String {
    val androidHome =
        System.getenv("ANDROID_HOME")
            ?: System.getenv("ANDROID_SDK_ROOT")
            ?: System.getenv("ANDROID_SDK_HOME")
            ?: throw IllegalStateException("ANDROID_HOME environment variable is not set")

    // Validate the path to prevent command injection
    // Phase 6: Use cached regex to avoid repeated compilation
    if (androidHome.contains(RegexCache.getRegex("[;&|`\$()<>\\s]"))) {
      throw IllegalStateException("ANDROID_HOME contains invalid characters")
    }

    // Ensure the path exists
    if (!java.io.File(androidHome).exists()) {
      throw IllegalStateException("ANDROID_HOME path does not exist: $androidHome")
    }

    return androidHome
  }
}
