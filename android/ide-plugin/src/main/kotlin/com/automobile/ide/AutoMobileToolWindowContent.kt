package com.automobile.ide

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.automobile.ide.daemon.DaemonUnavailableException
import com.automobile.ide.daemon.McpDaemonClient
import com.automobile.ide.daemon.McpResource
import com.automobile.ide.daemon.McpResourceTemplate
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.jetbrains.jewel.intui.standalone.theme.IntUiTheme
import org.jetbrains.jewel.ui.component.DefaultButton
import org.jetbrains.jewel.ui.component.OutlinedButton
import org.jetbrains.jewel.ui.component.Text

@Composable
fun AutoMobileToolWindowContent() {
  val scope = rememberCoroutineScope()
  val daemonClient = remember { McpDaemonClient() }
  var statusText by remember { mutableStateOf("Not connected") }
  var lastError by remember { mutableStateOf<String?>(null) }
  var resources by remember { mutableStateOf<List<McpResource>>(emptyList()) }
  var templates by remember { mutableStateOf<List<McpResourceTemplate>>(emptyList()) }
  var navGraphSnippet by remember { mutableStateOf<String?>(null) }

  IntUiTheme {
    Column(
      modifier = Modifier.fillMaxSize().padding(16.dp),
      verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
      Text("AutoMobile")
      Text("Status: $statusText")
      Text("Socket: ${daemonClient.socketPath}")
      if (lastError != null) {
        Text("Error: ${lastError ?: ""}")
      }

      Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        DefaultButton(onClick = {
          scope.launch {
            statusText = "Connecting..."
            lastError = null
            navGraphSnippet = null
            try {
              withContext(Dispatchers.IO) {
                daemonClient.ping()
                resources = daemonClient.listResources()
                templates = daemonClient.listResourceTemplates()
              }
              statusText = "Connected"
            } catch (e: DaemonUnavailableException) {
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
                resources = daemonClient.listResources()
                templates = daemonClient.listResourceTemplates()
              }
            } catch (e: DaemonUnavailableException) {
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
              val result = withContext(Dispatchers.IO) { daemonClient.getNavigationGraph() }
              navGraphSnippet = result.toString().take(500)
            } catch (e: DaemonUnavailableException) {
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
