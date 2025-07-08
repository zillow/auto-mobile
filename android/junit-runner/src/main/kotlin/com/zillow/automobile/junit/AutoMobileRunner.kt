package com.zillow.automobile.junit

import java.io.File
import kotlin.jvm.java
import org.junit.runner.notification.Failure
import org.junit.runner.notification.RunNotifier
import org.junit.runners.BlockJUnit4ClassRunner
import org.junit.runners.model.FrameworkMethod

/**
 * Custom JUnit runner for executing AutoMobile YAML test plans.
 *
 * This runner detects @AutoMobileTest annotations, executes the specified YAML plans using the
 * AutoMobile CLI (via npx), and provides AI-assisted failure recovery. When no plan is provided but
 * a prompt is specified with AI assistance enabled, it generates a YAML plan from the prompt using
 * the AI agent via AutoMobile MCP server.
 */
class AutoMobileRunner(private val klass: Class<*>) : BlockJUnit4ClassRunner(klass) {

  private val agent = AutoMobileAgent()

  init {
    AutoMobileSharedUtils.deviceChecker.checkDeviceAvailability()
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
    super.run(notifier)
  }

  override fun runChild(method: FrameworkMethod, notifier: RunNotifier) {
    val autoMobileTest = method.getAnnotation(AutoMobileTest::class.java)

    if (autoMobileTest != null) {
      runAutoMobileTest(method, autoMobileTest, notifier)
    } else {
      super.runChild(method, notifier)
    }
  }

  private fun runAutoMobileTest(
      method: FrameworkMethod,
      annotation: AutoMobileTest,
      notifier: RunNotifier
  ) {
    val description = describeChild(method)
    notifier.fireTestStarted(description)

    try {
      val planPath = getPlanPathOrGenerate(method, annotation)
      val resolvedPlanPath = resolvePlanPath(planPath)

      println("Running AutoMobile test: ${method.name} with plan: $planPath")

      val result = executeAutoMobilePlan(resolvedPlanPath, annotation)

      if (!result.success) {
        val failure =
            Failure(
                description,
                AutoMobileTestException("AutoMobile test failed: ${result.errorMessage}"))
        notifier.fireTestFailure(failure)
      }
    } catch (e: Exception) {
      println("Error running AutoMobile test ${method.name}: ${e.message}")
      val failure = Failure(description, e)
      notifier.fireTestFailure(failure)
    } finally {
      notifier.fireTestFinished(description)
    }
  }

  private fun getPlanPathOrGenerate(method: FrameworkMethod, annotation: AutoMobileTest): String {
    return when {
      annotation.plan.isNotEmpty() -> annotation.plan
      annotation.prompt.isNotEmpty() && annotation.aiAssistance -> {
        generatePlanFromPrompt(method, annotation)
      }
      else ->
          throw IllegalArgumentException(
              "Either 'plan' or 'prompt' (with aiAssistance=true) must be specified in @AutoMobileTest")
    }
  }

  private fun generatePlanFromPrompt(method: FrameworkMethod, annotation: AutoMobileTest): String {
    val className = klass.simpleName
    val methodName = method.name

    // Get test resources directory
    val testResourcesDir =
        File(
            klass.classLoader.getResource(".")?.toURI()
                ?: throw RuntimeException("Cannot find test resources directory"))

    return agent.generatePlanFromPrompt(annotation.prompt, className, methodName, testResourcesDir)
  }

  private fun resolvePlanPath(planPath: String): String {
    val classLoader = klass.classLoader
    val resource =
        classLoader.getResource(planPath)
            ?: throw IllegalArgumentException("YAML plan not found in test resources: $planPath")

    return File(resource.toURI()).path
  }

  private fun executeAutoMobilePlan(planPath: String, annotation: AutoMobileTest): ExecutionResult {
    val startTime = System.currentTimeMillis()

    try {
      // Read the YAML plan content
      val planContent = File(planPath).readText()

      val command = buildAutoMobileExecutePlanCommand(planContent, annotation)

      println("Executing command: ${command.joinToString(" ")}")

      val result = AutoMobileSharedUtils.executeCommand(command, annotation.timeoutMs)

      val debugMode = System.getProperty("automobile.debug", "false").toBoolean()
      if (debugMode) {
        println("AutoMobile CLI output:\n${result.output}")
        if (result.errorOutput.isNotEmpty()) {
          println("AutoMobile CLI errors:\n${result.errorOutput}")
        }
        println(
            "Exit code: ${result.exitCode}, Execution time: ${System.currentTimeMillis() - startTime}ms")
      }

      return if (result.exitCode == 0) {
        ExecutionResult(
            success = true,
            exitCode = result.exitCode,
            output = result.output,
            executionTimeMs = System.currentTimeMillis() - startTime)
      } else {
        handleFailure(
            annotation,
            result.exitCode,
            result.output,
            result.errorOutput,
            System.currentTimeMillis() - startTime)
      }
    } catch (e: Exception) {
      val executionTime = System.currentTimeMillis() - startTime
      println("Error executing AutoMobile plan: ${e.message}")
      return ExecutionResult(
          success = false,
          exitCode = -1,
          errorMessage = e.message ?: "Unknown error",
          executionTimeMs = executionTime)
    }
  }

  private fun buildAutoMobileExecutePlanCommand(
      planContent: String,
      annotation: AutoMobileTest
  ): List<String> {
    val command = mutableListOf("npx", "auto-mobile@latest", "--cli")

    // Read system properties dynamically to allow test configuration
    val debugMode = System.getProperty("automobile.debug", "false").toBoolean()

    command.add("executePlan")
    command.addAll(listOf("--planContent", planContent))

    if (annotation.device != "auto") {
      command.addAll(listOf("--device", annotation.device))
    }

    if (debugMode) {
      command.add("--debug")
    }

    return command
  }

  private fun handleFailure(
      annotation: AutoMobileTest,
      exitCode: Int,
      output: String,
      errorOutput: String,
      baseExecutionTime: Long
  ): ExecutionResult {

    val ciMode = System.getProperty("automobile.ci.mode", "false").toBoolean()
    if (!annotation.aiAssistance || ciMode) {
      println("AI assistance disabled or in CI mode, marking test as failed")
      return ExecutionResult(
          success = false,
          exitCode = exitCode,
          output = output,
          errorMessage =
              "AutoMobile CLI failed with exit code $exitCode" +
                  if (errorOutput.isNotEmpty()) "\nErrors: $errorOutput" else "",
          executionTimeMs = baseExecutionTime)
    }

    println("Attempting AI-assisted recovery for failed test")

    val recoveryResult = agent.attemptAiRecovery(output, errorOutput)

    return if (recoveryResult.success) {
      println("AI recovery successful")
      ExecutionResult(
          success = true,
          exitCode = 0,
          output = "$output\n[AI Recovery Applied]",
          aiRecoveryAttempted = true,
          aiRecoverySuccessful = true,
          executionTimeMs = baseExecutionTime + recoveryResult.recoveryTimeMs)
    } else {
      println("AI recovery failed")
      ExecutionResult(
          success = false,
          exitCode = exitCode,
          output = output,
          errorMessage =
              "AutoMobile CLI failed and AI recovery unsuccessful" +
                  if (errorOutput.isNotEmpty()) "\nErrors: $errorOutput" else "",
          aiRecoveryAttempted = true,
          aiRecoverySuccessful = false,
          executionTimeMs = baseExecutionTime + recoveryResult.recoveryTimeMs)
    }
  }

  /** Extract plan path from annotation - used by tests via reflection */
  private fun getPlanPath(annotation: AutoMobileTest): String {
    return if (annotation.plan.isNotEmpty()) {
      annotation.plan
    } else {
      throw IllegalArgumentException("Plan path not specified in annotation")
    }
  }

  /** Build AutoMobile command - used by tests via reflection */
  private fun buildAutoMobileCommand(planPath: String, annotation: AutoMobileTest): List<String> {
    val command = mutableListOf<String>()
    val useNpx = System.getProperty("automobile.use.npx", "true").toBoolean()

    if (useNpx) {
      command.addAll(listOf("npx", "auto-mobile@latest", "--cli"))
    } else {
      command.addAll(listOf("auto-mobile", "--cli"))
    }

    command.addAll(listOf("test", "run", planPath))

    if (annotation.device != "auto") {
      command.addAll(listOf("--device", annotation.device))
    }

    val debugMode = System.getProperty("automobile.debug", "false").toBoolean()
    if (debugMode) {
      command.add("--debug")
    }

    return command
  }

  private data class ExecutionResult(
      val success: Boolean,
      val exitCode: Int,
      val output: String = "",
      val errorMessage: String = "",
      val executionTimeMs: Long = 0L,
      val aiRecoveryAttempted: Boolean = false,
      val aiRecoverySuccessful: Boolean = false
  )

  class AutoMobileTestException(message: String) : Exception(message)
}
