package com.zillow.automobile.junit

import java.util.concurrent.TimeUnit

/** Shared utilities for AutoMobile tests. */
object AutoMobileSharedUtils {
  val deviceChecker = DeviceAvailabilityChecker()

  fun executeCommand(command: List<String>, timeoutMs: Long): CommandResult {
    val process = ProcessBuilder(command).start()

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
      throw RuntimeException("Command execution timed out after ${timeoutMs}ms")
    }

    val exitCode = process.exitValue()
    val output = outputFuture.get(5, TimeUnit.SECONDS)
    val errorOutput = errorFuture.get(5, TimeUnit.SECONDS)

    // Write CLI errors to STDERR so they appear in test logs
    if (errorOutput.isNotEmpty()) {
      System.err.print(errorOutput)
    }

    return CommandResult(exitCode, output, errorOutput)
  }
}

/** Shared command result data class. */
data class CommandResult(val exitCode: Int, val output: String, val errorOutput: String)

/**
 * Shared device availability checker for AutoMobile tests. Handles checking for connected Android
 * devices via adb.
 */
class DeviceAvailabilityChecker {
  @Volatile private var devicesAvailable = false

  @Volatile private var checkComplete = false

  fun checkDeviceAvailability() {
    if (checkComplete) {
      return
    }

    println("Checking for available Android devices...")

    try {
      val command = listOf("${getAndroidHome()}/platform-tools/adb", "devices")
      println("Running device check: ${command.joinToString(" ")}")

      val result = executeCommand(command, 5000) // 5 second timeout

      val debugMode = System.getProperty("automobile.debug", "false").toBoolean()
      if (debugMode) {
        println("Device check output:\n${result.output}")
        if (result.errorOutput.isNotEmpty()) {
          println("Device check errors:\n${result.errorOutput}")
        }
        println("Device check exit code: ${result.exitCode}")
      }

      if (result.exitCode == 0) {
        // Parse adb devices output to count connected devices
        val deviceCount =
            result.output
                .lines()
                .drop(1) // Skip the "List of devices attached" header
                .filter { line -> line.trim().isNotEmpty() && line.contains("\t") }
                .size

        devicesAvailable = deviceCount > 0

        if (devicesAvailable) {
          println("Found $deviceCount connected device(s)")
          println("Device availability check completed successfully")
        } else {
          println("No devices found - AutoMobile tests will be skipped")
        }

        checkComplete = true
      } else {
        println("Warning: Device check failed with exit code ${result.exitCode}")
        devicesAvailable = false
        checkComplete = true
      }
    } catch (e: Exception) {
      println("Error during device availability check: ${e.message}")
      devicesAvailable = false
      checkComplete = true
    }
  }

  fun areDevicesAvailable(): Boolean {
    if (!checkComplete) {
      checkDeviceAvailability()
    }
    return devicesAvailable
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
    if (androidHome.contains(Regex("[;&|`\$()<>\\s]"))) {
      throw IllegalStateException("ANDROID_HOME contains invalid characters")
    }

    // Ensure the path exists
    if (!java.io.File(androidHome).exists()) {
      throw IllegalStateException("ANDROID_HOME path does not exist: $androidHome")
    }

    return androidHome
  }
}
