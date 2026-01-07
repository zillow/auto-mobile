package dev.jasonpearson.automobile.demos

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
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
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.testTag
import androidx.compose.ui.unit.dp
import dev.jasonpearson.automobile.sdk.TrackRecomposition

private data class PerformanceItem(
    val id: Int,
    val title: String,
    val subtitle: String,
    val price: String,
)

private val performanceItems =
    List(80) { index ->
      PerformanceItem(
          id = index + 1,
          title = "Product ${index + 1}",
          subtitle = "Demo item ${(index + 1) * 3}A",
          price = "$${(index + 1) * 2}",
      )
    }

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun StartupDemoScreen(onNavigateBack: () -> Unit) {
  TrackRecomposition(id = "screen.demo.startup", composableName = "StartupDemoScreen") {
    Scaffold(
        topBar = {
          TopAppBar(
              title = { Text(text = "Startup Demo") },
              navigationIcon = {
                IconButton(
                    onClick = onNavigateBack,
                    modifier = Modifier.semantics { testTag = "startup_back" },
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
                  .semantics { testTag = "startup_content" },
          verticalArrangement = Arrangement.spacedBy(16.dp),
      ) {
        Text(
            text = "This screen is used as a stable startup target.",
            style = MaterialTheme.typography.bodyLarge,
        )
        Text(
            text = "When measuring startup, wait for the Ready signal below.",
            style = MaterialTheme.typography.bodyMedium,
        )
        Card(
            modifier = Modifier.fillMaxWidth().semantics { testTag = "startup_ready_card" },
            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant),
        ) {
          Column(modifier = Modifier.fillMaxWidth().padding(16.dp)) {
            Text(text = "Ready", style = MaterialTheme.typography.titleMedium)
            Text(
                text = "UI is stable and interactive.",
                style = MaterialTheme.typography.bodySmall,
            )
          }
        }
      }
    }
  }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PerformanceListScreen(
    onNavigateToDetail: (Int) -> Unit,
    onNavigateBack: () -> Unit,
) {
  TrackRecomposition(id = "screen.demo.performance.list", composableName = "PerformanceListScreen") {
    Scaffold(
        topBar = {
          TopAppBar(
              title = { Text(text = "Performance List") },
              navigationIcon = {
                IconButton(
                    onClick = onNavigateBack,
                    modifier = Modifier.semantics { testTag = "performance_list_back" },
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
      LazyColumn(
          modifier =
              Modifier.fillMaxSize()
                  .padding(paddingValues)
                  .padding(horizontal = 16.dp)
                  .semantics { testTag = "performance_list" },
          verticalArrangement = Arrangement.spacedBy(12.dp),
      ) {
        items(performanceItems, key = { it.id }) { item ->
          Card(
              modifier =
                  Modifier.fillMaxWidth().semantics { testTag = "performance_item_${item.id}" },
              elevation = CardDefaults.cardElevation(defaultElevation = 2.dp),
          ) {
            Row(
                modifier = Modifier.fillMaxWidth().padding(16.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween,
            ) {
              Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text(text = item.title, style = MaterialTheme.typography.titleMedium)
                Text(text = item.subtitle, style = MaterialTheme.typography.bodySmall)
                Text(text = item.price, style = MaterialTheme.typography.bodySmall)
              }
              Button(
                  onClick = { onNavigateToDetail(item.id) },
                  modifier = Modifier.semantics { testTag = "performance_item_${item.id}_action" },
              ) {
                Text("View")
              }
            }
          }
        }
      }
    }
  }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PerformanceDetailScreen(
    itemId: Int,
    onNavigateBack: () -> Unit,
) {
  TrackRecomposition(
      id = "screen.demo.performance.detail.$itemId",
      composableName = "PerformanceDetailScreen",
  ) {
    Scaffold(
        topBar = {
          TopAppBar(
              title = { Text(text = "Performance Detail") },
              navigationIcon = {
                IconButton(
                    onClick = onNavigateBack,
                    modifier = Modifier.semantics { testTag = "performance_detail_back" },
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
                  .semantics { testTag = "performance_detail_content" },
          verticalArrangement = Arrangement.spacedBy(16.dp),
      ) {
        Text(
            text = "Detail for Product $itemId",
            style = MaterialTheme.typography.titleLarge,
        )
        Text(
            text = "Use this screen as the transition target from the list.",
            style = MaterialTheme.typography.bodyMedium,
        )
        Card(
            modifier = Modifier.fillMaxWidth().semantics { testTag = "performance_detail_card" },
            elevation = CardDefaults.cardElevation(defaultElevation = 2.dp),
        ) {
          Column(modifier = Modifier.fillMaxWidth().padding(16.dp)) {
            Text(text = "Spec $itemId", style = MaterialTheme.typography.titleMedium)
            Text(text = "Rating ${(itemId % 5) + 1}", style = MaterialTheme.typography.bodySmall)
            Text(text = "Status: In Stock", style = MaterialTheme.typography.bodySmall)
          }
        }
        Button(
            onClick = onNavigateBack,
            modifier = Modifier.semantics { testTag = "performance_detail_back_to_list" },
        ) {
          Text("Back to List")
        }
      }
    }
  }
}
