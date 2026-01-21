package dev.jasonpearson.automobile.demos

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.testTag
import androidx.compose.ui.unit.dp
import dev.jasonpearson.automobile.sdk.TrackRecomposition

private val LowContrastText = Color(0xFFB8B8B8)
private val LowContrastSurface = Color(0xFFF5F5F5)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ContrastDemoScreen(onNavigateBack: () -> Unit) {
  TrackRecomposition(id = "screen.demo.a11y.contrast", composableName = "ContrastDemoScreen") {
    Scaffold(
        topBar = {
          TopAppBar(
              title = { Text(text = "Contrast Demo") },
              navigationIcon = {
                IconButton(
                    onClick = onNavigateBack,
                    modifier = Modifier.semantics { testTag = "contrast_back" },
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
              Modifier.fillMaxSize().padding(paddingValues).padding(16.dp).semantics {
                testTag = "contrast_content"
              },
          verticalArrangement = Arrangement.spacedBy(16.dp),
      ) {
        Text(
            text = "Intentional contrast failures for auditing.",
            style = MaterialTheme.typography.bodyLarge,
        )
        Card(
            modifier = Modifier.fillMaxWidth().semantics { testTag = "contrast_low_card" },
            colors = CardDefaults.cardColors(containerColor = LowContrastSurface),
        ) {
          Column(modifier = Modifier.fillMaxWidth().padding(16.dp)) {
            Text(
                text = "Low contrast body text",
                color = LowContrastText,
                modifier = Modifier.semantics { testTag = "contrast_low_text" },
            )
            Text(
                text = "Secondary text with insufficient contrast",
                color = LowContrastText,
                style = MaterialTheme.typography.bodySmall,
                modifier = Modifier.semantics { testTag = "contrast_low_text_secondary" },
            )
          }
        }
        Button(
            onClick = {},
            modifier = Modifier.semantics { testTag = "contrast_low_button" },
            colors =
                ButtonDefaults.buttonColors(
                    containerColor = LowContrastSurface,
                    contentColor = LowContrastText,
                ),
        ) {
          Text("Low Contrast Action")
        }
      }
    }
  }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TapTargetsDemoScreen(onNavigateBack: () -> Unit) {
  TrackRecomposition(id = "screen.demo.a11y.tap", composableName = "TapTargetsDemoScreen") {
    Scaffold(
        topBar = {
          TopAppBar(
              title = { Text(text = "Tap Targets Demo") },
              navigationIcon = {
                IconButton(
                    onClick = onNavigateBack,
                    modifier = Modifier.semantics { testTag = "tap_targets_back" },
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
              Modifier.fillMaxSize().padding(paddingValues).padding(16.dp).semantics {
                testTag = "tap_targets_content"
              },
          verticalArrangement = Arrangement.spacedBy(16.dp),
      ) {
        Text(
            text = "These targets are intentionally small or tightly spaced.",
            style = MaterialTheme.typography.bodyLarge,
        )
        Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
          SmallTapTarget(
              icon = Icons.Filled.Edit,
              label = "Edit",
              tag = "tap_target_small_edit",
          )
          SmallTapTarget(
              icon = Icons.Filled.Close,
              label = "Close",
              tag = "tap_target_small_close",
          )
          SmallTapTarget(
              icon = Icons.Filled.Favorite,
              label = "Favorite",
              tag = "tap_target_small_favorite",
          )
        }
        Row(verticalAlignment = Alignment.CenterVertically) {
          Text(
              text = "Tiny Link",
              color = MaterialTheme.colorScheme.primary,
              modifier =
                  Modifier.padding(2.dp)
                      .clickable {}
                      .semantics { testTag = "tap_target_tiny_link" },
          )
          Spacer(modifier = Modifier.width(6.dp))
          Text(
              text = "Another Link",
              color = MaterialTheme.colorScheme.primary,
              modifier =
                  Modifier.padding(2.dp)
                      .clickable {}
                      .semantics { testTag = "tap_target_tiny_link_2" },
          )
        }
        Card(
            modifier = Modifier.fillMaxWidth().semantics { testTag = "tap_targets_note" },
            elevation = CardDefaults.cardElevation(defaultElevation = 2.dp),
        ) {
          Column(modifier = Modifier.fillMaxWidth().padding(16.dp)) {
            Text(text = "Spacing below 8dp and sizes under 44dp.")
          }
        }
      }
    }
  }
}

@Composable
private fun SmallTapTarget(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    label: String,
    tag: String,
) {
  Column(horizontalAlignment = Alignment.CenterHorizontally) {
    Box(
        modifier =
            Modifier.size(32.dp)
                .clickable {}
                .semantics { this.testTag = tag }
                .background(MaterialTheme.colorScheme.surfaceVariant),
        contentAlignment = Alignment.Center,
    ) {
      Icon(
          imageVector = icon,
          contentDescription = label,
          modifier = Modifier.size(16.dp),
      )
    }
    Text(text = label, style = MaterialTheme.typography.bodySmall)
  }
}
