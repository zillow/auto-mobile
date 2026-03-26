package dev.jasonpearson.automobile.junit

import java.io.File
import java.util.Base64
import org.junit.After
import org.junit.AfterClass
import org.junit.Assert.assertTrue
import org.junit.BeforeClass
import org.junit.Test

class JUnitRunnerMemoryTest {

  companion object {
    private const val ITERATIONS = 100
    private const val GC_INTERVAL = 10
    private const val DEFAULT_MAX_GROWTH_MB = 30L

    @BeforeClass
    @JvmStatic
    fun setUpClass() {
      MemoryDiagnostics.forceGc()
    }

    @AfterClass
    @JvmStatic
    fun tearDownClass() {
      MemoryDiagnostics.forceGc()
    }
  }

  @After
  fun tearDown() {
    SystemPropertyCache.clear()
    PlanCache.clear()
    RegexCache.clear()
    TestTimingCache.clear()
    MemoryMonitor.reset()
  }

  @Test
  fun shouldNotLeakOverManyPlanCacheOperations() {
    val maxGrowthBytes = resolveMaxGrowthBytes()
    val baseline = forceGcAndSnapshot()

    // Simulate repeated plan cache operations — the hot path during test execution
    val planContent = "name: memory-test\nsteps:\n  - tool: observe\n    withViewHierarchy: true"

    repeat(ITERATIONS) { iteration ->
      val key = "test-plans/plan-$iteration.yaml"
      PlanCache.cacheContent(key, planContent)
      PlanCache.getCachedContent(key)

      // Base64 encode (same as the executor does)
      Base64.getEncoder().encodeToString(planContent.toByteArray())

      if ((iteration + 1) % GC_INTERVAL == 0) {
        forceGcAndWait()
      }
    }

    forceGcAndWait()
    val finalSnapshot = MemoryDiagnostics.captureSnapshot()
    val deltaBytes = finalSnapshot.heapUsedBytes - baseline.heapUsedBytes

    if (deltaBytes > maxGrowthBytes) {
      val reason =
          "Heap growth ${formatBytes(deltaBytes)} exceeded limit ${formatBytes(maxGrowthBytes)}"
      MemoryDiagnostics.captureDiagnostics("junit_runner_memory_growth", reason)
      MemoryDiagnostics.dumpHeap("junit_runner_memory_growth", reason)
    }

    assertTrue(
        "Heap growth ${formatBytes(deltaBytes)} exceeded limit ${formatBytes(maxGrowthBytes)}",
        deltaBytes <= maxGrowthBytes,
    )
  }

  private fun forceGcAndSnapshot(): MemorySnapshot {
    forceGcAndWait()
    return MemoryDiagnostics.captureSnapshot()
  }

  private fun forceGcAndWait() {
    MemoryDiagnostics.forceGc()
    try {
      Thread.sleep(50)
    } catch (e: InterruptedException) {
      Thread.currentThread().interrupt()
    }
  }

  private fun resolveMaxGrowthBytes(): Long {
    val configured =
        System.getProperty(
                "automobile.junit.memory.max.growth.mb",
                DEFAULT_MAX_GROWTH_MB.toString(),
            )
            .toLongOrNull()
    val resolved = configured ?: DEFAULT_MAX_GROWTH_MB
    return resolved * 1024L * 1024L
  }

  private fun formatBytes(bytes: Long): String {
    val mb = bytes.toDouble() / (1024.0 * 1024.0)
    return String.format("%.2f MiB", mb)
  }
}
