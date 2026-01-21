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
      System.setProperty("automobile.junit.memory.heapdump.dir", "../heap-dump")
    }

    @AfterClass
    @JvmStatic
    fun tearDownClass() {
      System.clearProperty("automobile.junit.memory.heapdump.dir")
    }
  }

  @After
  fun cleanUp() {
    SystemPropertyCache.clear()
    PlanCache.clear()
    RegexCache.clear()
    TestTimingCache.clear()
    MemoryMonitor.reset()
  }

  @Test
  fun shouldNotLeakOverManyTests() {
    val runner = AutoMobileRunner(SimpleTestTargetClass::class.java)
    val method = SimpleTestTargetClass::class.java.getMethod("testWithAutoMobileAnnotation")
    val annotation = method.getAnnotation(AutoMobileTest::class.java)
    val resolvedPlanPath = runner.invokeResolvePlanPath("test-plans/launch-clock-app.yaml")

    val maxGrowthBytes = resolveMaxGrowthBytes()
    val baseline = forceGcAndSnapshot()

    repeat(ITERATIONS) { iteration ->
      runSimpleTest(
          runner = runner,
          annotation = annotation,
          methodName = method.name,
          resolvedPlanPath = resolvedPlanPath,
          iteration = iteration,
      )

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

  private fun runSimpleTest(
      runner: AutoMobileRunner,
      annotation: AutoMobileTest,
      methodName: String,
      resolvedPlanPath: String,
      iteration: Int,
  ) {
    val planContent =
        PlanCache.getCachedContent(resolvedPlanPath)
            ?: File(resolvedPlanPath).readText().also {
              PlanCache.cacheContent(resolvedPlanPath, it)
            }
    val base64Content = Base64.getEncoder().encodeToString(planContent.toByteArray())

    runner.invokeBuildDaemonExecutePlanArgs(
        base64Content,
        annotation,
        "session-$iteration",
        methodName,
        SimpleTestTargetClass::class.java.simpleName,
    )

    if (iteration % 25 == 0) {
      AutoMobileRunner.writeTestLog(
          testName = "memoryIteration$iteration",
          className = "JUnitRunnerMemoryTest",
          stdout = "Memory iteration $iteration",
          stderr = "",
          exitCode = 0,
          executionTimeMs = 1L,
          success = true,
      )
    }
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

private fun AutoMobileRunner.invokeResolvePlanPath(planPath: String): String {
  val method = this::class.java.getDeclaredMethod("resolvePlanPath", String::class.java)
  method.isAccessible = true
  return method.invoke(this, planPath) as String
}
