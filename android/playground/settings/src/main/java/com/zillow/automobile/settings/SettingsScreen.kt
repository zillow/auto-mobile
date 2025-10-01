package com.zillow.automobile.settings

import android.content.res.Configuration
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ExitToApp
import androidx.compose.material.icons.filled.Analytics
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.zillow.automobile.design.system.theme.AutoMobileTheme
import com.zillow.automobile.settings.ui.EmailEditBottomSheet
import com.zillow.automobile.settings.ui.ExperimentsSection
import com.zillow.automobile.settings.ui.ProfileTopAppBar
import kotlin.math.min

@Composable
fun StatisticItem(label: String, value: String) {
  Column(horizontalAlignment = Alignment.CenterHorizontally) {
    Text(
        text = value,
        fontSize = 24.sp,
        fontWeight = FontWeight.Bold,
        color = MaterialTheme.colorScheme.primary)
    Text(text = label, fontSize = 14.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
  }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SettingsScreen(onLogout: () -> Unit, onGuestModeNavigateToLogin: () -> Unit = {}) {
  val context = LocalContext.current
  val viewModel: SettingsViewModel = viewModel(factory = SettingsViewModelFactory(context))
  val experiments by viewModel.experiments.collectAsStateWithLifecycle()
  val userStats by viewModel.userStats.collectAsStateWithLifecycle()
  val trackingEnabled by viewModel.trackingEnabled.collectAsStateWithLifecycle()
  val email by viewModel.email.collectAsStateWithLifecycle()
  val name by viewModel.name.collectAsStateWithLifecycle()
  val shouldNavigateToLogin by viewModel.shouldNavigateToLogin.collectAsStateWithLifecycle()
  var isEditingEmail by remember { mutableStateOf(false) }
  var tempEmail by remember { mutableStateOf("") }

  // Handle guest mode navigation to login
  LaunchedEffect(shouldNavigateToLogin) {
    if (shouldNavigateToLogin) {
      onGuestModeNavigateToLogin()
      viewModel.onNavigatedToLogin()
    }
  }

  // Scroll state for dynamic behavior
  val scrollState = rememberScrollState()
  val scrollProgress by remember {
    derivedStateOf {
      min(1f, scrollState.value / 300f) // Transition over first 300px of scroll
    }
  }

  Scaffold(
      topBar = {
        ProfileTopAppBar(
            name = name,
            email = email,
            scrollProgress = scrollProgress,
            onEmailClick = {
              tempEmail = email
              isEditingEmail = true
            })
      }) { paddingValues ->
        Column(
            modifier =
                Modifier.fillMaxSize()
                    .padding(paddingValues)
                    .padding(16.dp)
                    .verticalScroll(scrollState),
            verticalArrangement = Arrangement.spacedBy(16.dp)) {
              HorizontalDivider()

              // Experiments Section
              ExperimentsSection(
                  experiments = experiments,
                  onExperimentsUpdated = { updatedExperiments ->
                    updatedExperiments.forEach { updatedExp ->
                      val originalExp = experiments.find { it.name == updatedExp.name }
                      if (originalExp != null &&
                          originalExp.currentTreatment != updatedExp.currentTreatment) {
                        viewModel.updateExperimentTreatment(updatedExp, updatedExp.currentTreatment)
                      }
                    }
                  })

              HorizontalDivider()

              // Statistics Section
              Card(
                  modifier = Modifier.fillMaxWidth(),
                  elevation = CardDefaults.cardElevation(defaultElevation = 4.dp),
                  shape = RoundedCornerShape(12.dp)) {
                    Column(
                        modifier = Modifier.padding(20.dp),
                        verticalArrangement = Arrangement.spacedBy(12.dp)) {
                          Row(
                              modifier = Modifier.fillMaxWidth(),
                              verticalAlignment = Alignment.CenterVertically) {
                                Icon(
                                    imageVector = Icons.Filled.Analytics,
                                    contentDescription = "Analytics",
                                    modifier = Modifier.padding(end = 8.dp),
                                    tint = MaterialTheme.colorScheme.primary)
                                Text(
                                    text = "Statistics",
                                    fontSize = 18.sp,
                                    fontWeight = FontWeight.Bold,
                                    color = MaterialTheme.colorScheme.onSurface)
                              }

                          HorizontalDivider(modifier = Modifier.padding(vertical = 8.dp))

                          Row(
                              modifier = Modifier.fillMaxWidth(),
                              horizontalArrangement = Arrangement.SpaceEvenly) {
                                StatisticItem("Taps", userStats.taps.toString())
                                StatisticItem("Swipes", userStats.swipes.toString())
                                StatisticItem("Screens", userStats.screensNavigated.toString())
                              }

                          HorizontalDivider(modifier = Modifier.padding(vertical = 8.dp))

                          Row(
                              modifier = Modifier.fillMaxWidth(),
                              verticalAlignment = Alignment.CenterVertically) {
                                Text(text = "Enable Tracking", modifier = Modifier.weight(1f))
                                Switch(
                                    checked = trackingEnabled,
                                    onCheckedChange = { viewModel.updateTrackingEnabled(it) })
                              }

                          Text(
                              text = "For demo purposes only. No data is transmitted anywhere.",
                              fontSize = 12.sp,
                              color = MaterialTheme.colorScheme.onSurfaceVariant,
                              modifier = Modifier.padding(top = 4.dp))
                        }
                  }

              // Logout Section
              Card(
                  modifier = Modifier.fillMaxWidth(),
                  elevation = CardDefaults.cardElevation(defaultElevation = 4.dp),
                  shape = RoundedCornerShape(12.dp),
                  colors =
                      CardDefaults.cardColors(
                          containerColor = MaterialTheme.colorScheme.errorContainer)) {
                    Column(
                        modifier = Modifier.padding(20.dp),
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.spacedBy(8.dp)) {
                          Text(
                              text = "Account Actions",
                              fontSize = 18.sp,
                              fontWeight = FontWeight.Bold,
                              color = MaterialTheme.colorScheme.onErrorContainer,
                              modifier = Modifier.padding(bottom = 12.dp))

                          Button(
                              onClick = { viewModel.resetOnboarding() },
                              modifier = Modifier.fillMaxWidth(),
                              colors =
                                  ButtonDefaults.buttonColors(
                                      containerColor = MaterialTheme.colorScheme.secondary)) {
                                Icon(
                                    imageVector = Icons.Filled.Refresh,
                                    contentDescription = "Reset Onboarding",
                                    modifier = Modifier.padding(end = 8.dp))
                                Text("Reset Onboarding")
                              }

                          Button(
                              onClick = onLogout,
                              modifier = Modifier.fillMaxWidth(),
                              colors =
                                  ButtonDefaults.buttonColors(
                                      containerColor = MaterialTheme.colorScheme.error)) {
                                Icon(
                                    imageVector = Icons.AutoMirrored.Filled.ExitToApp,
                                    contentDescription = "Logout",
                                    modifier = Modifier.padding(end = 8.dp))
                                Text("Logout")
                              }
                        }
                  }
            }
      }

  // Email editing bottom sheet
  if (isEditingEmail) {
    EmailEditBottomSheet(
        email = tempEmail,
        onEmailChange = { tempEmail = it },
        onDismiss = { isEditingEmail = false },
        onSave = {
          viewModel.saveEmail(tempEmail)
          isEditingEmail = false
        })
  }
}

@Preview(
    name = "Discover Screen - Keyboard Open",
    showBackground = true,
    uiMode = Configuration.UI_MODE_NIGHT_NO)
@Preview(
    name = "Discover Screen - Keyboard Open - Dark",
    showBackground = true,
    uiMode = Configuration.UI_MODE_NIGHT_YES)
@Composable
fun SettingsScreenMainPreview() {
  val isDarkMode =
      when (LocalConfiguration.current.uiMode and Configuration.UI_MODE_NIGHT_MASK) {
        Configuration.UI_MODE_NIGHT_YES -> true
        else -> false
      }

  AutoMobileTheme(darkTheme = isDarkMode) {
    SettingsScreen(onLogout = { /* Preview logout action */ })
  }
}
