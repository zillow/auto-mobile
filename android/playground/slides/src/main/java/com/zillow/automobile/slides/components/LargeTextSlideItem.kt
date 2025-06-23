package com.zillow.automobile.slides.components

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.wrapContentSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

/**
 * Large text slide component that auto-resizes text to fit the available space. Optimizes font size
 * to make the most of the screen real estate.
 */
@Composable
fun LargeTextSlideItem(
    title: String,
    subtitle: String? = null,
    modifier: Modifier = Modifier,
    titleColor: Color = MaterialTheme.colorScheme.onBackground,
    subtitleColor: Color = MaterialTheme.colorScheme.onSurfaceVariant
) {
  val configuration = LocalConfiguration.current
  val isLandscape =
      configuration.orientation == android.content.res.Configuration.ORIENTATION_LANDSCAPE

  Column(
      modifier = modifier.fillMaxSize().padding(32.dp),
      horizontalAlignment = Alignment.CenterHorizontally,
      verticalArrangement = Arrangement.Center) {
        // Auto-resizing title
        AutoResizingText(
            text = title,
            style =
                MaterialTheme.typography.displayLarge.copy(
                    fontWeight = FontWeight.Bold, textAlign = TextAlign.Center, color = titleColor),
            modifier = Modifier.weight(if (subtitle != null) 0.5f else 0.5f),
            isLandscape = isLandscape,
            hasSubtitle = subtitle != null)

        // Optional subtitle
        subtitle?.let {
          AutoResizingText(
              text = it,
              style =
                  MaterialTheme.typography.headlineMedium.copy(
                      textAlign = TextAlign.Center,
                      color = subtitleColor,
                      fontWeight = FontWeight.Normal),
              maxFontSize = 48f,
              minFontSize = 12f,
              modifier = Modifier.weight(0.3f).padding(top = 16.dp),
              isLandscape = isLandscape,
              hasSubtitle = false)
        }
      }
}

/**
 * Text component that automatically adjusts font size to fit content within constraints. Uses
 * iterative approach to find optimal font size, with special handling for single-word overflow.
 */
@Composable
private fun AutoResizingText(
    text: String,
    style: TextStyle,
    modifier: Modifier = Modifier,
    maxFontSize: Float = 96f,
    minFontSize: Float = 12f,
    isLandscape: Boolean,
    hasSubtitle: Boolean
) {
  val maxLines =
      when {
        isLandscape && hasSubtitle -> 2
        isLandscape && !hasSubtitle -> 3
        hasSubtitle -> 3
        else -> 5 // portrait no other text
      }

  val initialFontSize = if (isLandscape) maxFontSize else 48f
  var fontSizeValue by remember { mutableStateOf(initialFontSize) }
  var readyToDraw by remember { mutableStateOf(false) }

  Text(
      text = text,
      style = style.copy(fontSize = fontSizeValue.sp, lineHeight = fontSizeValue.sp * 1.2f),
      maxLines = maxLines,
      modifier =
          modifier.wrapContentSize(Alignment.Center).drawWithContent {
            if (readyToDraw) {
              drawContent()
            }
          },
      onTextLayout = { textLayoutResult ->
        val exceedsMaxWidth = textLayoutResult.didOverflowWidth
        val exceedsMaxHeight = textLayoutResult.didOverflowHeight
        val hasOverflow = exceedsMaxWidth || exceedsMaxHeight

        if (hasOverflow && fontSizeValue > minFontSize) {
          // Use larger decrement for severe overflow (single word cases)
          val decrementAmount =
              if (exceedsMaxWidth && textLayoutResult.lineCount == 1) {
                // Single line overflow - likely a single word that's too long
                // Use more aggressive scaling
                (fontSizeValue * 0.1f).coerceAtLeast(4f)
              } else {
                // Regular overflow - use smaller decrement
                2f
              }

          fontSizeValue = (fontSizeValue - decrementAmount).coerceAtLeast(minFontSize)
          readyToDraw = false
        } else {
          readyToDraw = true
        }
      })
}

@Preview(showBackground = true)
@Composable
fun LargeTextSlideItemPreview() {
  MaterialTheme {
    LargeTextSlideItem(
        title = "Welcome to AutoMobile", subtitle = "The Future of Android UI Testing")
  }
}

@Preview(showBackground = true)
@Composable
fun LargeResizingTextSlideItemTitleOnlyPreview() {
  MaterialTheme { LargeTextSlideItem(title = "AutoMobile") }
}

@Preview(showBackground = true, device = "spec:width=800dp,height=480dp,dpi=240")
@Composable
fun LargeResizingTextSlideItemLandscapePreview() {
  MaterialTheme { LargeTextSlideItem(title = "Welcome to AutoMobile") }
}

@Preview(showBackground = true, device = "spec:width=800dp,height=480dp,dpi=240")
@Composable
fun LargeResizingTextSlideItemTitleOnlyLandscapePreview() {
  MaterialTheme { LargeTextSlideItem(title = "AutoMobile") }
}
