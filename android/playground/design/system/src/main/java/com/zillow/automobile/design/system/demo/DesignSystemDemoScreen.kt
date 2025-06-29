package com.zillow.automobile.design.system.demo

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
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.tooling.preview.Preview
import com.zillow.automobile.design.system.components.AutoMobileBackButton
import com.zillow.automobile.design.system.components.AutoMobileBodyText
import com.zillow.automobile.design.system.components.AutoMobileBottomNavigation
import com.zillow.automobile.design.system.components.AutoMobileButton
import com.zillow.automobile.design.system.components.AutoMobileCard
import com.zillow.automobile.design.system.components.AutoMobileExtendedFloatingActionButton
import com.zillow.automobile.design.system.components.AutoMobileFloatingActionButton
import com.zillow.automobile.design.system.components.AutoMobileHeadline
import com.zillow.automobile.design.system.components.AutoMobileLabel
import com.zillow.automobile.design.system.components.AutoMobileLogo
import com.zillow.automobile.design.system.components.AutoMobileOutlinedButton
import com.zillow.automobile.design.system.components.AutoMobileOutlinedCard
import com.zillow.automobile.design.system.components.AutoMobileOutlinedTextField
import com.zillow.automobile.design.system.components.AutoMobileSecondaryButton
import com.zillow.automobile.design.system.components.AutoMobileTextButton
import com.zillow.automobile.design.system.components.AutoMobileTextField
import com.zillow.automobile.design.system.components.AutoMobileTitle
import com.zillow.automobile.design.system.components.AutoMobileTopAppBar
import com.zillow.automobile.design.system.components.BottomNavItem
import com.zillow.automobile.design.system.theme.AutoMobileDimensions
import com.zillow.automobile.design.system.theme.AutoMobileTheme

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DesignSystemDemoScreen(onBackClick: () -> Unit = {}) {
  var textFieldValue by remember { mutableStateOf("Sample text") }
  var outlinedTextFieldValue by remember { mutableStateOf("Outlined sample") }

  AutoMobileTheme {
    Scaffold(
        topBar = {
          AutoMobileTopAppBar(
              title = { AutoMobileTitle("Design System Demo") },
              navigationIcon = { AutoMobileBackButton(onBackClick = onBackClick) })
        }) { paddingValues ->
          Column(
              modifier =
                  Modifier.fillMaxSize()
                      .padding(paddingValues)
                      .padding(AutoMobileDimensions.spacing4)
                      .verticalScroll(rememberScrollState()),
              verticalArrangement = Arrangement.spacedBy(AutoMobileDimensions.spacing4)) {
                // Typography Section
                AutoMobileCard {
                  AutoMobileHeadline("Typography")
                  Spacer(modifier = Modifier.height(AutoMobileDimensions.spacing2))
                  AutoMobileTitle("Title Text")
                  AutoMobileBodyText("This is body text that demonstrates the typography system.")
                  AutoMobileLabel("Label Text")
                }

                // Buttons Section
                AutoMobileCard {
                  AutoMobileHeadline("Buttons")
                  Spacer(modifier = Modifier.height(AutoMobileDimensions.spacing2))

                  Column(
                      verticalArrangement = Arrangement.spacedBy(AutoMobileDimensions.spacing2)) {
                        AutoMobileButton(
                            text = "Primary Button",
                            onClick = {},
                            modifier = Modifier.fillMaxWidth())

                        AutoMobileSecondaryButton(
                            text = "Secondary Button",
                            onClick = {},
                            modifier = Modifier.fillMaxWidth())

                        AutoMobileOutlinedButton(
                            text = "Outlined Button",
                            onClick = {},
                            modifier = Modifier.fillMaxWidth())

                        Row(
                            horizontalArrangement =
                                Arrangement.spacedBy(AutoMobileDimensions.spacing2)) {
                              AutoMobileTextButton(text = "Text Button", onClick = {})

                              AutoMobileButton(text = "Disabled", onClick = {}, enabled = false)
                            }
                      }
                }

                // Cards Section
                AutoMobileOutlinedCard {
                  AutoMobileHeadline("Cards")
                  Spacer(modifier = Modifier.height(AutoMobileDimensions.spacing2))
                  AutoMobileBodyText(
                      "This is an outlined card variant. Cards follow flat design principles and avoid nesting.")
                }

                // Text Fields Section
                AutoMobileCard {
                  AutoMobileHeadline("Text Fields")
                  Spacer(modifier = Modifier.height(AutoMobileDimensions.spacing2))

                  Column(
                      verticalArrangement = Arrangement.spacedBy(AutoMobileDimensions.spacing2)) {
                        AutoMobileTextField(
                            value = textFieldValue,
                            onValueChange = { textFieldValue = it },
                            label = { Text("Filled Text Field") },
                            modifier = Modifier.fillMaxWidth())

                        AutoMobileOutlinedTextField(
                            value = outlinedTextFieldValue,
                            onValueChange = { outlinedTextFieldValue = it },
                            label = { Text("Outlined Text Field") },
                            modifier = Modifier.fillMaxWidth())
                      }
                }

                // Color Showcase
                AutoMobileCard {
                  AutoMobileHeadline("Color System")
                  Spacer(modifier = Modifier.height(AutoMobileDimensions.spacing2))
                  AutoMobileBodyText("Primary: Black (#000000)")
                  AutoMobileBodyText("Secondary: Red (#FF0000)")
                  AutoMobileBodyText("Background: Eggshell (#F8F8FF)")
                  AutoMobileBodyText(text = "This text uses the primary color")
                  AutoMobileBodyText(text = "This text uses the secondary color")
                }

                // AutoMobile Logo Section
                AutoMobileCard {
                  AutoMobileHeadline("AutoMobile Logo")
                  Spacer(modifier = Modifier.height(AutoMobileDimensions.spacing2))

                  Column(
                      verticalArrangement = Arrangement.spacedBy(AutoMobileDimensions.spacing2)) {
                        AutoMobileBodyText("Logo sizes - Normal mode:")
                        Row(
                            horizontalArrangement =
                                Arrangement.spacedBy(AutoMobileDimensions.spacing2)) {
                              AutoMobileLogo()
                              AutoMobileLogo()
                              AutoMobileLogo()
                              AutoMobileLogo()
                            }

                        Spacer(modifier = Modifier.height(AutoMobileDimensions.spacing2))
                        AutoMobileBodyText("Party mode (holographic):")
                        Row(
                            horizontalArrangement =
                                Arrangement.spacedBy(AutoMobileDimensions.spacing2)) {
                              AutoMobileLogo()
                            }
                      }
                }

                // Floating Action Buttons Section
                AutoMobileCard {
                  AutoMobileHeadline("Floating Action Buttons")
                  Spacer(modifier = Modifier.height(AutoMobileDimensions.spacing2))

                  Row(horizontalArrangement = Arrangement.spacedBy(AutoMobileDimensions.spacing2)) {
                    AutoMobileFloatingActionButton(
                        onClick = {}, icon = Icons.Default.Add, contentDescription = "Add")

                    AutoMobileExtendedFloatingActionButton(
                        text = "Add Item",
                        onClick = {},
                        icon = Icons.Default.Add,
                        contentDescription = "Add Item")
                  }
                }

                // Bottom Navigation Section
                AutoMobileCard {
                  AutoMobileHeadline("Bottom Navigation")
                  Spacer(modifier = Modifier.height(AutoMobileDimensions.spacing2))

                  val bottomNavItems =
                      listOf(
                          BottomNavItem("Home", Icons.Default.Home),
                          BottomNavItem("Search", Icons.Default.Search),
                          BottomNavItem("Profile", Icons.Default.Person),
                          BottomNavItem("Settings", Icons.Default.Settings))

                  AutoMobileBottomNavigation(
                      items = bottomNavItems, selectedItemIndex = 0, onItemSelected = {})
                }

                Spacer(modifier = Modifier.height(AutoMobileDimensions.spacing8))
              }
        }
  }
}

@Preview(showBackground = true)
@Composable
private fun DesignSystemDemoScreenPreview() {
  DesignSystemDemoScreen()
}
