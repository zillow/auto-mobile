package com.zillow.automobile.discover

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Tab
import androidx.compose.material3.TabRow
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DiscoverVideoScreen(onNavigateToVideoPlayer: (String) -> Unit) {
  val pagerState = rememberPagerState(pageCount = { 5 })
  val coroutineScope = rememberCoroutineScope()

  val tabTitles = listOf("Tap", "Swipe", "Media", "Text", "Chat")

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
            when (page) {
              0 -> TapScreen()
              1 -> SwipeScreen()
              2 -> VideoListScreen(onNavigateToVideoPlayer = onNavigateToVideoPlayer)
              3 -> InputTextScreen()
              4 -> ChatScreen()
            }
          }
        }
      }
}

@Preview(showBackground = true)
@Composable
fun PreviewDiscoverVideoScreen() {
  MaterialTheme { DiscoverVideoScreen(onNavigateToVideoPlayer = {}) }
}
