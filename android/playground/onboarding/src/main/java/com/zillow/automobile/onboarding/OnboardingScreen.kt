package com.zillow.automobile.onboarding

import androidx.annotation.DrawableRes
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
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.zillow.automobile.design.system.components.AutoMobileLogo
import kotlinx.coroutines.launch

sealed class OnboardingPage {
  data class Emoji(val title: String, val description: String, val emoji: String) :
      OnboardingPage()

  data class Drawable(
      val title: String,
      val description: String,
      @DrawableRes val drawableResId: Int
  ) : OnboardingPage()
}

/** Main onboarding screen with pager and navigation controls. */
@Composable
fun OnboardingScreen(onFinish: () -> Unit) {
  val pages: List<OnboardingPage> =
      listOf(
          OnboardingPage.Drawable(
              title = stringResource(id = R.string.onboarding_welcome_title),
              description = stringResource(id = R.string.onboarding_welcome_description),
              drawableResId = com.zillow.automobile.design.assets.R.drawable.automobile_logo),
          OnboardingPage.Emoji(
              title = stringResource(id = R.string.onboarding_source_intelligence_title),
              description =
                  stringResource(id = R.string.onboarding_source_intelligence_description),
              emoji = stringResource(id = R.string.onboarding_source_intelligence_emoji)),
          OnboardingPage.Emoji(
              title = stringResource(id = R.string.onboarding_gestures_title),
              description = stringResource(id = R.string.onboarding_gestures_description),
              emoji = stringResource(id = R.string.onboarding_gestures_emoji)),
          OnboardingPage.Emoji(
              title = stringResource(id = R.string.onboarding_automation_title),
              description = stringResource(id = R.string.onboarding_automation_description),
              emoji = stringResource(id = R.string.onboarding_automation_emoji)),
          OnboardingPage.Emoji(
              title = stringResource(id = R.string.onboarding_opensource_title),
              description = stringResource(id = R.string.onboarding_opensource_description),
              emoji = stringResource(id = R.string.onboarding_opensource_emoji)))

  val pagerState = rememberPagerState(pageCount = { pages.size })
  val coroutineScope = rememberCoroutineScope()

  Column(
    modifier = Modifier
      .fillMaxSize()
      .background(MaterialTheme.colorScheme.background)
      .safeDrawingPadding()
  ) {
    // Skip button
    Row(
        modifier = Modifier
          .fillMaxWidth()
          .padding(16.dp),
        horizontalArrangement = Arrangement.End) {
          if (pagerState.currentPage < pages.size - 1) {
            TextButton(onClick = onFinish) { Text(stringResource(id = R.string.onboarding_skip)) }
          }
        }

    // Pager content
    HorizontalPager(state = pagerState, modifier = Modifier.weight(1f)) { page ->
      OnboardingPageContent(page = pages[page], modifier = Modifier.fillMaxSize())
    }

    // Bottom navigation
    Column(modifier = Modifier.padding(24.dp), horizontalAlignment = Alignment.CenterHorizontally) {
      // Page indicators
      PageIndicators(
          pageCount = pages.size,
          currentPage = pagerState.currentPage,
          modifier = Modifier.padding(bottom = 24.dp))

      // Navigation buttons
      Row(
          modifier = Modifier.fillMaxWidth(),
          horizontalArrangement = Arrangement.SpaceBetween,
          verticalAlignment = Alignment.CenterVertically) {
            // Back button
            if (pagerState.currentPage > 0) {
              OutlinedButton(
                  onClick = {
                    coroutineScope.launch {
                      pagerState.animateScrollToPage(pagerState.currentPage - 1)
                    }
                  }) {
                    Text(stringResource(id = R.string.onboarding_back))
                  }
            } else {
              Spacer(modifier = Modifier.width(80.dp))
            }

            // Next/Finish button
            Button(
                onClick = {
                  if (pagerState.currentPage < pages.size - 1) {
                    coroutineScope.launch {
                      pagerState.animateScrollToPage(pagerState.currentPage + 1)
                    }
                  } else {
                    onFinish()
                  }
                },
                modifier = Modifier.widthIn(min = 100.dp)) {
                  Text(
                      text =
                          if (pagerState.currentPage < pages.size - 1)
                              stringResource(id = R.string.onboarding_next)
                          else stringResource(id = R.string.onboarding_get_started))
                }
          }
    }
  }
}

/** Individual onboarding page content. */
@Composable
fun OnboardingPageContent(page: OnboardingPage, modifier: Modifier = Modifier) {
  when (page) {
    is OnboardingPage.Drawable -> DrawablePageContent(page, modifier)
    is OnboardingPage.Emoji -> EmojiPageContent(page, modifier)
  }
}

/** Individual onboarding page content. */
@Composable
fun DrawablePageContent(page: OnboardingPage.Drawable, modifier: Modifier = Modifier) {
  val uriHandler = LocalUriHandler.current
  val context = LocalContext.current

  Column(
      modifier = modifier.padding(horizontal = 32.dp),
      horizontalAlignment = Alignment.CenterHorizontally,
      verticalArrangement = Arrangement.Center) {
        // Logo/Icon
        AutoMobileLogo()

        // Title
        Text(
            text = page.title,
            fontSize = 28.sp,
            fontWeight = FontWeight.Bold,
            textAlign = TextAlign.Center,
            color = MaterialTheme.colorScheme.onBackground,
            modifier = Modifier.padding(bottom = 16.dp))

        // Description
        if (page.title == stringResource(id = R.string.onboarding_opensource_title)) {
          val githubUrl = stringResource(id = R.string.github_url)
          val annotatedString = buildAnnotatedString {
            append(stringResource(id = R.string.onboarding_opensource_description_part1))
            withStyle(
                style =
                    SpanStyle(
                        color = MaterialTheme.colorScheme.primary,
                        textDecoration = TextDecoration.Underline)) {
                  pushStringAnnotation("url", githubUrl)
                  append(stringResource(id = R.string.onboarding_opensource_description_part2))
                  pop()
                }
          }

          Text(
              text = annotatedString,
              fontSize = 16.sp,
              textAlign = TextAlign.Center,
              color = MaterialTheme.colorScheme.onSurfaceVariant,
              lineHeight = 24.sp,
              modifier = Modifier.clickable { uriHandler.openUri(githubUrl) })
        } else {
          Text(
              text = page.description,
              fontSize = 16.sp,
              textAlign = TextAlign.Center,
              color = MaterialTheme.colorScheme.onSurfaceVariant,
              lineHeight = 24.sp)
        }
      }
}

@Composable
fun EmojiPageContent(page: OnboardingPage.Emoji, modifier: Modifier = Modifier) {
  val uriHandler = LocalUriHandler.current
  val context = LocalContext.current

  Column(
      modifier = modifier.padding(horizontal = 32.dp),
      horizontalAlignment = Alignment.CenterHorizontally,
      verticalArrangement = Arrangement.Center) {
        // Emoji/Icon
        Text(text = page.emoji, fontSize = 80.sp, modifier = Modifier.padding(bottom = 32.dp))

        // Title
        Text(
            text = page.title,
            fontSize = 28.sp,
            fontWeight = FontWeight.Bold,
            textAlign = TextAlign.Center,
            color = MaterialTheme.colorScheme.onBackground,
            modifier = Modifier.padding(bottom = 16.dp))

        // Description
        if (page.title == stringResource(id = R.string.onboarding_opensource_title)) {
          val githubUrl = stringResource(id = R.string.github_url)
          val annotatedString = buildAnnotatedString {
            append(stringResource(id = R.string.onboarding_opensource_description_part1))
            append(" ")
            withStyle(
                style =
                    SpanStyle(
                        color = MaterialTheme.colorScheme.primary,
                        textDecoration = TextDecoration.Underline)) {
                  pushStringAnnotation("url", githubUrl)
                  append(stringResource(id = R.string.onboarding_opensource_description_part2))
                  pop()
                }
          }

          Text(
              text = annotatedString,
              fontSize = 16.sp,
              textAlign = TextAlign.Center,
              color = MaterialTheme.colorScheme.onSurfaceVariant,
              lineHeight = 24.sp,
              modifier = Modifier.clickable { uriHandler.openUri(githubUrl) })
        } else {
          Text(
              text = page.description,
              fontSize = 16.sp,
              textAlign = TextAlign.Center,
              color = MaterialTheme.colorScheme.onSurfaceVariant,
              lineHeight = 24.sp)
        }
      }
}

@Composable
fun PageIndicators(pageCount: Int, currentPage: Int, modifier: Modifier = Modifier) {
  Row(modifier = modifier, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
    repeat(pageCount) { index ->
      Box(
          modifier =
              Modifier
                .size(width = if (index == currentPage) 24.dp else 8.dp, height = 8.dp)
                .clip(RoundedCornerShape(4.dp))
                .background(
                  if (index == currentPage) {
                    MaterialTheme.colorScheme.primary
                  } else {
                    MaterialTheme.colorScheme.outline.copy(alpha = 0.3f)
                  }
                ))
    }
  }
}

/** Preview for the onboarding screen. */
@Preview(showBackground = true)
@Composable
fun OnboardingScreenPreview() {
  MaterialTheme { OnboardingScreen(onFinish = {}) }
}
