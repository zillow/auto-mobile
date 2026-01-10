package dev.jasonpearson.automobile.junit

import java.util.concurrent.atomic.AtomicInteger
import kotlin.math.absoluteValue

internal object MemoryMonitor {
  private const val DEFAULT_MAX_GROWTH_MB = 30L
  private const val DEFAULT_SAMPLE_INTERVAL = 1
  private const val BYTES_PER_MB = 1024L * 1024L

  private val enabled: Boolean by lazy {
    System.getProperty("automobile.junit.memory.monitor.enabled", "false").toBoolean()
  }
  private val sampleInterval: Int by lazy {
    val configured =
        System.getProperty("automobile.junit.memory.monitor.sample.interval", DEFAULT_SAMPLE_INTERVAL.toString())
            .toIntOrNull()
    if (configured == null || configured <= 0) DEFAULT_SAMPLE_INTERVAL else configured
  }
  private val maxGrowthBytes: Long by lazy {
    val configured =
        System.getProperty("automobile.junit.memory.max.growth.mb", DEFAULT_MAX_GROWTH_MB.toString())
            .toLongOrNull()
    val resolved = configured ?: DEFAULT_MAX_GROWTH_MB
    resolved * BYTES_PER_MB
  }
  private val logEnabled: Boolean by lazy {
    System.getProperty("automobile.junit.memory.monitor.log", "true").toBoolean()
  }
  private val diagnosticsEnabled: Boolean by lazy {
    System.getProperty("automobile.junit.memory.diagnostics.enabled", "true").toBoolean()
  }
  private val dumpOnFailure: Boolean by lazy {
    System.getProperty("automobile.junit.memory.dump.on.failure", "true").toBoolean()
  }
  private val dumpOnThreshold: Boolean by lazy {
    System.getProperty("automobile.junit.memory.dump.on.threshold", "true").toBoolean()
  }

  private val sampleCounter = AtomicInteger(0)
  private val threadSnapshot = ThreadLocal<MemorySnapshot?>()
  private val threadLabel = ThreadLocal<String?>()

  fun onTestStart(className: String, methodName: String) {
    if (!enabled) {
      return
    }
    val count = sampleCounter.incrementAndGet()
    if (count % sampleInterval != 0) {
      return
    }
    threadSnapshot.set(MemoryDiagnostics.captureSnapshot())
    threadLabel.set("$className#$methodName")
  }

  fun onTestFinish(
      className: String,
      methodName: String,
      success: Boolean,
      errorMessage: String? = null,
  ) {
    if (!enabled) {
      return
    }
    val startSnapshot = threadSnapshot.get() ?: return
    threadSnapshot.remove()

    val label = threadLabel.get() ?: "$className#$methodName"
    threadLabel.remove()

    val endSnapshot = MemoryDiagnostics.captureSnapshot()
    val deltaBytes = endSnapshot.heapUsedBytes - startSnapshot.heapUsedBytes
    val deltaMb = deltaBytes.toDouble() / BYTES_PER_MB

    if (logEnabled) {
      val status = if (success) "PASS" else "FAIL"
      val message =
          "AutoMobileRunner: Memory $status $label heapUsedDelta=${String.format("%.2f", deltaMb)} MiB " +
              "(start=${formatBytes(startSnapshot.heapUsedBytes)}, end=${formatBytes(endSnapshot.heapUsedBytes)})"
      println(message)
    }

    val thresholdBreached = maxGrowthBytes > 0 && deltaBytes > maxGrowthBytes
    val shouldCaptureDiagnostics = diagnosticsEnabled && (!success || thresholdBreached)
    val shouldDumpHeap =
        (dumpOnFailure && !success) || (dumpOnThreshold && thresholdBreached)

    if (shouldCaptureDiagnostics || shouldDumpHeap) {
      val reason = buildString {
        if (!success) {
          append("test failure")
          if (!errorMessage.isNullOrBlank()) {
            append(": ").append(errorMessage)
          }
        }
        if (thresholdBreached) {
          if (isNotEmpty()) {
            append("; ")
          }
          append(
              "heap growth ${formatBytes(deltaBytes.absoluteValue)} exceeded limit ${formatBytes(maxGrowthBytes)}"
          )
        }
      }

      val diagnosticLabel = if (success) "memory_threshold_$label" else "test_failure_$label"
      if (shouldCaptureDiagnostics) {
        MemoryDiagnostics.captureDiagnostics(diagnosticLabel, reason)
      }
      if (shouldDumpHeap) {
        MemoryDiagnostics.dumpHeap(diagnosticLabel, reason)
      }
    }
  }

  fun reset() {
    sampleCounter.set(0)
    threadSnapshot.remove()
    threadLabel.remove()
  }

  private fun formatBytes(bytes: Long): String {
    val mb = bytes.toDouble() / BYTES_PER_MB
    return String.format("%.2f MiB", mb)
  }
}
