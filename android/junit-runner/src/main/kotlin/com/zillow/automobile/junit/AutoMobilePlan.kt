package com.zillow.automobile.junit

/**
 * Programmatic interface for executing AutoMobile YAML plans from within test methods.
 *
 * This class allows for dynamic parameter substitution and execution of AutoMobile plans, enabling
 * more flexible test scenarios with AB tests, experiments, and environment-specific values.
 *
 * Example usage:
 * ```kotlin
 * @Test
 * fun `test with parameters`() {
 *   AutoMobilePlan("test-plans/onboarding.yaml") {
 *     "experiment" to "GROUP_A"
 *     "environment" to "QA"
 *   }.execute()
 * }
 * ```
 */
class AutoMobilePlan(
    private val planPath: String,
    private val parameters: ParameterBuilder.() -> Unit = {}
) {

  private val parameterMap = mutableMapOf<String, Any>()

  init {
    val builder = ParameterBuilder()
    builder.parameters()
    parameterMap.putAll(builder.build())
  }

  /**
   * Execute the AutoMobile plan with the configured parameters.
   *
   * Automatically checks device availability before execution.
   *
   * @param options Additional execution options
   * @return ExecutionResult containing the outcome of the plan execution
   */
  fun execute(
      options: AutoMobilePlanExecutionOptions = AutoMobilePlanExecutionOptions()
  ): AutoMobilePlanExecutionResult {
    // Validate plan file exists first, throw exception if not found
    val classLoader = Thread.currentThread().contextClassLoader
    val resource = classLoader.getResource(planPath)

    if (resource == null) {
      val file = java.io.File(planPath)
      if (!file.exists()) {
        throw AssertionError("YAML plan not found: $planPath")
      }
    }

    // Ensure device availability is checked
    AutoMobileSharedUtils.deviceChecker.checkDeviceAvailability()

    return AutoMobilePlanExecutor.execute(planPath, parameterMap, options)
  }

  /** Builder class for constructing parameter maps using a DSL-like syntax. */
  class ParameterBuilder {
    private val parameters = mutableMapOf<String, Any>()

    /** Add a parameter using infix notation. Usage: "key" to "value" */
    infix fun String.to(value: Any) {
      parameters[this] = value
    }

    /** Add a parameter using bracket notation. Usage: this["key"] = "value" */
    operator fun set(key: String, value: Any) {
      parameters[key] = value
    }

    internal fun build(): Map<String, Any> = parameters.toMap()
  }
}
