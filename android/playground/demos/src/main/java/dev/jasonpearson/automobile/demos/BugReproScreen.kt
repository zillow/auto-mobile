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
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.testTag
import androidx.compose.ui.unit.dp
import dev.jasonpearson.automobile.sdk.TrackRecomposition

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun BugReproScreen(onNavigateBack: () -> Unit) {
  TrackRecomposition(id = "screen.demo.bug.repro", composableName = "BugReproScreen") {
    var expectedCount by remember { mutableIntStateOf(0) }
    var displayedCount by remember { mutableIntStateOf(0) }
    var bugEnabled by remember { mutableStateOf(false) }
    var statusMessage by remember { mutableStateOf("Idle") }

    Scaffold(
        topBar = {
          TopAppBar(
              title = { Text(text = "Bug Reproduction Demo") },
              navigationIcon = {
                IconButton(
                    onClick = onNavigateBack,
                    modifier = Modifier.semantics { testTag = "bug_repro_back" },
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
                  .semantics { testTag = "bug_repro_content" },
          verticalArrangement = Arrangement.spacedBy(16.dp),
      ) {
        Text(
            text = "Enable the bug, then tap Add Item to reproduce.",
            style = MaterialTheme.typography.bodyLarge,
        )

        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
        ) {
          Text(text = "Enable Bug", modifier = Modifier.weight(1f))
          Switch(
              checked = bugEnabled,
              onCheckedChange = { bugEnabled = it },
              modifier = Modifier.semantics { testTag = "bug_repro_toggle" },
          )
        }

        Card(
            modifier = Modifier.fillMaxWidth().semantics { testTag = "bug_repro_status_card" },
            elevation = CardDefaults.cardElevation(defaultElevation = 2.dp),
        ) {
          Column(
              modifier = Modifier.fillMaxWidth().padding(16.dp),
              verticalArrangement = Arrangement.spacedBy(8.dp),
          ) {
            Text(
                text = "Expected count: $expectedCount",
                modifier = Modifier.semantics { testTag = "bug_repro_expected" },
            )
            Text(
                text = "Displayed count: $displayedCount",
                modifier = Modifier.semantics { testTag = "bug_repro_displayed" },
            )
            Text(
                text = "Status: $statusMessage",
                modifier = Modifier.semantics { testTag = "bug_repro_status" },
            )
          }
        }

        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
          Button(
              onClick = {
                expectedCount += 1
                if (!bugEnabled) {
                  displayedCount += 1
                  statusMessage = "Updated"
                } else {
                  statusMessage = "Bug triggered: UI did not update"
                }
              },
              modifier = Modifier.semantics { testTag = "bug_repro_add" },
          ) {
            Text("Add Item")
          }
          Button(
              onClick = {
                expectedCount = 0
                displayedCount = 0
                statusMessage = "Reset"
              },
              modifier = Modifier.semantics { testTag = "bug_repro_reset" },
          ) {
            Text("Reset")
          }
        }
      }
    }
  }
}
