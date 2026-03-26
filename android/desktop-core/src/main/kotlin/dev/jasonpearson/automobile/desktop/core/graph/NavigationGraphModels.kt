package dev.jasonpearson.automobile.desktop.core.graph

import kotlinx.serialization.Serializable

@Serializable
data class NavigationGraphSummary(
    val appId: String? = null,
    val currentScreen: String? = null,
    val nodes: List<NavigationGraphSummaryNode> = emptyList(),
    val edges: List<NavigationGraphSummaryEdge> = emptyList(),
)

@Serializable
data class NavigationGraphSummaryNode(
    val id: Int,
    val screenName: String,
    val visitCount: Int,
)

@Serializable
data class NavigationGraphSummaryEdge(
    val id: Int,
    val from: String,
    val to: String,
    val toolName: String? = null,
)

data class RecentTransition(
    val from: String,
    val to: String,
    val edgeId: Int? = null,
    val timestampMs: Long = System.currentTimeMillis(),
)
