package dev.jasonpearson.automobile.ctrlproxy.models

import kotlinx.serialization.Serializable

@Serializable
data class RecompositionEntry(
    val id: String,
    val composableName: String? = null,
    val resourceId: String? = null,
    val testTag: String? = null,
    val total: Int = 0,
    val skipCount: Int = 0,
    val rolling1sAverage: Double? = null,
    val durationMs: Double? = null,
    val likelyCause: String? = null,
    val parentChain: List<String>? = null,
    val stableAnnotated: Boolean? = null,
    val rememberedCount: Int? = null,
)

@Serializable
data class RecompositionSnapshot(
    val timestamp: Long,
    val applicationId: String,
    val entries: List<RecompositionEntry>,
)
