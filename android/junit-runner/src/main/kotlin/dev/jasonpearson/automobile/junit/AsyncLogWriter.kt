package dev.jasonpearson.automobile.junit

import java.io.File
import java.util.concurrent.Executor
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

/**
 * Writes test logs asynchronously to avoid blocking the critical path. Uses a single-threaded
 * executor to maintain ordering.
 */
object AsyncLogWriter {
  private val executor: Executor =
      Executors.newSingleThreadExecutor { runnable ->
        val thread = Thread(runnable, "AsyncLogWriter")
        thread.isDaemon = false // Keep JVM alive until all logs are written
        thread
      }

  private val shutdownHook = Runtime.getRuntime().addShutdownHook(Thread { shutdown() })

  fun writeAsync(logFile: File, content: String, onComplete: ((File) -> Unit)? = null) {
    executor.execute {
      try {
        logFile.writeText(content)
        onComplete?.invoke(logFile)
      } catch (e: Exception) {
        System.err.println("Error writing log file ${logFile.absolutePath}: ${e.message}")
      }
    }
  }

  fun shutdown() {
    // Ensure all pending log writes complete before JVM shutdown
    val threadPoolExecutor = executor as? java.util.concurrent.ThreadPoolExecutor
    if (threadPoolExecutor != null) {
      threadPoolExecutor.shutdown()
      try {
        if (!threadPoolExecutor.awaitTermination(10, TimeUnit.SECONDS)) {
          threadPoolExecutor.shutdownNow()
        }
      } catch (e: InterruptedException) {
        threadPoolExecutor.shutdownNow()
        Thread.currentThread().interrupt()
      }
    }
  }
}
