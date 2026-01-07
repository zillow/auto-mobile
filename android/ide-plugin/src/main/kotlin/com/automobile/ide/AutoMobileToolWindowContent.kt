package com.automobile.ide

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.OutlinedTextField
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.automobile.ide.daemon.McpClientFactory
import com.automobile.ide.daemon.McpConnectionException
import com.automobile.ide.daemon.McpDiscoverySnapshot
import com.automobile.ide.daemon.McpHttpDiscovery
import com.automobile.ide.daemon.McpResource
import com.automobile.ide.daemon.McpResourceTemplate
import com.automobile.ide.daemon.McpServerOption
import com.automobile.ide.daemon.PerformanceAuditHistoryEntry
import com.automobile.ide.graph.NavigationGraphLegend
import com.automobile.ide.graph.NavigationGraphSummary
import com.automobile.ide.graph.NavigationGraphView
import com.automobile.ide.graph.RecentTransition
import com.intellij.openapi.project.Project
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.decodeFromJsonElement
import kotlinx.serialization.json.jsonPrimitive
import org.jetbrains.jewel.intui.standalone.theme.IntUiTheme
import org.jetbrains.jewel.ui.component.DefaultButton
import org.jetbrains.jewel.ui.component.ListComboBox
import org.jetbrains.jewel.ui.component.OutlinedButton
import org.jetbrains.jewel.ui.component.Text
import java.time.Instant
import java.time.LocalTime
import java.time.format.DateTimeFormatter

@Composable
fun AutoMobileToolWindowContent(project: Project) {
  val scope = rememberCoroutineScope()
  val discovery = remember { McpHttpDiscovery() }
  var discoverySnapshot by remember { mutableStateOf(McpDiscoverySnapshot.empty()) }
  var selectedOptionId by remember { mutableStateOf<String?>(null) }
  var client by remember { mutableStateOf(McpClientFactory.createPreferred(null)) }
  var statusText by remember { mutableStateOf("Not connected") }
  var isConnected by remember { mutableStateOf(false) }
  var lastError by remember { mutableStateOf<String?>(null) }
  var resources by remember { mutableStateOf<List<McpResource>>(emptyList()) }
  var templates by remember { mutableStateOf<List<McpResourceTemplate>>(emptyList()) }
  var graphSummary by remember { mutableStateOf<NavigationGraphSummary?>(null) }
  var graphError by remember { mutableStateOf<String?>(null) }
  var graphUpdatedAt by remember { mutableStateOf<String?>(null) }
  var lastCurrentScreen by remember { mutableStateOf<String?>(null) }
  val recentTransitions = remember { mutableStateListOf<RecentTransition>() }
  val graphJson = remember { Json { ignoreUnknownKeys = true } }

  data class PerformanceRangeOption(
      val label: String,
      val windowSeconds: Long?,
      val isCustom: Boolean = false,
  )

  val performanceRanges =
      listOf(
          PerformanceRangeOption("Last 60 seconds", 60),
          PerformanceRangeOption("5 minutes ago", 5 * 60),
          PerformanceRangeOption("15 minutes ago", 15 * 60),
          PerformanceRangeOption("1 hour ago", 60 * 60),
          PerformanceRangeOption("Custom range", null, true),
      )
  val performanceRangeLabels = performanceRanges.map { it.label }
  var selectedPerformanceRangeIndex by remember { mutableStateOf(0) }
  var customRangeStart by remember { mutableStateOf("") }
  var customRangeEnd by remember { mutableStateOf("") }
  var performanceResults by remember { mutableStateOf<List<PerformanceAuditHistoryEntry>>(emptyList()) }
  var performanceToolCalls by remember { mutableStateOf<List<String>>(emptyList()) }
  var performanceHasMore by remember { mutableStateOf(false) }
  var performanceNextOffset by remember { mutableStateOf<Int?>(null) }
  var performanceStatus by remember { mutableStateOf("Idle") }
  var performanceError by remember { mutableStateOf<String?>(null) }
  var autoPollEnabled by remember { mutableStateOf(true) }
  val performancePageSize = 25
  val pollIntervalMs = 5000L

  DisposableEffect(client) { onDispose { client.close() } }

  fun resolveSelectionId(options: List<McpServerOption>): String? {
    if (options.isEmpty()) {
      return null
    }

    val currentId = selectedOptionId
    if (currentId != null && options.any { it.id == currentId }) {
      return currentId
    }

    val projectPath = project.basePath?.lowercase()
    if (projectPath != null) {
      val match =
          options.firstOrNull { option ->
            val worktreePath = option.worktree?.path?.lowercase()
            worktreePath != null && projectPath.startsWith(worktreePath)
          }
      if (match != null) {
        return match.id
      }
    }

    val withServer = options.firstOrNull { it.server != null }
    return (withServer ?: options.first()).id
  }

  fun parsePerformanceTimestamp(value: String): String? {
    val trimmed = value.trim()
    if (trimmed.isEmpty()) {
      return null
    }
    return try {
      Instant.parse(trimmed).toString()
    } catch (_: Exception) {
      null
    }
  }

  fun resolvePerformanceRange(): Pair<String?, String?>? {
    val option = performanceRanges.getOrNull(selectedPerformanceRangeIndex) ?: performanceRanges.first()
    if (!option.isCustom) {
      val end = Instant.now()
      val start = end.minusSeconds(option.windowSeconds ?: 0)
      return start.toString() to end.toString()
    }

    val start = parsePerformanceTimestamp(customRangeStart)
    val end = parsePerformanceTimestamp(customRangeEnd)
    if (customRangeStart.isNotBlank() && start == null) {
      performanceError = "Invalid custom start timestamp (use ISO-8601)."
      return null
    }
    if (customRangeEnd.isNotBlank() && end == null) {
      performanceError = "Invalid custom end timestamp (use ISO-8601)."
      return null
    }
    return start to end
  }

  fun mergePerformanceResults(
      current: List<PerformanceAuditHistoryEntry>,
      incoming: List<PerformanceAuditHistoryEntry>,
  ): List<PerformanceAuditHistoryEntry> {
    if (current.isEmpty()) {
      return incoming
    }
    if (incoming.isEmpty()) {
      return current
    }

    val merged = LinkedHashMap<Long, PerformanceAuditHistoryEntry>()
    current.forEach { entry -> merged[entry.id] = entry }
    incoming.forEach { entry -> merged[entry.id] = entry }
    return merged.values.sortedWith(
        compareByDescending<PerformanceAuditHistoryEntry> { it.timestamp }
            .thenByDescending { it.id }
    )
  }

  suspend fun refreshDiscovery(): McpDiscoverySnapshot {
    lastError = null
    val snapshot = withContext(Dispatchers.IO) { discovery.discover(project.basePath) }
    discoverySnapshot = snapshot
    selectedOptionId = resolveSelectionId(snapshot.options)
    return snapshot
  }

  suspend fun fetchNavigationGraph() {
    val contents = withContext(Dispatchers.IO) { client.readResource(NAV_GRAPH_RESOURCE_URI) }
    val payload = contents.firstOrNull()?.text?.trim().orEmpty()
    if (payload.isBlank()) {
      graphError = "Navigation graph resource returned no data."
      return
    }

    val jsonElement = graphJson.parseToJsonElement(payload)
    if (jsonElement is JsonObject) {
      val errorMessage = jsonElement["error"]?.jsonPrimitive?.contentOrNull
      if (!errorMessage.isNullOrBlank()) {
        graphError = errorMessage
        return
      }
    }

    val summary =
        graphJson.decodeFromJsonElement(NavigationGraphSummary.serializer(), jsonElement)
    graphSummary = summary
    graphError = null
    graphUpdatedAt = LocalTime.now().format(GRAPH_TIME_FORMATTER)

    val updatedTransitions =
        updateTransitionHistory(
            lastCurrentScreen,
            summary,
            recentTransitions.toList(),
        )
    if (updatedTransitions.isNotEmpty()) {
      recentTransitions.clear()
      recentTransitions.addAll(updatedTransitions)
    } else if (recentTransitions.isNotEmpty()) {
      recentTransitions.clear()
    }
    lastCurrentScreen = summary.currentScreen
  }

  fun refreshNavigationGraphNow() {
    if (!isConnected) {
      return
    }
    scope.launch {
      try {
        fetchNavigationGraph()
      } catch (e: Exception) {
        graphError = e.message
      }
    }
  }

  val performanceRangeKey = "${selectedPerformanceRangeIndex}:${customRangeStart}:${customRangeEnd}"

  suspend fun refreshPerformanceResults(offset: Int? = null, append: Boolean = false) {
    performanceError = null
    val range = resolvePerformanceRange() ?: return
    val (startTime, endTime) = range

    performanceStatus = if (append) "Loading more..." else "Refreshing..."
    try {
      val response =
          withContext(Dispatchers.IO) {
            client.listPerformanceAuditResults(
                startTime = startTime,
                endTime = endTime,
                limit = performancePageSize,
                offset = offset,
            )
          }
      val merged = mergePerformanceResults(performanceResults, response.results)
      performanceResults =
          merged.filter { entry ->
            (startTime == null || entry.timestamp >= startTime) &&
                (endTime == null || entry.timestamp <= endTime)
          }
      performanceToolCalls =
          if (append) (performanceToolCalls + response.toolCalls).distinct()
          else response.toolCalls
      performanceHasMore = response.hasMore
      performanceNextOffset = response.nextOffset
      performanceStatus = "Updated ${response.results.size} result(s)"
    } catch (e: McpConnectionException) {
      performanceStatus = "Performance data unavailable"
      performanceError = e.message
    } catch (e: Exception) {
      performanceStatus = "Performance data unavailable"
      performanceError = e.message
    }
  }

  LaunchedEffect(performanceRangeKey) {
    performanceResults = emptyList()
    performanceToolCalls = emptyList()
    performanceHasMore = false
    performanceNextOffset = null
    performanceStatus = "Idle"
    performanceError = null
  }

  LaunchedEffect(autoPollEnabled, performanceRangeKey, client, isConnected) {
    if (!autoPollEnabled || !isConnected) {
      return@LaunchedEffect
    }
    while (true) {
      refreshPerformanceResults()
      delay(pollIntervalMs)
    }
  }

  val options = discoverySnapshot.options
  val selectedOption = options.firstOrNull { it.id == selectedOptionId }
  val selectedIndex = options.indexOfFirst { it.id == selectedOptionId }.takeIf { it >= 0 } ?: 0
  val optionLabels =
      if (options.isNotEmpty()) options.map { it.label } else listOf("No worktrees detected")

  LaunchedEffect(Unit) { refreshDiscovery() }
  LaunchedEffect(client, isConnected) {
    if (!isConnected) {
      return@LaunchedEffect
    }

    while (isActive) {
      try {
        fetchNavigationGraph()
      } catch (e: McpConnectionException) {
        graphError = e.message
      } catch (e: Exception) {
        graphError = e.message
      }
      delay(GRAPH_POLL_INTERVAL_MS)
    }
  }

  IntUiTheme {
    Column(
        modifier = Modifier.fillMaxSize().padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
      Text("AutoMobile")
      Text("Status: $statusText")
      Text("Transport: ${client.transportName}")
      Text("Endpoint: ${client.connectionDescription}")
      if (lastError != null) {
        Text("Error: ${lastError ?: ""}")
      }

      Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Text("Worktrees / MCP servers")
        ListComboBox(
            optionLabels,
            selectedIndex,
            { index ->
              selectedOptionId = options.getOrNull(index)?.id
              statusText = "Not connected"
              isConnected = false
              graphSummary = null
              graphError = null
              graphUpdatedAt = null
              lastCurrentScreen = null
              recentTransitions.clear()
            },
        )
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
          OutlinedButton(onClick = { scope.launch { refreshDiscovery() } }) {
            Text("Rescan servers")
          }
          if (selectedOption != null && selectedOption.server == null) {
            Text("Selected worktree has no running MCP server")
          }
        }
      }

      Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        DefaultButton(
            onClick = {
              scope.launch {
                statusText = "Connecting..."
                lastError = null
                graphSummary = null
                graphError = null
                graphUpdatedAt = null
                lastCurrentScreen = null
                recentTransitions.clear()
                try {
                  val snapshot = refreshDiscovery()
                  val resolvedId = resolveSelectionId(snapshot.options)
                  val resolvedOption = snapshot.options.firstOrNull { it.id == resolvedId }
                  val nextClient = McpClientFactory.createPreferred(resolvedOption?.server)
                  client.close()
                  client = nextClient
                  withContext(Dispatchers.IO) {
                    nextClient.ping()
                    resources = nextClient.listResources()
                    templates = nextClient.listResourceTemplates()
                  }
                  statusText = "Connected"
                  isConnected = true
                } catch (e: McpConnectionException) {
                  statusText = "Not connected"
                  isConnected = false
                  lastError = e.message
                }
                if (isConnected) {
                  try {
                    fetchNavigationGraph()
                  } catch (e: Exception) {
                    graphError = e.message
                  }
                }
              }
            }
        ) {
          Text("Attach to MCP")
        }
        OutlinedButton(
            onClick = {
              scope.launch {
                lastError = null
                try {
                  withContext(Dispatchers.IO) {
                    resources = client.listResources()
                    templates = client.listResourceTemplates()
                  }
                } catch (e: McpConnectionException) {
                  lastError = e.message
                }
              }
            }
        ) {
          Text("Refresh")
        }
      }

      Spacer(modifier = Modifier.height(4.dp))
      Text("Resources: ${resources.size} | Templates: ${templates.size}")
      if (resources.isNotEmpty()) {
        Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
          resources.take(5).forEach { resource -> Text("- ${resource.name} (${resource.uri})") }
          if (resources.size > 5) {
            Text("- ...")
          }
        }
      }

      Spacer(modifier = Modifier.height(12.dp))
      Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text("Performance")
        Text("Status: $performanceStatus")
        if (performanceError != null) {
          Text("Error: ${performanceError ?: ""}")
        }

        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
          ListComboBox(
              performanceRangeLabels,
              selectedPerformanceRangeIndex,
              { index -> selectedPerformanceRangeIndex = index },
          )
          OutlinedButton(onClick = { autoPollEnabled = !autoPollEnabled }) {
            Text(if (autoPollEnabled) "Pause polling" else "Resume polling")
          }
          DefaultButton(onClick = { scope.launch { refreshPerformanceResults() } }) {
            Text("Refresh")
          }
        }

        if (performanceRanges.getOrNull(selectedPerformanceRangeIndex)?.isCustom == true) {
          Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            OutlinedTextField(
                value = customRangeStart,
                onValueChange = { customRangeStart = it },
                label = { Text("Start (ISO-8601)") },
                modifier = Modifier.width(220.dp),
                singleLine = true,
            )
            OutlinedTextField(
                value = customRangeEnd,
                onValueChange = { customRangeEnd = it },
                label = { Text("End (ISO-8601)") },
                modifier = Modifier.width(220.dp),
                singleLine = true,
            )
          }
        }

        if (performanceToolCalls.isNotEmpty()) {
          Text("Tool calls: ${performanceToolCalls.joinToString(", ")}")
        }

        if (performanceResults.isNotEmpty()) {
          LazyColumn(modifier = Modifier.fillMaxWidth().height(200.dp)) {
            items(performanceResults) { entry ->
              val metrics = entry.metrics
              val status = if (entry.passed) "PASS" else "FAIL"
              val p95 = metrics.p95Ms?.let { "${"%.1f".format(it)}ms" } ?: "-"
              val jank = metrics.jankCount?.toString() ?: "-"
              val cpu = metrics.cpuUsagePercent?.let { "${"%.1f".format(it)}%" } ?: "-"
              val touch = metrics.touchLatencyMs?.let { "${"%.1f".format(it)}ms" } ?: "-"
              Text(
                  "${entry.timestamp} | ${entry.packageName} | $status | p95=$p95 | jank=$jank | cpu=$cpu | touch=$touch"
              )
            }
          }
        } else {
          Text("No performance results in range.")
        }

        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
          OutlinedButton(
              onClick = {
                val offset = performanceNextOffset ?: return@OutlinedButton
                scope.launch { refreshPerformanceResults(offset = offset, append = true) }
              },
              enabled = performanceHasMore && performanceNextOffset != null,
          ) {
            Text("Load more")
          }
        }
      }

      Spacer(modifier = Modifier.height(8.dp))
      TestTimingPanel(
          project = project,
          client = client,
          isConnected = isConnected,
          onShowNavigationGraph = { refreshNavigationGraphNow() },
      )

      Spacer(modifier = Modifier.height(8.dp))
      Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        DefaultButton(
            onClick = { scope.launch { lastError = "Feature flags are not wired yet" } }
        ) {
          Text("Toggle Perf Debug")
        }
        OutlinedButton(
            onClick = { scope.launch { lastError = "Feature flags are not wired yet" } }
        ) {
          Text("Toggle Traces")
        }
      }

      Spacer(modifier = Modifier.height(12.dp))
      Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Row(
            horizontalArrangement = Arrangement.spacedBy(12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
          Text("Navigation Graph")
          if (graphUpdatedAt != null) {
            Text("Updated $graphUpdatedAt")
          }
          Text("Auto-refresh 1s")
        }
        Text(
            "Nodes: ${graphSummary?.nodes?.size ?: 0} | " +
                "Edges: ${graphSummary?.edges?.size ?: 0} | " +
                "Current: ${graphSummary?.currentScreen ?: "-"}"
        )
        NavigationGraphLegend(modifier = Modifier.fillMaxWidth())
      }
      NavigationGraphView(
          summary = graphSummary,
          recentTransitions = recentTransitions.toList(),
          errorMessage = graphError,
          modifier = Modifier.fillMaxWidth().weight(1f),
      )
    }
  }
}

private const val NAV_GRAPH_RESOURCE_URI = "automobile:navigation/graph"
private const val GRAPH_POLL_INTERVAL_MS = 1000L
private const val MAX_RECENT_TRANSITIONS = 10
private val GRAPH_TIME_FORMATTER: DateTimeFormatter = DateTimeFormatter.ofPattern("HH:mm:ss")

private fun updateTransitionHistory(
    previousScreen: String?,
    summary: NavigationGraphSummary,
    existing: List<RecentTransition>,
): List<RecentTransition> {
  val currentScreen = summary.currentScreen
  if (previousScreen.isNullOrBlank() || currentScreen.isNullOrBlank()) {
    return existing
  }
  if (previousScreen == currentScreen) {
    return existing
  }

  val matchingEdge =
      summary.edges.firstOrNull { it.from == previousScreen && it.to == currentScreen }
  val updated =
      existing +
          RecentTransition(
              from = previousScreen,
              to = currentScreen,
              edgeId = matchingEdge?.id,
          )
  return updated.takeLast(MAX_RECENT_TRANSITIONS)
}
