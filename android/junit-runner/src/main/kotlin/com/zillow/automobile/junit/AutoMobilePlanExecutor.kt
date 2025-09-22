package com.zillow.automobile.junit

import java.io.File

/**
 * Internal executor class that handles the actual execution of AutoMobile plans with parameter
 * substitution and CLI integration.
 */
internal object AutoMobilePlanExecutor {

  /** Execute an AutoMobile plan with parameter substitution. */
  fun execute(
      planPath: String,
      parameters: Map<String, Any>,
      options: AutoMobilePlanExecutionOptions
  ): AutoMobilePlanExecutionResult {

    val startTime = System.currentTimeMillis()

    try {
      // Resolve and validate the plan file path first, before any other checks
      val resolvedPlanPath = resolvePlanPath(planPath)

      // Check device availability after plan file validation
      if (!AutoMobileSharedUtils.deviceChecker.areDevicesAvailable()) {
        val executionTime = System.currentTimeMillis() - startTime
        return AutoMobilePlanExecutionResult(
            success = false,
            exitCode = -1,
            errorMessage = "No Android devices available for plan execution",
            executionTimeMs = executionTime,
            parametersUsed = parameters)
      }

      // Load and process the plan with parameter substitution
      val processedPlanContent = loadAndProcessPlan(resolvedPlanPath, parameters)

      if (options.debugMode) {
        println("Executing AutoMobile plan: $planPath")
        println("Parameters: $parameters")
        println("Processed plan content:\n$processedPlanContent")
      }

      // Execute the processed plan
      val result = executeProcessedPlan(processedPlanContent, options)

      val executionTime = System.currentTimeMillis() - startTime

      return AutoMobilePlanExecutionResult(
          success = result.success,
          exitCode = result.exitCode,
          output = result.output,
          errorMessage = result.errorMessage,
          executionTimeMs = executionTime,
          aiRecoveryAttempted = result.aiRecoveryAttempted,
          aiRecoverySuccessful = result.aiRecoverySuccessful,
          parametersUsed = parameters)
    } catch (e: Exception) {
      val executionTime = System.currentTimeMillis() - startTime
      return AutoMobilePlanExecutionResult(
          success = false,
          exitCode = -1,
          errorMessage = "Plan execution failed: ${e.message}",
          executionTimeMs = executionTime,
          parametersUsed = parameters)
    }
  }

  private fun resolvePlanPath(planPath: String): String {
    // Try to find the plan in test resources first
    val classLoader = Thread.currentThread().contextClassLoader
    val resource = classLoader.getResource(planPath)

    if (resource != null) {
      return File(resource.toURI()).path
    }

    // If not found in resources, try as absolute path
    val file = File(planPath)
    if (file.exists()) {
      return file.absolutePath
    }

    throw IllegalArgumentException("YAML plan not found: $planPath")
  }

  private fun loadAndProcessPlan(planPath: String, parameters: Map<String, Any>): String {
    val planContent = File(planPath).readText()

    if (parameters.isEmpty()) {
      return planContent
    }

    // Perform parameter substitution using template syntax ${parameter_name}
    var processedContent = planContent

    parameters.forEach { (key, value) ->
      val placeholder = "\${$key}"
      val stringValue =
          when (value) {
            is String -> value
            is Enum<*> -> value.name
            else -> value.toString()
          }
      processedContent = processedContent.replace(placeholder, stringValue)
    }

    return processedContent
  }

  private fun executeProcessedPlan(
      planContent: String,
      options: AutoMobilePlanExecutionOptions
  ): InternalExecutionResult {

    val command = buildExecutePlanCommand(planContent, options)

    if (options.debugMode) {
      println("Executing command: ${command.joinToString(" ")}")
    }

    val result = AutoMobileSharedUtils.executeCommand(command, options.timeoutMs)

    if (options.debugMode) {
      println("Command output:\n${result.output}")
      if (result.errorOutput.isNotEmpty()) {
        println("Command errors:\n${result.errorOutput}")
      }
      println("Exit code: ${result.exitCode}")
    }

    return if (result.exitCode == 0) {
      InternalExecutionResult(success = true, exitCode = result.exitCode, output = result.output)
    } else {
      handleFailure(result, options)
    }
  }

  private fun buildExecutePlanCommand(
      planContent: String,
      options: AutoMobilePlanExecutionOptions
  ): List<String> {
    val command = mutableListOf("npx", "auto-mobile", "--cli")

    command.add("executePlan")
    command.addAll(listOf("--planContent", planContent))
    command.addAll(listOf("--platform", "android"))

    if (options.device != "auto") {
      command.addAll(listOf("--device", options.device))
    }

    return command
  }

  private fun handleFailure(
      result: CommandResult,
      options: AutoMobilePlanExecutionOptions
  ): InternalExecutionResult {

    val ciMode = System.getProperty("automobile.ci.mode", "false").toBoolean()
    if (!options.aiAssistance || ciMode) {
      return InternalExecutionResult(
          success = false,
          exitCode = result.exitCode,
          output = result.output,
          errorMessage =
              "AutoMobile CLI failed with exit code ${result.exitCode}" +
                  if (result.errorOutput.isNotEmpty()) "\nErrors: ${result.errorOutput}" else "")
    }

    // TODO: Implement AI recovery similar to AutoMobileRunner
    println("AI recovery not yet implemented for programmatic execution")

    return InternalExecutionResult(
        success = false,
        exitCode = result.exitCode,
        output = result.output,
        errorMessage =
            "AutoMobile CLI failed with exit code ${result.exitCode}" +
                if (result.errorOutput.isNotEmpty()) "\nErrors: ${result.errorOutput}" else "",
        aiRecoveryAttempted = false,
        aiRecoverySuccessful = false)
  }

  private data class InternalExecutionResult(
      val success: Boolean,
      val exitCode: Int,
      val output: String = "",
      val errorMessage: String = "",
      val aiRecoveryAttempted: Boolean = false,
      val aiRecoverySuccessful: Boolean = false
  )
}
