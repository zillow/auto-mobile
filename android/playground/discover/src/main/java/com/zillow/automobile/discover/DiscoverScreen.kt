package com.zillow.automobile.discover

import android.content.res.Configuration
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Tab
import androidx.compose.material3.TabRow
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.sp
import com.zillow.automobile.design.system.theme.AutoMobileTheme
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DiscoverVideoScreen(onNavigateToVideoPlayer: (String) -> Unit) {
  val tabs: Map<String, @Composable () -> Unit> =
      mapOf(
          "Tap" to { TapScreen() },
          "Swipe" to { SwipeScreen() },
          "Media" to { VideoListScreen(onNavigateToVideoPlayer = onNavigateToVideoPlayer) },
          "Text" to { InputTextScreen() },
          "Chat" to { ChatScreen() },
      )
  val tabPageMap: Map<Int, @Composable () -> Unit> =
      tabs.map { it.value }.mapIndexed { index, entry -> index to entry }.toMap()
  val tabTitles = tabs.keys
  val pagerState = rememberPagerState(pageCount = { tabTitles.size })
  val coroutineScope = rememberCoroutineScope()

  Scaffold(
      topBar = {
        TopAppBar(
            title = { Text(text = "Discover", fontSize = 24.sp, fontWeight = FontWeight.Bold) })
      }) { paddingValues ->
        Column(modifier = Modifier.fillMaxSize().padding(paddingValues)) {
          TabRow(selectedTabIndex = pagerState.currentPage, modifier = Modifier.fillMaxWidth()) {
            tabTitles.forEachIndexed { index, title ->
              Tab(
                  selected = pagerState.currentPage == index,
                  onClick = { coroutineScope.launch { pagerState.animateScrollToPage(index) } },
                  text = { Text(title) })
            }
          }

          HorizontalPager(state = pagerState, modifier = Modifier.fillMaxSize()) { page ->
            tabPageMap.getOrDefault(page, defaultValue = {})()
          }
        }
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
fun PreviewDiscoverVideoScreen() {

  val isDarkMode =
      when (LocalConfiguration.current.uiMode and Configuration.UI_MODE_NIGHT_MASK) {
        Configuration.UI_MODE_NIGHT_YES -> true
        else -> false
      }

  AutoMobileTheme(darkTheme = isDarkMode) { DiscoverVideoScreen(onNavigateToVideoPlayer = {}) }
}
