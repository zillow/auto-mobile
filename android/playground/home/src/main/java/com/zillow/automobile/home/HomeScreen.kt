package com.zillow.automobile.home

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.systemBars
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.Slideshow
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.tooling.preview.Preview
import com.zillow.automobile.discover.DiscoverVideoScreen
import com.zillow.automobile.settings.SettingsScreen
import com.zillow.automobile.storage.AnalyticsTracker

data class BottomNavItem(val label: String, val icon: ImageVector, val route: String)

@Composable
fun HomeScreen(
    onNavigateToVideoPlayer: (String) -> Unit = {},
    onNavigateToSlides: (Int) -> Unit = {},
    onLogout: () -> Unit = {},
    onGuestModeNavigateToLogin: () -> Unit = {}
) {
  var selectedTab by remember { mutableIntStateOf(0) }
  val context = LocalContext.current
  val analyticsTracker = remember { AnalyticsTracker.getInstance().apply { initialize(context) } }

  val navItems =
      listOf(
          BottomNavItem("Discover", Icons.Filled.Search, "discover"),
          BottomNavItem("Slides", Icons.Filled.Slideshow, "slides"),
          BottomNavItem("Settings", Icons.Filled.Settings, "settings"))

  // Track screen view when tab changes
  LaunchedEffect(selectedTab) {
    when (selectedTab) {
      0 -> analyticsTracker.trackScreenView("DiscoverScreen")
      2 -> analyticsTracker.trackScreenView("SettingsScreen")
    }
  }

  Scaffold(
      contentWindowInsets = WindowInsets.systemBars,
      bottomBar = {
        NavigationBar(windowInsets = WindowInsets.navigationBars) {
          navItems.forEachIndexed { index, item ->
            NavigationBarItem(
                selected = selectedTab == index,
                onClick = {
                  if (item.route == "slides") {
                    onNavigateToSlides(0) // Navigate to first slide
                  } else {
                    selectedTab = index
                  }
                },
                icon = { Icon(item.icon, contentDescription = item.label) },
                label = { Text(item.label) })
          }
        }
      }) { paddingValues ->
        Box(modifier = Modifier.fillMaxSize().padding(paddingValues)) {
          when (selectedTab) {
            0 -> DiscoverVideoScreen(onNavigateToVideoPlayer = onNavigateToVideoPlayer)
            1 -> {
              // Slides handled by navigation - this case shouldn't be reached
              // since we navigate away when slides is selected
            }
            2 ->
                SettingsScreen(
                    onLogout = onLogout, onGuestModeNavigateToLogin = onGuestModeNavigateToLogin)
          }
        }
      }
}

/** Preview for the home screen with bottom navigation. */
@Preview(showBackground = true)
@Composable
fun HomeScreenPreview() {
  MaterialTheme { HomeScreen() }
}
