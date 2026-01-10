package dev.jasonpearson.automobile.ide.daemon

import kotlinx.serialization.Serializable

@Serializable
data class ExecutePlanFailedStep(
    val stepIndex: Int,
    val tool: String,
    val error: String,
    val device: String? = null,
)

@Serializable
data class ExecutePlanResult(
    val success: Boolean,
    val executedSteps: Int,
    val totalSteps: Int,
    val failedStep: ExecutePlanFailedStep? = null,
    val error: String? = null,
    val platform: String? = null,
    val deviceMapping: Map<String, String>? = null,
)
