package com.zillow.automobile.slides

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.displayCutout
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.systemBars
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.DarkMode
import androidx.compose.material.icons.filled.LightMode
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.MutableState
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import com.zillow.automobile.design.system.theme.AutoMobileTheme
import com.zillow.automobile.slides.components.BulletPointSlideItem
import com.zillow.automobile.slides.components.CodeSampleSlideItem
import com.zillow.automobile.slides.components.EmojiSlideItem
import com.zillow.automobile.slides.components.LargeTextSlideItem
import com.zillow.automobile.slides.components.MermaidDiagramSlideItem
import com.zillow.automobile.slides.components.ScreenshotSlideItem
import com.zillow.automobile.slides.components.VideoPlayerSlideItem
import com.zillow.automobile.slides.components.VisualizationSlideItem
import com.zillow.automobile.slides.data.getAllSlides
import com.zillow.automobile.slides.model.SlideContent
import kotlinx.coroutines.launch

/**
 * Main slides screen with horizontal paging for conference presentations. Supports deep linking to
 * specific slide indices and navigation controls. Uses AutoMobile design system theme for
 * consistent colors across day/night modes.
 */
@Composable
fun SlidesScreen(
    slides: List<SlideContent> = getAllSlides(),
    initialSlideIndex: Int = 0,
    modifier: Modifier = Modifier,
    onNavigateBack: (() -> Unit)? = null
) {
  val context = LocalContext.current
  val configuration = LocalConfiguration.current
  val themeManager = remember(context) { SlidesThemeManager(context) }
  val isDarkMode = themeManager.isDarkMode
  val coroutineScope = rememberCoroutineScope()

  // Enable immersive mode
  DisposableEffect(Unit) {
    val activity = context as? androidx.activity.ComponentActivity
    activity?.let {
      val window = it.window
      val insetsController = WindowCompat.getInsetsController(window, window.decorView)

      // Hide system bars
      insetsController.hide(WindowInsetsCompat.Type.systemBars())
      insetsController.systemBarsBehavior =
          WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE

      // Make content appear behind system bars
      WindowCompat.setDecorFitsSystemWindows(window, false)
    }

    onDispose {
      // Restore normal mode when leaving
      activity?.let {
        val window = it.window
        val insetsController = WindowCompat.getInsetsController(window, window.decorView)
        insetsController.show(WindowInsetsCompat.Type.systemBars())
        WindowCompat.setDecorFitsSystemWindows(window, true)
      }
    }
  }

  // Remember PagerState with saveable current page
  val savedPage: MutableState<Int> = rememberSaveable { mutableIntStateOf(initialSlideIndex) }

  val pagerState =
      rememberPagerState(
          initialPage = savedPage.value.coerceIn(0, slides.size - 1), pageCount = { slides.size })

  // Update saved page when current page changes
  LaunchedEffect(pagerState.currentPage) { savedPage.value = pagerState.currentPage }

  // Restore to saved position if needed (e.g., after configuration change)
  LaunchedEffect(Unit) {
    if (pagerState.currentPage != savedPage.value && savedPage.value in 0 until slides.size) {
      pagerState.scrollToPage(savedPage.value)
    }
  }

  AutoMobileTheme(darkTheme = isDarkMode) {
    Column(modifier = modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)) {
      // Slide content with floating day/night button and tap navigation
      Box(modifier = Modifier.weight(1f)) {
        HorizontalPager(
            state = pagerState, userScrollEnabled = false, modifier = Modifier.fillMaxSize()) { page
              ->
              SlideItem(
                  slideContent = slides[page],
                  isDarkMode = isDarkMode,
                  modifier =
                      Modifier.fillMaxSize()
                          .background(MaterialTheme.colorScheme.background)
                          .windowInsetsPadding(WindowInsets.displayCutout))
            }

        // Left tap area for previous slide
        Box(
            modifier =
                Modifier.width((configuration.screenWidthDp * 0.3f).dp)
                    .fillMaxHeight()
                    .align(Alignment.CenterStart)
                    .clickable(
                        interactionSource = remember { MutableInteractionSource() },
                        indication = null) {
                          if (pagerState.currentPage > 0) {
                            coroutineScope.launch {
                              pagerState.scrollToPage(pagerState.currentPage - 1)
                            }
                          }
                        })

        // Right tap area for next slide
        Box(
            modifier =
                Modifier.width((configuration.screenWidthDp * 0.3f).dp)
                    .fillMaxHeight()
                    .align(Alignment.CenterEnd)
                    .clickable(
                        interactionSource = remember { MutableInteractionSource() },
                        indication = null) {
                          if (pagerState.currentPage < slides.size - 1) {
                            coroutineScope.launch {
                              pagerState.scrollToPage(pagerState.currentPage + 1)
                            }
                          }
                        })

        // Day/Night mode toggle - floating in bottom right corner
        IconButton(
            onClick = { themeManager.toggleTheme() },
            modifier =
                Modifier.size(64.dp)
                    .align(Alignment.BottomEnd)
                    .windowInsetsPadding(WindowInsets.systemBars)
                    .padding(16.dp)) {
              Icon(
                  imageVector = if (!isDarkMode) Icons.Filled.LightMode else Icons.Filled.DarkMode,
                  contentDescription = if (!isDarkMode) "Light Mode" else "Dark Mode",
                  modifier = Modifier.size(32.dp),
                  tint = MaterialTheme.colorScheme.onSurface)
            }
      }

      // Progress bar - pinned to bottom with minimal height and no padding
      LinearProgressIndicator(
          progress = (pagerState.currentPage + 1f) / slides.size,
          modifier =
              Modifier.fillMaxWidth()
                  .size(height = 2.dp, width = 0.dp)
                  .windowInsetsPadding(WindowInsets.navigationBars))
    }
  }
}

/** Individual slide item that renders different slide content types. */
@Composable
private fun SlideItem(
    slideContent: SlideContent,
    isDarkMode: Boolean,
    modifier: Modifier = Modifier
) {
  when (slideContent) {
    is SlideContent.LargeText -> {
      LargeTextSlideItem(
          title = slideContent.title, subtitle = slideContent.subtitle, modifier = modifier)
    }

    is SlideContent.BulletPoints -> {
      BulletPointSlideItem(
          title = slideContent.title, points = slideContent.points, modifier = modifier)
    }

    is SlideContent.Emoji -> {
      EmojiSlideItem(
          emoji = slideContent.emoji, caption = slideContent.caption, modifier = modifier)
    }

    is SlideContent.CodeSample -> {
      CodeSampleSlideItem(
          code = slideContent.code,
          language = slideContent.language,
          title = slideContent.title,
          highlight = slideContent.highlight,
          isDarkMode = isDarkMode,
          modifier = modifier)
    }

    is SlideContent.Visualization -> {
      VisualizationSlideItem(
          imageUrl = slideContent.imageUrl,
          caption = slideContent.caption,
          contentDescription = slideContent.contentDescription,
          modifier = modifier)
    }

    is SlideContent.Video -> {
      VideoPlayerSlideItem(
          videoUrl = slideContent.videoUrl,
          caption = slideContent.caption,
          contentDescription = slideContent.contentDescription,
          modifier = modifier)
    }

    is SlideContent.MermaidDiagram -> {
      MermaidDiagramSlideItem(
          mermaidCode = slideContent.code,
          title = slideContent.title,
          isDarkMode = isDarkMode,
          modifier = modifier)
    }

    is SlideContent.Screenshot -> {
      ScreenshotSlideItem(
          lightScreenshot = slideContent.lightScreenshot,
          darkScreenshot = slideContent.darkScreenshot,
          caption = slideContent.caption,
          contentDescription = slideContent.contentDescription,
          modifier = modifier)
    }
  }
}

@Preview(showBackground = true)
@Composable
fun SlidesScreenPreview() {
  AutoMobileTheme {
    SlidesScreen(slides = listOf(SlideContent.LargeText("Slide Title")), initialSlideIndex = 0)
  }
}
