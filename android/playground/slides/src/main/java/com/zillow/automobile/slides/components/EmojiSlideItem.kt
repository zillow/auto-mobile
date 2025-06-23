package com.zillow.automobile.slides.components

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.zillow.automobile.slides.model.PresentationEmoji

/**
 * Emoji slide component that displays a large emoji with optional caption.
 * Uses the LargeTextSlideItem for consistent auto-resizing behavior.
 */
@Composable
fun EmojiSlideItem(
  emoji: PresentationEmoji,
  caption: String? = null,
  modifier: Modifier = Modifier,
  captionColor: Color = MaterialTheme.colorScheme.onSurfaceVariant
) {
  Column(
    modifier = modifier
      .fillMaxSize()
      .padding(24.dp),
    horizontalAlignment = Alignment.CenterHorizontally,
    verticalArrangement = Arrangement.Center
  ) {
    // Large emoji display - reduced size to account for window insets
    Text(
      text = emoji.unicode,
      fontSize = if (caption != null) 100.sp else 140.sp,
      modifier = Modifier.padding(bottom = if (caption != null) 24.dp else 0.dp)
    )

    // Optional caption with better spacing
    caption?.let {
      Text(
        text = it,
        style = MaterialTheme.typography.headlineMedium.copy(
          textAlign = TextAlign.Center,
          color = captionColor,
          fontWeight = FontWeight.Medium,
          lineHeight = 30.sp
        ),
        modifier = Modifier.padding(horizontal = 16.dp)
      )
    }
  }
}

@Preview(showBackground = true)
@Composable
fun EmojiSlideItemPreview() {
  MaterialTheme {
    EmojiSlideItem(
      emoji = PresentationEmoji.ROCKET,
      caption = "AutoMobile is Lightning Fast!"
    )
  }
}

@Preview(showBackground = true)
@Composable
fun EmojiSlideItemNoCaption() {
  MaterialTheme {
    EmojiSlideItem(
      emoji = PresentationEmoji.THINKING
    )
  }
}

@Preview(showBackground = true)
@Composable
fun EmojiSlideItemConstruction() {
  MaterialTheme {
    EmojiSlideItem(
      emoji = PresentationEmoji.CONSTRUCTION,
      caption = "Work in Progress"
    )
  }
}
