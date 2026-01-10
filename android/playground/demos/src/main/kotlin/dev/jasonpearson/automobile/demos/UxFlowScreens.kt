package dev.jasonpearson.automobile.demos

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.testTag
import androidx.compose.ui.unit.dp
import dev.jasonpearson.automobile.sdk.TrackRecomposition

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun UxFlowStartScreen(
    onNavigateNext: () -> Unit,
    onNavigateBack: () -> Unit,
) {
  TrackRecomposition(id = "screen.demo.ux.start", composableName = "UxFlowStartScreen") {
    Scaffold(
        topBar = {
          TopAppBar(
              title = { Text(text = "UX Flow: Start") },
              navigationIcon = {
                IconButton(
                    onClick = onNavigateBack,
                    modifier = Modifier.semantics { testTag = "ux_flow_start_back" },
                ) {
                  Icon(
                      imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                      contentDescription = "Back",
                  )
                }
              },
          )
        }
    ) { paddingValues ->
      Column(
          modifier =
              Modifier.fillMaxSize()
                  .padding(paddingValues)
                  .padding(16.dp)
                  .semantics { testTag = "ux_flow_start_content" },
          verticalArrangement = Arrangement.spacedBy(16.dp),
      ) {
        Text(
            text = "Step 1: Start the exploration flow.",
            style = MaterialTheme.typography.bodyLarge,
        )
        Text(
            text = "Use the buttons below to navigate through the demo screens.",
            style = MaterialTheme.typography.bodyMedium,
        )
        Button(
            onClick = onNavigateNext,
            modifier = Modifier.semantics { testTag = "ux_flow_start_next" },
        ) {
          Text("Continue to Details")
        }
      }
    }
  }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun UxFlowDetailsScreen(
    onNavigateNext: () -> Unit,
    onNavigateBack: () -> Unit,
) {
  TrackRecomposition(id = "screen.demo.ux.details", composableName = "UxFlowDetailsScreen") {
    Scaffold(
        topBar = {
          TopAppBar(
              title = { Text(text = "UX Flow: Details") },
              navigationIcon = {
                IconButton(
                    onClick = onNavigateBack,
                    modifier = Modifier.semantics { testTag = "ux_flow_details_back" },
                ) {
                  Icon(
                      imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                      contentDescription = "Back",
                  )
                }
              },
          )
        }
    ) { paddingValues ->
      Column(
          modifier =
              Modifier.fillMaxSize()
                  .padding(paddingValues)
                  .padding(16.dp)
                  .semantics { testTag = "ux_flow_details_content" },
          verticalArrangement = Arrangement.spacedBy(16.dp),
      ) {
        Text(
            text = "Step 2: Review a detail screen.",
            style = MaterialTheme.typography.bodyLarge,
        )
        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
          Text(text = "- Primary action button")
          Text(text = "- Secondary navigation option")
          Text(text = "- Stable labels for automation")
        }
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
          OutlinedButton(
              onClick = onNavigateBack,
              modifier = Modifier.semantics { testTag = "ux_flow_details_back_to_start" },
          ) {
            Text("Back to Start")
          }
          Button(
              onClick = onNavigateNext,
              modifier = Modifier.semantics { testTag = "ux_flow_details_next" },
          ) {
            Text("Continue to Summary")
          }
        }
      }
    }
  }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun UxFlowSummaryScreen(
    onRestartFlow: () -> Unit,
    onNavigateBack: () -> Unit,
) {
  TrackRecomposition(id = "screen.demo.ux.summary", composableName = "UxFlowSummaryScreen") {
    Scaffold(
        topBar = {
          TopAppBar(
              title = { Text(text = "UX Flow: Summary") },
              navigationIcon = {
                IconButton(
                    onClick = onNavigateBack,
                    modifier = Modifier.semantics { testTag = "ux_flow_summary_back" },
                ) {
                  Icon(
                      imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                      contentDescription = "Back",
                  )
                }
              },
          )
        }
    ) { paddingValues ->
      Column(
          modifier =
              Modifier.fillMaxSize()
                  .padding(paddingValues)
                  .padding(16.dp)
                  .semantics { testTag = "ux_flow_summary_content" },
          verticalArrangement = Arrangement.spacedBy(16.dp),
      ) {
        Text(
            text = "Step 3: Summary and completion.",
            style = MaterialTheme.typography.bodyLarge,
        )
        Text(
            text = "This screen closes the navigation loop for graph exploration.",
            style = MaterialTheme.typography.bodyMedium,
        )
        Button(
            onClick = onRestartFlow,
            modifier = Modifier.semantics { testTag = "ux_flow_summary_restart" },
        ) {
          Text("Restart Flow")
        }
      }
    }
  }
}
