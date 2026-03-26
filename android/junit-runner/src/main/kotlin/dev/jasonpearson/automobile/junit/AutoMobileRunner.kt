package dev.jasonpearson.automobile.junit

import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import kotlin.random.Random
import org.junit.runner.notification.Failure
import org.junit.runner.notification.RunNotifier
import org.junit.runners.BlockJUnit4ClassRunner
import org.junit.runners.model.FrameworkMethod

/**
 * Custom JUnit runner for AutoMobile test execution.
 *
 * Provides device-aware parallel execution, intelligent test ordering, and lifecycle management
 * (heartbeat, memory monitoring). Tests use the [AutoMobilePlan] DSL inside standard @Test methods
 * to execute YAML plans with AI-assisted recovery.
 */
class AutoMobileRunner(private val klass: Class<*>) : BlockJUnit4ClassRunner(klass) {

  private val orderedChildren: List<FrameworkMethod> by lazy {
    val children = super.getChildren()

    val requestedStrategy =
        parseTimingOrderingStrategy(
            SystemPropertyCache.get("automobile.junit.timing.ordering", "auto").trim().lowercase()
        )
    val parallelForks =
        if (requestedStrategy == TimingOrderingStrategy.AUTO) {
          resolveEffectiveParallelForks()
        } else {
          1
        }
    val selection = resolveTimingOrderingSelection(requestedStrategy, parallelForks)
    val timingAvailable = TestTimingCache.hasTimings()
    logTimingOrdering(selection, timingAvailable)

    val timingOrderingActive = selection.resolved != TimingOrderingStrategy.NONE && timingAvailable
    val timingOrderedChildren =
        if (!timingOrderingActive) {
          children
        } else {
          orderChildrenByTiming(children, selection.resolved)
        }

    val shuffleEnabled = SystemPropertyCache.getBoolean("automobile.junit.shuffle.enabled", true)
    if (!shuffleEnabled || timingOrderedChildren.size <= 1 || timingOrderingActive) {
      if (shuffleEnabled && timingOrderingActive) {
        println(
            "AutoMobileRunner: Shuffle enabled but timing ordering is active; preserving timing order."
        )
      }
      timingOrderedChildren
    } else {
      val seedProperty = SystemPropertyCache.get("automobile.junit.shuffle.seed", "").trim()
      val seed = seedProperty.toLongOrNull() ?: System.currentTimeMillis()
      println("AutoMobileRunner: Shuffling test order with seed=$seed")
      timingOrderedChildren.shuffled(Random(seed))
    }
  }

  override fun run(notifier: RunNotifier) {
    // Skip the entire class if no devices are available
    if (!AutoMobileSharedUtils.deviceChecker.areDevicesAvailable()) {
      println("No Android devices found - skipping entire test class: ${klass.simpleName}")

      // Mark all tests in the class as ignored
      for (child in children) {
        val description = describeChild(child)
        notifier.fireTestIgnored(description)
      }
      return
    }

    // Proceed with normal execution if devices are available
    val heartbeat = DaemonHeartbeat.startBackground()
    try {
      super.run(notifier)
    } finally {
      heartbeat.close()
    }
  }

  override fun getChildren(): List<FrameworkMethod> {
    return orderedChildren
  }

  // ── Timing-based test ordering ────────────────────────────────────────────

  private enum class TimingOrderingStrategy(val label: String) {
    NONE("none"),
    AUTO("auto"),
    DURATION_ASC("shortest-first"),
    DURATION_DESC("longest-first"),
  }

  private data class TimingOrderingSelection(
      val requested: TimingOrderingStrategy,
      val resolved: TimingOrderingStrategy,
  )

  private data class TimingCandidate(
      val method: FrameworkMethod,
      val index: Int,
      val durationMs: Int?,
  )

  private fun parseTimingOrderingStrategy(rawValue: String): TimingOrderingStrategy {
    return when (rawValue) {
      "auto" -> TimingOrderingStrategy.AUTO
      "duration-asc",
      "duration_asc",
      "shortest-first",
      "shortest_first",
      "shortest" -> TimingOrderingStrategy.DURATION_ASC
      "duration-desc",
      "duration_desc",
      "longest-first",
      "longest_first",
      "longest" -> TimingOrderingStrategy.DURATION_DESC
      "none",
      "off",
      "false",
      "disabled" -> TimingOrderingStrategy.NONE
      else -> TimingOrderingStrategy.NONE
    }
  }

  private fun resolveTimingOrderingSelection(
      requested: TimingOrderingStrategy,
      parallelForks: Int,
  ): TimingOrderingSelection {
    val resolved =
        when (requested) {
          TimingOrderingStrategy.AUTO ->
              if (parallelForks > 1) {
                TimingOrderingStrategy.DURATION_DESC
              } else {
                TimingOrderingStrategy.DURATION_ASC
              }
          else -> requested
        }
    return TimingOrderingSelection(requested, resolved)
  }

  private fun resolveEffectiveParallelForks(): Int {
    val configuredForks =
        SystemPropertyCache.get(
                "junit.parallel.forks",
                Runtime.getRuntime().availableProcessors().toString(),
            )
            .toIntOrNull() ?: 2
    val safeConfiguredForks = if (configuredForks > 0) configuredForks else 1
    val deviceCount = AutoMobileSharedUtils.deviceChecker.getDeviceCount()
    return if (deviceCount > 0) {
      safeConfiguredForks.coerceAtMost(deviceCount)
    } else {
      safeConfiguredForks
    }
  }

  private fun logTimingOrdering(selection: TimingOrderingSelection, timingAvailable: Boolean) {
    val message =
        if (selection.requested == TimingOrderingStrategy.AUTO) {
          "AutoMobileRunner: Timing ordering=auto (resolved=${selection.resolved.label}), timing data available=$timingAvailable"
        } else {
          "AutoMobileRunner: Timing ordering=${selection.requested.label}, timing data available=$timingAvailable"
        }
    println(message)
  }

  private fun orderChildrenByTiming(
      children: List<FrameworkMethod>,
      strategy: TimingOrderingStrategy,
  ): List<FrameworkMethod> {
    if (strategy == TimingOrderingStrategy.NONE || children.isEmpty()) {
      return children
    }

    val className = klass.simpleName
    val candidates =
        children.mapIndexed { index, method ->
          TimingCandidate(
              method = method,
              index = index,
              durationMs = TestTimingCache.getTiming(className, method.name)?.averageDurationMs,
          )
        }

    val withTiming = candidates.filter { it.durationMs != null }
    val withoutTiming = candidates.filter { it.durationMs == null }

    if (withTiming.isEmpty()) {
      return children
    }

    val sortedWithTiming =
        when (strategy) {
          TimingOrderingStrategy.DURATION_DESC ->
              withTiming.sortedWith(
                  compareByDescending<TimingCandidate> { it.durationMs }.thenBy { it.index }
              )
          TimingOrderingStrategy.DURATION_ASC ->
              withTiming.sortedWith(
                  compareBy<TimingCandidate> { it.durationMs }.thenBy { it.index }
              )
          TimingOrderingStrategy.AUTO,
          TimingOrderingStrategy.NONE -> withTiming
        }

    val sortedWithoutTiming = withoutTiming.sortedBy { it.index }

    return sortedWithTiming.map { it.method } + sortedWithoutTiming.map { it.method }
  }

  // ── Parallel execution ────────────────────────────────────────────────────

  override fun childrenInvoker(notifier: RunNotifier): org.junit.runners.model.Statement {
    val configuredForks =
        SystemPropertyCache.get(
                "junit.parallel.forks",
                Runtime.getRuntime().availableProcessors().toString(),
            )
            .toIntOrNull() ?: 2

    val deviceCount = AutoMobileSharedUtils.deviceChecker.getDeviceCount()
    val maxParallelForks =
        if (deviceCount > 0) {
          val effectiveForks = configuredForks.coerceAtMost(deviceCount)
          if (effectiveForks < configuredForks) {
            println(
                "AutoMobileRunner: Limiting parallelism from $configuredForks to $effectiveForks (only $deviceCount device(s) available)"
            )
          }
          effectiveForks
        } else {
          configuredForks
        }

    val children = getChildren()

    println(
        "AutoMobileRunner: childrenInvoker called with ${children.size} children, maxParallelForks=$maxParallelForks, deviceCount=$deviceCount"
    )

    if (children.size <= 1 || maxParallelForks <= 1) {
      println(
          "AutoMobileRunner: Using SEQUENTIAL execution (children=${children.size}, forks=$maxParallelForks)"
      )
      return super.childrenInvoker(notifier)
    }

    println("AutoMobileRunner: Using PARALLEL execution with $maxParallelForks threads")

    return object : org.junit.runners.model.Statement() {
      override fun evaluate() {
        val executor = Executors.newFixedThreadPool(maxParallelForks.coerceAtMost(children.size))

        try {
          val futures =
              children.map { child ->
                executor.submit {
                  println(
                      "[${Thread.currentThread().name}] Starting test: ${describeChild(child).methodName}"
                  )
                  runChild(child, SynchronizedRunNotifier(notifier))
                  println(
                      "[${Thread.currentThread().name}] Finished test: ${describeChild(child).methodName}"
                  )
                }
              }

          val exceptions = mutableListOf<Throwable>()
          futures.forEach { future ->
            try {
              future.get()
            } catch (e: Exception) {
              exceptions.add(e.cause ?: e)
            }
          }

          if (exceptions.isNotEmpty()) {
            throw exceptions.first()
          }
        } finally {
          executor.shutdown()
          executor.awaitTermination(1, TimeUnit.HOURS)
        }
      }
    }
  }

  override fun runChild(method: FrameworkMethod, notifier: RunNotifier) {
    val className = klass.simpleName
    MemoryMonitor.onTestStart(className, method.name)
    val outcomeNotifier = OutcomeTrackingRunNotifier(notifier)
    try {
      super.runChild(method, outcomeNotifier)
    } catch (e: Exception) {
      outcomeNotifier.recordFailure(e.message)
      throw e
    } finally {
      MemoryMonitor.onTestFinish(
          className,
          method.name,
          outcomeNotifier.wasSuccessful(),
          outcomeNotifier.failureMessage(),
      )
    }
  }
}

/** Thread-safe wrapper for RunNotifier to ensure synchronized access from parallel test threads. */
private class SynchronizedRunNotifier(private val delegate: RunNotifier) : RunNotifier() {

  @Synchronized
  override fun fireTestStarted(description: org.junit.runner.Description) {
    delegate.fireTestStarted(description)
  }

  @Synchronized
  override fun fireTestFinished(description: org.junit.runner.Description) {
    delegate.fireTestFinished(description)
  }

  @Synchronized
  override fun fireTestFailure(failure: Failure) {
    delegate.fireTestFailure(failure)
  }

  @Synchronized
  override fun fireTestAssumptionFailed(failure: Failure) {
    delegate.fireTestAssumptionFailed(failure)
  }

  @Synchronized
  override fun fireTestIgnored(description: org.junit.runner.Description) {
    delegate.fireTestIgnored(description)
  }

  @Synchronized
  override fun addListener(listener: org.junit.runner.notification.RunListener) {
    delegate.addListener(listener)
  }

  @Synchronized
  override fun removeListener(listener: org.junit.runner.notification.RunListener) {
    delegate.removeListener(listener)
  }
}

private class OutcomeTrackingRunNotifier(private val delegate: RunNotifier) : RunNotifier() {
  @Volatile private var failed = false
  @Volatile private var failureMessage: String? = null

  fun wasSuccessful(): Boolean {
    return !failed
  }

  fun failureMessage(): String? {
    return failureMessage
  }

  fun recordFailure(message: String?) {
    if (!failed) {
      failed = true
      failureMessage = message
    }
  }

  override fun fireTestStarted(description: org.junit.runner.Description) {
    delegate.fireTestStarted(description)
  }

  override fun fireTestFinished(description: org.junit.runner.Description) {
    delegate.fireTestFinished(description)
  }

  override fun fireTestFailure(failure: Failure) {
    recordFailure(failure.message)
    delegate.fireTestFailure(failure)
  }

  override fun fireTestAssumptionFailed(failure: Failure) {
    delegate.fireTestAssumptionFailed(failure)
  }

  override fun fireTestIgnored(description: org.junit.runner.Description) {
    delegate.fireTestIgnored(description)
  }

  override fun addListener(listener: org.junit.runner.notification.RunListener) {
    delegate.addListener(listener)
  }

  override fun removeListener(listener: org.junit.runner.notification.RunListener) {
    delegate.removeListener(listener)
  }
}
