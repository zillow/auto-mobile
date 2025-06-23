package com.zillow.automobile.discover

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.Star
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ElevatedButton
import androidx.compose.material3.ExtendedFloatingActionButton
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Slider
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.OutlinedButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.ui.platform.LocalContext
import com.zillow.automobile.storage.AnalyticsRepository
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TapScreen() {
  // Analytics tracking
  val context = LocalContext.current
  val analyticsRepository = remember { AnalyticsRepository(context) }

  // State management for interactive elements
  var switchChecked by remember { mutableStateOf(false) }
  var checkboxChecked by remember { mutableStateOf(false) }
  var radioSelected by remember { mutableStateOf(false) }
  var sliderValue by remember { mutableStateOf(0.5f) }
  var chip1Selected by remember { mutableStateOf(false) }
  var chip2Selected by remember { mutableStateOf(true) }
  var chip3Selected by remember { mutableStateOf(false) }
  var buttonPressCount by remember { mutableStateOf(0) }

  // Helper function to track taps
  val trackTap = {
    buttonPressCount++
    analyticsRepository.trackEvent("tap")
  }

  Column(
    modifier = Modifier
      .fillMaxSize()
      .verticalScroll(rememberScrollState())
      .padding(16.dp),
    verticalArrangement = Arrangement.spacedBy(16.dp)
  ) {
    Text(
      text = "TAP SCREEN",
      fontSize = 24.sp,
      fontWeight = FontWeight.Bold,
      modifier = Modifier.fillMaxWidth()
    )

    Text(
      text = "Various tappable widgets for testing",
      fontSize = 16.sp,
      color = MaterialTheme.colorScheme.onSurfaceVariant,
      modifier = Modifier.fillMaxWidth()
    )

    // Button press counter for visual feedback
    if (buttonPressCount > 0) {
      Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(
          containerColor = MaterialTheme.colorScheme.primaryContainer
        )
      ) {
        Text(
          text = "Buttons pressed: $buttonPressCount times",
          modifier = Modifier.padding(16.dp),
          color = MaterialTheme.colorScheme.onPrimaryContainer,
          fontSize = 16.sp,
          fontWeight = FontWeight.Medium
        )
      }
    }

    // Button varieties
    Card(
      modifier = Modifier.fillMaxWidth(),
      elevation = CardDefaults.cardElevation(defaultElevation = 4.dp)
    ) {
      Column(modifier = Modifier.padding(16.dp)) {
        Text(
          text = "Buttons",
          fontSize = 18.sp,
          fontWeight = FontWeight.Bold,
          modifier = Modifier.padding(bottom = 8.dp)
        )

        Row(
          modifier = Modifier.fillMaxWidth(),
          horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
          Button(
            onClick = trackTap,
            modifier = Modifier.weight(1f)
          ) {
            Text("Button")
          }

          ElevatedButton(
            onClick = trackTap,
            modifier = Modifier.weight(1f)
          ) {
            Text("Elevated")
          }
        }

        Spacer(modifier = Modifier.height(8.dp))

        Row(
          modifier = Modifier.fillMaxWidth(),
          horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
          OutlinedButton(
            onClick = trackTap,
            modifier = Modifier.weight(1f)
          ) {
            Text("Outlined")
          }

          TextButton(
            onClick = trackTap,
            modifier = Modifier.weight(1f)
          ) {
            Text("Text")
          }
        }

        Spacer(modifier = Modifier.height(8.dp))

        FilledTonalButton(
          onClick = trackTap,
          modifier = Modifier.fillMaxWidth()
        ) {
          Text("Filled Tonal Button")
        }
      }
    }

    // Toggle controls
    Card(
      modifier = Modifier.fillMaxWidth(),
      elevation = CardDefaults.cardElevation(defaultElevation = 4.dp)
    ) {
      Column(modifier = Modifier.padding(16.dp)) {
        Text(
          text = "Toggle Controls",
          fontSize = 18.sp,
          fontWeight = FontWeight.Bold,
          modifier = Modifier.padding(bottom = 8.dp)
        )

        Row(
          modifier = Modifier.fillMaxWidth(),
          verticalAlignment = Alignment.CenterVertically,
          horizontalArrangement = Arrangement.spacedBy(16.dp)
        ) {
          Switch(
            checked = switchChecked,
            onCheckedChange = { switchChecked = it }
          )
          Text("Switch")
        }

        Row(
          modifier = Modifier.fillMaxWidth(),
          verticalAlignment = Alignment.CenterVertically,
          horizontalArrangement = Arrangement.spacedBy(16.dp)
        ) {
          Checkbox(
            checked = checkboxChecked,
            onCheckedChange = { checkboxChecked = it }
          )
          Text("Checkbox")
        }

        Row(
          modifier = Modifier.fillMaxWidth(),
          verticalAlignment = Alignment.CenterVertically,
          horizontalArrangement = Arrangement.spacedBy(16.dp)
        ) {
          RadioButton(
            selected = radioSelected,
            onClick = { radioSelected = !radioSelected }
          )
          Text("Radio Button")
        }
      }
    }

    // Icon buttons
    Card(
      modifier = Modifier.fillMaxWidth(),
      elevation = CardDefaults.cardElevation(defaultElevation = 4.dp)
    ) {
      Column(modifier = Modifier.padding(16.dp)) {
        Text(
          text = "Icon Buttons",
          fontSize = 18.sp,
          fontWeight = FontWeight.Bold,
          modifier = Modifier.padding(bottom = 8.dp)
        )

        Row(
          modifier = Modifier.fillMaxWidth(),
          horizontalArrangement = Arrangement.SpaceEvenly
        ) {
          IconButton(onClick = trackTap) {
            Icon(Icons.Filled.Edit, contentDescription = "Edit")
          }

          IconButton(onClick = trackTap) {
            Icon(Icons.Filled.Delete, contentDescription = "Delete")
          }

          IconButton(onClick = trackTap) {
            Icon(Icons.Filled.Favorite, contentDescription = "Favorite")
          }

          IconButton(onClick = trackTap) {
            Icon(Icons.Filled.Star, contentDescription = "Star")
          }

          IconButton(onClick = trackTap) {
            Icon(Icons.Filled.Refresh, contentDescription = "Refresh")
          }
        }
      }
    }

    // Chips
    Card(
      modifier = Modifier.fillMaxWidth(),
      elevation = CardDefaults.cardElevation(defaultElevation = 4.dp)
    ) {
      Column(modifier = Modifier.padding(16.dp)) {
        Text(
          text = "Filter Chips",
          fontSize = 18.sp,
          fontWeight = FontWeight.Bold,
          modifier = Modifier.padding(bottom = 8.dp)
        )

        Row(
          modifier = Modifier.fillMaxWidth(),
          horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
          FilterChip(
            selected = chip1Selected,
            onClick = {
              chip1Selected = !chip1Selected
              trackTap()
            },
            label = { Text("Chip 1") }
          )

          FilterChip(
            selected = chip2Selected,
            onClick = {
              chip2Selected = !chip2Selected
              trackTap()
            },
            label = { Text("Chip 2") }
          )

          FilterChip(
            selected = chip3Selected,
            onClick = {
              chip3Selected = !chip3Selected
              trackTap()
            },
            label = { Text("Chip 3") }
          )
        }
      }
    }

    // Slider and progress
    Card(
      modifier = Modifier.fillMaxWidth(),
      elevation = CardDefaults.cardElevation(defaultElevation = 4.dp)
    ) {
      Column(modifier = Modifier.padding(16.dp)) {
        Text(
          text = "Slider & Progress",
          fontSize = 18.sp,
          fontWeight = FontWeight.Bold,
          modifier = Modifier.padding(bottom = 8.dp)
        )

        Text("Slider Value: ${(sliderValue * 100).toInt()}%")
        Slider(
          value = sliderValue,
          onValueChange = { sliderValue = it },
          modifier = Modifier.fillMaxWidth()
        )

        Spacer(modifier = Modifier.height(16.dp))

        Text("Progress Indicators")
        LinearProgressIndicator(
          modifier = Modifier.fillMaxWidth(),
          progress = { sliderValue }
        )

        Spacer(modifier = Modifier.height(8.dp))

        Row(
          modifier = Modifier.fillMaxWidth(),
          horizontalArrangement = Arrangement.Center
        ) {
          CircularProgressIndicator(progress = { sliderValue })
        }
      }
    }

    // FABs
    Card(
      modifier = Modifier.fillMaxWidth(),
      elevation = CardDefaults.cardElevation(defaultElevation = 4.dp)
    ) {
      Column(modifier = Modifier.padding(16.dp)) {
        Text(
          text = "Floating Action Buttons",
          fontSize = 18.sp,
          fontWeight = FontWeight.Bold,
          modifier = Modifier.padding(bottom = 8.dp)
        )

        Row(
          modifier = Modifier.fillMaxWidth(),
          horizontalArrangement = Arrangement.SpaceEvenly
        ) {
          FloatingActionButton(
            onClick = trackTap
          ) {
            Icon(Icons.Filled.Add, contentDescription = "Add")
          }

          ExtendedFloatingActionButton(
            onClick = trackTap,
            icon = { Icon(Icons.Filled.Settings, contentDescription = "Settings") },
            text = { Text("Settings") }
          )
        }
      }
    }
  }
}

@Preview(showBackground = true)
@Composable
fun PreviewTapScreen() {
  MaterialTheme {
    TapScreen()
  }
}
