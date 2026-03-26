package dev.jasonpearson.automobile.junit

/** Context about a failed test plan step, used to build a structured recovery prompt. */
data class FailedStepContext(
    val failedStepIndex: Int,
    val failedTool: String,
    val error: String,
    val succeededSteps: List<SucceededStepSummary>,
    val planContent: String,
    val deviceId: String?,
)

/** Summary of a step that completed successfully before the failure. */
data class SucceededStepSummary(val stepIndex: Int, val tool: String)

/** Outcome of an AI-assisted recovery attempt. */
data class RecoveryOutcome(
    val success: Boolean,
    val recoveryTimeMs: Long,
    val observeResultAfterRecovery: String? = null,
)
