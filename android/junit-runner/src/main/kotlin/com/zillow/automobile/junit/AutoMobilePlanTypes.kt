package com.zillow.automobile.junit

/** Configuration options for AutoMobile plan execution. */
data class AutoMobilePlanExecutionOptions(
    val timeoutMs: Long = 300000L, // 5 minutes default
    val device: String = "auto",
    val aiAssistance: Boolean = true,
    val maxRetries: Int = 0,
    val debugMode: Boolean = System.getProperty("automobile.debug", "false").toBoolean()
)

/** Result of AutoMobile plan execution. */
data class AutoMobilePlanExecutionResult(
    val success: Boolean,
    val exitCode: Int,
    val output: String = "",
    val errorMessage: String = "",
    val executionTimeMs: Long = 0L,
    val aiRecoveryAttempted: Boolean = false,
    val aiRecoverySuccessful: Boolean = false,
    val parametersUsed: Map<String, Any> = emptyMap()
)
