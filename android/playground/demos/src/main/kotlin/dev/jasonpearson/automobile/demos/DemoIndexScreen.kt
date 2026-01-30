package dev.jasonpearson.automobile.demos

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.testTag
import androidx.compose.ui.unit.dp
import dev.jasonpearson.automobile.sdk.TrackRecomposition

private data class DemoEntry(
    val id: String,
    val title: String,
    val description: String,
    val buttonLabel: String,
    val onClick: () -> Unit,
)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DemoIndexScreen(
    onNavigateToUxFlow: () -> Unit,
    onNavigateToStartup: () -> Unit,
    onNavigateToPerformanceList: () -> Unit,
    onNavigateToContrast: () -> Unit,
    onNavigateToTapTargets: () -> Unit,
    onNavigateToBugRepro: () -> Unit,
    onNavigateToHandledException: () -> Unit = {},
    onNavigateBack: () -> Unit = {},
) {
  TrackRecomposition(id = "screen.demo.index", composableName = "DemoIndexScreen") {
    val demos =
        listOf(
            DemoEntry(
                id = "demo_ux_flow",
                title = "UX Exploration Flow",
                description = "Multi-screen path for navigation graph exploration.",
                buttonLabel = "Open UX Flow",
                onClick = onNavigateToUxFlow,
            ),
            DemoEntry(
                id = "demo_startup",
                title = "Startup Performance",
                description = "Stable screen used as startup target.",
                buttonLabel = "Open Startup",
                onClick = onNavigateToStartup,
            ),
            DemoEntry(
                id = "demo_perf_list",
                title = "Scroll + Transition Performance",
                description = "Long list with detail navigation for metrics.",
                buttonLabel = "Open List",
                onClick = onNavigateToPerformanceList,
            ),
            DemoEntry(
                id = "demo_a11y_contrast",
                title = "Accessibility: Contrast",
                description = "Intentional low-contrast UI examples.",
                buttonLabel = "Open Contrast",
                onClick = onNavigateToContrast,
            ),
            DemoEntry(
                id = "demo_a11y_tap_targets",
                title = "Accessibility: Tap Targets",
                description = "Small target sizes and tight spacing.",
                buttonLabel = "Open Tap Targets",
                onClick = onNavigateToTapTargets,
            ),
            DemoEntry(
                id = "demo_bug_repro",
                title = "Bug Reproduction",
                description = "Toggleable bug to reproduce reliably.",
                buttonLabel = "Open Bug Demo",
                onClick = onNavigateToBugRepro,
            ),
            DemoEntry(
                id = "demo_handled_exception",
                title = "Handled Exceptions",
                description = "Test handled exception reporting API.",
                buttonLabel = "Open Exception Demo",
                onClick = onNavigateToHandledException,
            ),
        )

    Scaffold(
        topBar = {
          TopAppBar(
              title = { Text(text = "Docs Demo Index") },
              navigationIcon = {
                IconButton(
                    onClick = onNavigateBack,
                    modifier = Modifier.semantics { testTag = "demo_index_back" },
                ) {
                  Icon(
                      imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                      contentDescription = "Back",
                  )
                }
              },
              colors = TopAppBarDefaults.topAppBarColors(),
          )
        }
    ) { paddingValues ->
      Column(
          modifier =
              Modifier.fillMaxSize()
                  .padding(paddingValues)
                  .padding(horizontal = 16.dp, vertical = 12.dp),
          verticalArrangement = Arrangement.spacedBy(12.dp),
      ) {
        Text(
            text = "Use these screens for AutoMobile docs workflows.",
            style = MaterialTheme.typography.bodyMedium,
            modifier = Modifier.semantics { testTag = "demo_index_description" },
        )

        LazyColumn(
            modifier = Modifier.fillMaxSize().semantics { testTag = "demo_index_list" },
            contentPadding = PaddingValues(bottom = 16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
          items(demos, key = { it.id }) { demo ->
            Card(
                modifier = Modifier.fillMaxWidth().semantics { testTag = demo.id },
                elevation = CardDefaults.cardElevation(defaultElevation = 2.dp),
            ) {
              Column(
                  modifier = Modifier.fillMaxWidth().padding(16.dp),
                  verticalArrangement = Arrangement.spacedBy(8.dp),
              ) {
                Text(text = demo.title, style = MaterialTheme.typography.titleMedium)
                Text(text = demo.description, style = MaterialTheme.typography.bodySmall)
                Button(
                    onClick = demo.onClick,
                    modifier =
                        Modifier.align(Alignment.End).semantics { testTag = "${demo.id}_action" },
                ) {
                  Text(demo.buttonLabel)
                }
              }
            }
          }
        }
      }
    }
  }
}
