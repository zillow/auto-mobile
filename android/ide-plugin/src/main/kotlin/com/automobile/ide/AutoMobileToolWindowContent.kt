package com.automobile.ide

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.automobile.ide.daemon.McpClientFactory
import com.automobile.ide.daemon.McpDiscoverySnapshot
import com.automobile.ide.daemon.McpHttpDiscovery
import com.automobile.ide.daemon.McpServerOption
import com.automobile.ide.daemon.McpConnectionException
import com.automobile.ide.daemon.McpResource
import com.automobile.ide.daemon.McpResourceTemplate
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.jetbrains.jewel.ui.component.ListComboBox
import org.jetbrains.jewel.intui.standalone.theme.IntUiTheme
import org.jetbrains.jewel.ui.component.DefaultButton
import org.jetbrains.jewel.ui.component.OutlinedButton
import org.jetbrains.jewel.ui.component.Text
import com.intellij.openapi.project.Project

@Composable
fun AutoMobileToolWindowContent(project: Project) {
  val scope = rememberCoroutineScope()
  val discovery = remember { McpHttpDiscovery() }
  var discoverySnapshot by remember { mutableStateOf(McpDiscoverySnapshot.empty()) }
  var selectedOptionId by remember { mutableStateOf<String?>(null) }
  var client by remember { mutableStateOf(McpClientFactory.createPreferred(null)) }
  var statusText by remember { mutableStateOf("Not connected") }
  var lastError by remember { mutableStateOf<String?>(null) }
  var resources by remember { mutableStateOf<List<McpResource>>(emptyList()) }
  var templates by remember { mutableStateOf<List<McpResourceTemplate>>(emptyList()) }
  var navGraphSnippet by remember { mutableStateOf<String?>(null) }

  DisposableEffect(client) {
    onDispose {
      client.close()
    }
  }

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
      val match = options.firstOrNull { option ->
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

  val options = discoverySnapshot.options
  val selectedOption = options.firstOrNull { it.id == selectedOptionId }
  val selectedIndex = options.indexOfFirst { it.id == selectedOptionId }.takeIf { it >= 0 } ?: 0
  val optionLabels = if (options.isNotEmpty()) options.map { it.label } else listOf("No worktrees detected")

  androidx.compose.runtime.LaunchedEffect(Unit) {
    refreshDiscovery()
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
        ListComboBox(optionLabels, selectedIndex, { index ->
          selectedOptionId = options.getOrNull(index)?.id
        })
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
        DefaultButton(onClick = {
          scope.launch {
            statusText = "Connecting..."
            lastError = null
            navGraphSnippet = null
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
            } catch (e: McpConnectionException) {
              statusText = "Not connected"
              lastError = e.message
            }
          }
        }) {
          Text("Attach to MCP")
        }
        OutlinedButton(onClick = {
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
        }) {
          Text("Refresh")
        }
      }

      Spacer(modifier = Modifier.height(4.dp))
      Text("Resources: ${resources.size} | Templates: ${templates.size}")
      if (resources.isNotEmpty()) {
        Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
          resources.take(5).forEach { resource ->
            Text("- ${resource.name} (${resource.uri})")
          }
          if (resources.size > 5) {
            Text("- ...")
          }
        }
      }

      Spacer(modifier = Modifier.height(12.dp))
      Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        DefaultButton(onClick = {
          scope.launch {
            lastError = null
            try {
              val result = withContext(Dispatchers.IO) { client.getNavigationGraph() }
              navGraphSnippet = result.toString().take(500)
            } catch (e: McpConnectionException) {
              lastError = e.message
            }
          }
        }) {
          Text("Import Graph")
        }
        OutlinedButton(onClick = {
          scope.launch {
            lastError = "Export not wired yet"
          }
        }) {
          Text("Export Graph")
        }
      }

      Spacer(modifier = Modifier.height(8.dp))
      Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        DefaultButton(onClick = {
          scope.launch {
            lastError = "Feature flags are not wired yet"
          }
        }) {
          Text("Toggle Perf Debug")
        }
        OutlinedButton(onClick = {
          scope.launch {
            lastError = "Feature flags are not wired yet"
          }
        }) {
          Text("Toggle Traces")
        }
      }

      if (navGraphSnippet != null) {
        Spacer(modifier = Modifier.height(8.dp))
        Text("Navigation Graph (preview):")
        Text(navGraphSnippet ?: "")
      }
    }
  }
}
