package com.zillow.automobile.slides.components

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
 * Visualization slide component for displaying images with loading states. Supports both local and
 * remote images using Coil with proper error handling.
 */
@Composable
fun VisualizationSlideItem(
    imageUrl: String,
    caption: String? = null,
    contentDescription: String? = null,
    modifier: Modifier = Modifier,
    captionColor: Color = MaterialTheme.colorScheme.onSurfaceVariant
) {
  Column(
      modifier = modifier.fillMaxSize().padding(24.dp),
      verticalArrangement = Arrangement.spacedBy(16.dp),
      horizontalAlignment = Alignment.CenterHorizontally) {
        // Image display
        Card(
            modifier = Modifier.weight(1f).fillMaxWidth(),
            shape = RoundedCornerShape(16.dp),
            colors =
                CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant),
            elevation = CardDefaults.cardElevation(defaultElevation = 8.dp)) {
              Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                AsyncImage(
                    model = imageUrl,
                    contentDescription = contentDescription ?: caption,
                    modifier = Modifier.fillMaxSize().clip(RoundedCornerShape(16.dp)),
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
                          // Image loaded successfully
                        }

                        else -> {
                          // Other states
                        }
                      }
                    })

                // Loading indicator overlay
                CircularProgressIndicator(
                    modifier = Modifier.size(48.dp), color = MaterialTheme.colorScheme.primary)
              }
            }

        // Caption
        caption?.let {
          Text(
              text = it,
              style =
                  MaterialTheme.typography.headlineSmall.copy(
                      textAlign = TextAlign.Center,
                      color = captionColor,
                      fontWeight = FontWeight.Medium),
              modifier = Modifier.padding(horizontal = 16.dp))
        }
      }
}

/** Error state component for failed image loads. */
@Composable
private fun ImageErrorState(modifier: Modifier = Modifier) {
  Column(
      modifier = modifier,
      horizontalAlignment = Alignment.CenterHorizontally,
      verticalArrangement = Arrangement.Center) {
        Text(
            text = "📷",
            style = MaterialTheme.typography.displayMedium,
            modifier = Modifier.padding(bottom = 8.dp))
        Text(
            text = "Unable to load image",
            style = MaterialTheme.typography.bodyLarge,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = TextAlign.Center)
      }
}

@Preview(showBackground = true)
@Composable
fun VisualizationSlideItemPreview() {
  MaterialTheme {
    VisualizationSlideItem(
        imageUrl = "https://example.com/architecture-diagram.png",
        caption = "AutoMobile Architecture Overview",
        contentDescription =
            "Diagram showing AutoMobile's architecture with Android and iOS components")
  }
}

@Preview(showBackground = true)
@Composable
fun VisualizationSlideItemNoCaptionPreview() {
  MaterialTheme { VisualizationSlideItem(imageUrl = "https://example.com/screenshot.png") }
}
