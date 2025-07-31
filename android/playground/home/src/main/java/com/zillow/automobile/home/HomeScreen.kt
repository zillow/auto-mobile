package com.zillow.automobile.home

import android.content.res.Configuration
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
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.tooling.preview.Preview
import com.zillow.automobile.design.system.theme.AutoMobileTheme
import com.zillow.automobile.discover.DiscoverVideoScreen
import com.zillow.automobile.settings.SettingsScreen
import com.zillow.automobile.storage.AnalyticsTracker

data class BottomNavItem(val label: String, val icon: ImageVector, val route: String)

@Composable
fun HomeScreen(
    modifier: Modifier = Modifier,
    initialSelectedTab: Int = 0,
    initialSelectedSubTab: Int? = null,
    onNavigateToVideoPlayer: (String) -> Unit = {},
    onNavigateToSlides: (Int) -> Unit = {},
    onLogout: () -> Unit = {},
    onGuestModeNavigateToLogin: () -> Unit = {}
) {
  var bottomNavSelection by remember { mutableIntStateOf(initialSelectedTab) }
  HomeScreenCore(
      modifier = modifier,
      bottomNavSelected = bottomNavSelection,
      setBottomNavSelection = { bottomNavSelection = it },
      initialSelectedSubTab = initialSelectedSubTab,
      onNavigateToVideoPlayer = onNavigateToVideoPlayer,
      onNavigateToSlides = onNavigateToSlides,
      onLogout = onLogout,
      onGuestModeNavigateToLogin = onGuestModeNavigateToLogin)
}

@Composable
fun HomeScreenCore(
    bottomNavSelected: Int,
    modifier: Modifier = Modifier,
    setBottomNavSelection: (Int) -> Unit = {},
    initialSelectedSubTab: Int? = null,
    onNavigateToVideoPlayer: (String) -> Unit = {},
    onNavigateToSlides: (Int) -> Unit = {},
    onLogout: () -> Unit = {},
    onGuestModeNavigateToLogin: () -> Unit = {}
) {
  val context = LocalContext.current
  val analyticsTracker = remember { AnalyticsTracker.getInstance().apply { initialize(context) } }

  val navItems =
      listOf(
          BottomNavItem("Discover", Icons.Filled.Search, "discover"),
          BottomNavItem("Slides", Icons.Filled.Slideshow, "slides"),
          BottomNavItem("Settings", Icons.Filled.Settings, "settings"))

  // Track screen view when tab changes
  LaunchedEffect(bottomNavSelected) {
    when (bottomNavSelected) {
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
                selected = bottomNavSelected == index,
                onClick = {
                  if (item.route == "slides") {
                    onNavigateToSlides(0) // Navigate to first slide
                  } else {
                    setBottomNavSelection(index)
                  }
                },
                icon = { Icon(item.icon, contentDescription = item.label) },
                label = { Text(item.label) })
          }
        }
      },
      modifier = modifier) { paddingValues ->
        Box(modifier = Modifier.fillMaxSize().padding(paddingValues)) {
          when (bottomNavSelected) {
            0 ->
                DiscoverVideoScreen(
                    onNavigateToVideoPlayer = onNavigateToVideoPlayer,
                    initialSelectedSubTab = initialSelectedSubTab)
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

@Preview(
    name = "Home - Tap - Keyboard Open",
    showBackground = true,
    uiMode = Configuration.UI_MODE_NIGHT_NO)
@Preview(
    name = "Home - Tap - Keyboard Open - Dark",
    showBackground = true,
    uiMode = Configuration.UI_MODE_NIGHT_YES)
@Composable
fun HomeScreenTapPreview() {

  val isDarkMode =
      when (LocalConfiguration.current.uiMode and Configuration.UI_MODE_NIGHT_MASK) {
        Configuration.UI_MODE_NIGHT_YES -> true
        else -> false
      }

  AutoMobileTheme(darkTheme = isDarkMode) { HomeScreenCore(bottomNavSelected = 0) }
}

@Preview(
    name = "Home - Settings - Keyboard Open",
    showBackground = true,
    uiMode = Configuration.UI_MODE_NIGHT_NO)
@Preview(
    name = "Home - Settings - Keyboard Open - Dark",
    showBackground = true,
    uiMode = Configuration.UI_MODE_NIGHT_YES)
@Composable
fun HomeScreenSettingsPreview() {

  val isDarkMode =
      when (LocalConfiguration.current.uiMode and Configuration.UI_MODE_NIGHT_MASK) {
        Configuration.UI_MODE_NIGHT_YES -> true
        else -> false
      }

  AutoMobileTheme(darkTheme = isDarkMode) { HomeScreenCore(bottomNavSelected = 2) }
}
