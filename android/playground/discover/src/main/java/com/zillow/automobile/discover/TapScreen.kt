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
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExtendedFloatingActionButton
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Slider
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.semantics.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.zillow.automobile.design.system.theme.AutoMobileTheme
import com.zillow.automobile.storage.AnalyticsRepository

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
      modifier =
          Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp).semantics {
            testTag = "tap_screen_content"
          },
      verticalArrangement = Arrangement.spacedBy(16.dp)) {
        Text(
            text = "TAP SCREEN",
            fontSize = 24.sp,
            fontWeight = FontWeight.Bold,
            modifier = Modifier.fillMaxWidth().semantics { testTag = "tap_screen_title" })

        Text(
            text = "Various tappable widgets for testing",
            fontSize = 16.sp,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.fillMaxWidth().semantics { testTag = "tap_screen_description" })

        // Button press counter for visual feedback
        if (buttonPressCount > 0) {
          Card(
              modifier = Modifier.fillMaxWidth().semantics { testTag = "button_press_counter" },
              colors =
                  CardDefaults.cardColors(
                      containerColor = MaterialTheme.colorScheme.primaryContainer)) {
                Text(
                    text = "Buttons pressed: $buttonPressCount times",
                    modifier =
                        Modifier.padding(16.dp).semantics {
                          testTag = "button_press_counter_text"
                          stateDescription = "Button press count: $buttonPressCount"
                        },
                    color = MaterialTheme.colorScheme.onPrimaryContainer,
                    fontSize = 16.sp,
                    fontWeight = FontWeight.Medium)
              }
        }

        // Button varieties
        Card(
            modifier = Modifier.fillMaxWidth().semantics { testTag = "buttons_card" },
            elevation = CardDefaults.cardElevation(defaultElevation = 4.dp)) {
              Column(modifier = Modifier.padding(16.dp)) {
                Text(
                    text = "Buttons",
                    fontSize = 18.sp,
                    fontWeight = FontWeight.Bold,
                    modifier =
                        Modifier.padding(bottom = 8.dp).semantics {
                          testTag = "buttons_section_title"
                        })

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                      Button(
                          onClick = trackTap,
                          modifier =
                              Modifier.weight(1f).semantics {
                                testTag = "button_regular"
                                contentDescription = "Regular Button"
                              }) {
                            Text("Button")
                          }

                      ElevatedButton(
                          onClick = trackTap,
                          modifier =
                              Modifier.weight(1f).semantics {
                                testTag = "button_elevated"
                                contentDescription = "Elevated Button"
                              }) {
                            Text("Elevated")
                          }
                    }

                Spacer(modifier = Modifier.height(8.dp))

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                      OutlinedButton(
                          onClick = trackTap,
                          modifier =
                              Modifier.weight(1f).semantics {
                                testTag = "button_outlined"
                                contentDescription = "Outlined Button"
                              }) {
                            Text("Outlined")
                          }

                      TextButton(
                          onClick = trackTap,
                          modifier =
                              Modifier.weight(1f).semantics {
                                testTag = "button_text"
                                contentDescription = "Text Button"
                              }) {
                            Text("Text")
                          }
                    }

                Spacer(modifier = Modifier.height(8.dp))

                FilledTonalButton(
                    onClick = trackTap,
                    modifier =
                        Modifier.fillMaxWidth().semantics {
                          testTag = "button_filled_tonal"
                          contentDescription = "Filled Tonal Button"
                        }) {
                      Text("Filled Tonal Button")
                    }
              }
            }

        // Toggle controls
        Card(
            modifier = Modifier.fillMaxWidth().semantics { testTag = "toggle_controls_card" },
            elevation = CardDefaults.cardElevation(defaultElevation = 4.dp)) {
              Column(modifier = Modifier.padding(16.dp)) {
                Text(
                    text = "Toggle Controls",
                    fontSize = 18.sp,
                    fontWeight = FontWeight.Bold,
                    modifier =
                        Modifier.padding(bottom = 8.dp).semantics {
                          testTag = "toggle_controls_section_title"
                        })

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                      Switch(
                          checked = switchChecked,
                          onCheckedChange = {
                            switchChecked = it
                            trackTap()
                          },
                          modifier =
                              Modifier.semantics {
                                testTag = "switch_control"
                                contentDescription =
                                    if (switchChecked) "Switch is on" else "Switch is off"
                                stateDescription = if (switchChecked) "Enabled" else "Disabled"
                              })
                      Text("Switch", modifier = Modifier.semantics { testTag = "switch_label" })
                    }

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                      Checkbox(
                          checked = checkboxChecked,
                          onCheckedChange = {
                            checkboxChecked = it
                            trackTap()
                          },
                          modifier =
                              Modifier.semantics {
                                testTag = "checkbox_control"
                                contentDescription =
                                    if (checkboxChecked) "Checkbox is checked"
                                    else "Checkbox is unchecked"
                                stateDescription = if (checkboxChecked) "Checked" else "Unchecked"
                              })
                      Text("Checkbox", modifier = Modifier.semantics { testTag = "checkbox_label" })
                    }

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                      RadioButton(
                          selected = radioSelected,
                          onClick = {
                            radioSelected = !radioSelected
                            trackTap()
                          },
                          modifier =
                              Modifier.semantics {
                                testTag = "radio_button_control"
                                contentDescription =
                                    if (radioSelected) "Radio button is selected"
                                    else "Radio button is not selected"
                                stateDescription = if (radioSelected) "Selected" else "Not selected"
                              })
                      Text(
                          "Radio Button",
                          modifier = Modifier.semantics { testTag = "radio_button_label" })
                    }
              }
            }

        // Icon buttons
        Card(
            modifier = Modifier.fillMaxWidth().semantics { testTag = "icon_buttons_card" },
            elevation = CardDefaults.cardElevation(defaultElevation = 4.dp)) {
              Column(modifier = Modifier.padding(16.dp)) {
                Text(
                    text = "Icon Buttons",
                    fontSize = 18.sp,
                    fontWeight = FontWeight.Bold,
                    modifier =
                        Modifier.padding(bottom = 8.dp).semantics {
                          testTag = "icon_buttons_section_title"
                        })

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceEvenly) {
                      IconButton(
                          onClick = trackTap,
                          modifier =
                              Modifier.semantics {
                                testTag = "icon_button_edit"
                                contentDescription = "Edit"
                              }) {
                            Icon(Icons.Filled.Edit, contentDescription = "Edit")
                          }

                      IconButton(
                          onClick = trackTap,
                          modifier =
                              Modifier.semantics {
                                testTag = "icon_button_delete"
                                contentDescription = "Delete"
                              }) {
                            Icon(Icons.Filled.Delete, contentDescription = "Delete")
                          }

                      IconButton(
                          onClick = trackTap,
                          modifier =
                              Modifier.semantics {
                                testTag = "icon_button_favorite"
                                contentDescription = "Favorite"
                              }) {
                            Icon(Icons.Filled.Favorite, contentDescription = "Favorite")
                          }

                      IconButton(
                          onClick = trackTap,
                          modifier =
                              Modifier.semantics {
                                testTag = "icon_button_star"
                                contentDescription = "Star"
                              }) {
                            Icon(Icons.Filled.Star, contentDescription = "Star")
                          }

                      IconButton(
                          onClick = trackTap,
                          modifier =
                              Modifier.semantics {
                                testTag = "icon_button_refresh"
                                contentDescription = "Refresh"
                              }) {
                            Icon(Icons.Filled.Refresh, contentDescription = "Refresh")
                          }
                    }
              }
            }

        // Chips
        Card(
            modifier = Modifier.fillMaxWidth().semantics { testTag = "filter_chips_card" },
            elevation = CardDefaults.cardElevation(defaultElevation = 4.dp)) {
              Column(modifier = Modifier.padding(16.dp)) {
                Text(
                    text = "Filter Chips",
                    fontSize = 18.sp,
                    fontWeight = FontWeight.Bold,
                    modifier =
                        Modifier.padding(bottom = 8.dp).semantics {
                          testTag = "filter_chips_section_title"
                        })

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                      FilterChip(
                          selected = chip1Selected,
                          onClick = {
                            chip1Selected = !chip1Selected
                            trackTap()
                          },
                          label = { Text("Chip 1") },
                          modifier =
                              Modifier.semantics {
                                testTag = "filter_chip_1"
                                contentDescription =
                                    if (chip1Selected) "Chip 1 is selected"
                                    else "Chip 1 is not selected"
                                stateDescription = if (chip1Selected) "Selected" else "Not selected"
                              })

                      FilterChip(
                          selected = chip2Selected,
                          onClick = {
                            chip2Selected = !chip2Selected
                            trackTap()
                          },
                          label = { Text("Chip 2") },
                          modifier =
                              Modifier.semantics {
                                testTag = "filter_chip_2"
                                contentDescription =
                                    if (chip2Selected) "Chip 2 is selected"
                                    else "Chip 2 is not selected"
                                stateDescription = if (chip2Selected) "Selected" else "Not selected"
                              })

                      FilterChip(
                          selected = chip3Selected,
                          onClick = {
                            chip3Selected = !chip3Selected
                            trackTap()
                          },
                          label = { Text("Chip 3") },
                          modifier =
                              Modifier.semantics {
                                testTag = "filter_chip_3"
                                contentDescription =
                                    if (chip3Selected) "Chip 3 is selected"
                                    else "Chip 3 is not selected"
                                stateDescription = if (chip3Selected) "Selected" else "Not selected"
                              })
                    }
              }
            }

        // Slider and progress
        Card(
            modifier = Modifier.fillMaxWidth().semantics { testTag = "slider_progress_card" },
            elevation = CardDefaults.cardElevation(defaultElevation = 4.dp)) {
              Column(modifier = Modifier.padding(16.dp)) {
                Text(
                    text = "Slider & Progress",
                    fontSize = 18.sp,
                    fontWeight = FontWeight.Bold,
                    modifier =
                        Modifier.padding(bottom = 8.dp).semantics {
                          testTag = "slider_progress_section_title"
                        })

                Text(
                    "Slider Value: ${(sliderValue * 100).toInt()}%",
                    modifier = Modifier.semantics { testTag = "slider_value_text" })
                Slider(
                    value = sliderValue,
                    onValueChange = { sliderValue = it },
                    modifier =
                        Modifier.fillMaxWidth().semantics {
                          testTag = "slider_control"
                          contentDescription =
                              "Slider with value ${(sliderValue * 100).toInt()} percent"
                          stateDescription = "${(sliderValue * 100).toInt()} percent"
                        })

                Spacer(modifier = Modifier.height(16.dp))

                Text(
                    "Progress Indicators",
                    modifier = Modifier.semantics { testTag = "progress_indicators_label" })
                LinearProgressIndicator(
                    modifier =
                        Modifier.fillMaxWidth().semantics {
                          testTag = "linear_progress_indicator"
                          contentDescription =
                              "Linear progress indicator showing ${(sliderValue * 100).toInt()} percent"
                          stateDescription = "${(sliderValue * 100).toInt()} percent complete"
                        },
                    progress = { sliderValue })

                Spacer(modifier = Modifier.height(8.dp))

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.Center) {
                      CircularProgressIndicator(
                          progress = { sliderValue },
                          modifier =
                              Modifier.semantics {
                                testTag = "circular_progress_indicator"
                                contentDescription =
                                    "Circular progress indicator showing ${(sliderValue * 100).toInt()} percent"
                                stateDescription = "${(sliderValue * 100).toInt()} percent complete"
                              })
                    }
              }
            }

        // FABs
        Card(
            modifier =
                Modifier.fillMaxWidth().semantics { testTag = "floating_action_buttons_card" },
            elevation = CardDefaults.cardElevation(defaultElevation = 4.dp)) {
              Column(modifier = Modifier.padding(16.dp)) {
                Text(
                    text = "Floating Action Buttons",
                    fontSize = 18.sp,
                    fontWeight = FontWeight.Bold,
                    modifier =
                        Modifier.padding(bottom = 8.dp).semantics {
                          testTag = "floating_action_buttons_section_title"
                        })

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceEvenly) {
                      FloatingActionButton(
                          onClick = trackTap,
                          modifier =
                              Modifier.semantics {
                                testTag = "fab_add"
                                contentDescription = "Add"
                              }) {
                            Icon(Icons.Filled.Add, contentDescription = "Add")
                          }

                      ExtendedFloatingActionButton(
                          onClick = trackTap,
                          icon = { Icon(Icons.Filled.Settings, contentDescription = "Settings") },
                          text = { Text("Settings") },
                          modifier =
                              Modifier.semantics {
                                testTag = "fab_extended_settings"
                                contentDescription = "Settings"
                              })
                    }
              }
            }
      }
}

@Preview(showBackground = true)
@Composable
fun PreviewTapScreen() {
  AutoMobileTheme { TapScreen() }
}
