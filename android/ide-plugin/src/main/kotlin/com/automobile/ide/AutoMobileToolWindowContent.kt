package com.automobile.ide

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.weight
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.automobile.ide.graph.NavigationGraphLegend
import com.automobile.ide.graph.NavigationGraphSummary
import com.automobile.ide.graph.NavigationGraphView
import com.automobile.ide.graph.RecentTransition
import com.automobile.ide.daemon.McpClientFactory
import com.automobile.ide.daemon.McpConnectionException
import com.automobile.ide.daemon.McpDiscoverySnapshot
import com.automobile.ide.daemon.McpHttpDiscovery
import com.automobile.ide.daemon.McpResource
import com.automobile.ide.daemon.McpResourceTemplate
import com.automobile.ide.daemon.McpServerOption
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
import kotlinx.serialization.json.parseToJsonElement
import org.jetbrains.jewel.intui.standalone.theme.IntUiTheme
import org.jetbrains.jewel.ui.component.DefaultButton
import org.jetbrains.jewel.ui.component.ListComboBox
import org.jetbrains.jewel.ui.component.OutlinedButton
import org.jetbrains.jewel.ui.component.Text
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

  val options = discoverySnapshot.options
  val selectedOption = options.firstOrNull { it.id == selectedOptionId }
  val selectedIndex = options.indexOfFirst { it.id == selectedOptionId }.takeIf { it >= 0 } ?: 0
  val optionLabels =
      if (options.isNotEmpty()) options.map { it.label } else listOf("No worktrees detected")

  androidx.compose.runtime.LaunchedEffect(Unit) { refreshDiscovery() }
  androidx.compose.runtime.LaunchedEffect(client, isConnected) {
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

private const val NAV_GRAPH_RESOURCE_URI = "automobile://navigation/graph"
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
