package com.zillow.automobile.slides.components

import androidx.annotation.DrawableRes
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import coil3.compose.AsyncImage
import coil3.compose.AsyncImagePainter

/**
 * Screenshot slide component that displays app screenshots with day/night theme support.
 * Automatically selects the appropriate screenshot based on the current theme.
 * Falls back to the available resource if theme-specific version doesn't exist.
 */
@Composable
fun ScreenshotSlideItem(
  @DrawableRes lightScreenshot: Int? = null,
  @DrawableRes darkScreenshot: Int? = null,
  caption: String? = null,
  contentDescription: String? = null,
  modifier: Modifier = Modifier,
  captionColor: Color = MaterialTheme.colorScheme.onSurfaceVariant,
  forceTheme: Boolean? = null // For testing - null uses system theme
) {
  val isDarkTheme = forceTheme ?: isSystemInDarkTheme()

  // Select appropriate screenshot based on theme and availability
  val screenshotRes = when {
    isDarkTheme && darkScreenshot != null -> darkScreenshot
    !isDarkTheme && lightScreenshot != null -> lightScreenshot
    darkScreenshot != null -> darkScreenshot
    lightScreenshot != null -> lightScreenshot
    else -> null
  }

  Column(
    modifier = modifier
      .fillMaxSize()
      .padding(24.dp),
    verticalArrangement = Arrangement.spacedBy(16.dp),
    horizontalAlignment = Alignment.CenterHorizontally
  ) {
    // Screenshot display
    Card(
      modifier = Modifier
        .weight(1f)
        .fillMaxWidth(),
      shape = RoundedCornerShape(16.dp),
      colors = CardDefaults.cardColors(
        containerColor = MaterialTheme.colorScheme.surfaceVariant
      ),
      elevation = CardDefaults.cardElevation(defaultElevation = 8.dp)
    ) {
      Box(
        modifier = Modifier.fillMaxSize(),
        contentAlignment = Alignment.Center
      ) {
        if (screenshotRes != null) {
          AsyncImage(
            model = screenshotRes,
            contentDescription = contentDescription ?: caption,
            modifier = Modifier
              .fillMaxSize()
              .clip(RoundedCornerShape(16.dp)),
            contentScale = ContentScale.Fit,
            onState = { state ->
              when (state) {
                is AsyncImagePainter.State.Loading -> {
                  // Loading indicator will be shown by the Box below
                }
                is AsyncImagePainter.State.Error -> {
                  // Error state handled by placeholder in Box below
                }
                is AsyncImagePainter.State.Success -> {
                  // Screenshot loaded successfully
                }
                else -> {
                  // Other states
                }
              }
            }
          )

          // Loading indicator overlay - only show during loading
          // Note: This will be automatically hidden when image loads
          CircularProgressIndicator(
            modifier = Modifier.size(48.dp),
            color = MaterialTheme.colorScheme.primary
          )
        } else {
          // No screenshot available
          ScreenshotErrorState()
        }
      }
    }

    // Caption
    caption?.let {
      Text(
        text = it,
        style = MaterialTheme.typography.headlineSmall.copy(
          textAlign = TextAlign.Center,
          color = captionColor,
          fontWeight = FontWeight.Medium
        ),
        modifier = Modifier.padding(horizontal = 16.dp)
      )
    }
  }
}

/**
 * Error state component for when no screenshot is available.
 */
@Composable
private fun ScreenshotErrorState(
  modifier: Modifier = Modifier
) {
  Column(
    modifier = modifier,
    horizontalAlignment = Alignment.CenterHorizontally,
    verticalArrangement = Arrangement.Center
  ) {
    Text(
      text = "📱",
      style = MaterialTheme.typography.displayMedium,
      modifier = Modifier.padding(bottom = 8.dp)
    )
    Text(
      text = "No screenshot available",
      style = MaterialTheme.typography.bodyLarge,
      color = MaterialTheme.colorScheme.onSurfaceVariant,
      textAlign = TextAlign.Center
    )
  }
}

@Preview(showBackground = true, name = "Light Theme")
@Composable
fun ScreenshotSlideItemLightPreview() {
  MaterialTheme {
    ScreenshotSlideItem(
      lightScreenshot = android.R.drawable.ic_menu_gallery,
      darkScreenshot = android.R.drawable.ic_menu_camera,
      caption = "App Screenshot - Light Mode",
      contentDescription = "Screenshot showing the app in light mode",
      forceTheme = false
    )
  }
}

@Preview(showBackground = true, name = "Dark Theme")
@Composable
fun ScreenshotSlideItemDarkPreview() {
  MaterialTheme {
    ScreenshotSlideItem(
      lightScreenshot = android.R.drawable.ic_menu_gallery,
      darkScreenshot = android.R.drawable.ic_menu_camera,
      caption = "App Screenshot - Dark Mode",
      contentDescription = "Screenshot showing the app in dark mode",
      forceTheme = true
    )
  }
}

@Preview(showBackground = true, name = "Light Only")
@Composable
fun ScreenshotSlideItemLightOnlyPreview() {
  MaterialTheme {
    ScreenshotSlideItem(
      lightScreenshot = android.R.drawable.ic_menu_gallery,
      caption = "App Screenshot - Light Only Available",
      contentDescription = "Screenshot available only in light mode"
    )
  }
}

@Preview(showBackground = true, name = "No Screenshots")
@Composable
fun ScreenshotSlideItemNoScreenshotsPreview() {
  MaterialTheme {
    ScreenshotSlideItem(
      caption = "Missing Screenshot",
      contentDescription = "No screenshots available"
    )
  }
}
