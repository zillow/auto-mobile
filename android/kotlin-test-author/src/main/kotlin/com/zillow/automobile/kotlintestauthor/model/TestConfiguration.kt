package com.zillow.automobile.kotlintestauthor.model

import kotlinx.serialization.Serializable

/** Represents a single test specification for AutoMobile test generation. */
@Serializable
data class TestSpecification(
    val name: String,
    val plan: String,
    val modulePath: String,
    val maxRetries: Int? = null,
    val aiAssistance: Boolean = false,
    val timeoutMs: Long? = null
)
