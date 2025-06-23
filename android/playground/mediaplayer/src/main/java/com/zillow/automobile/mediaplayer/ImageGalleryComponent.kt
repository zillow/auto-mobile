package com.zillow.automobile.mediaplayer

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil3.compose.AsyncImage
import coil3.compose.AsyncImagePainter
import coil3.compose.rememberAsyncImagePainter

/**
 * Image gallery component using Coil for efficient image loading. Displays multiple images in a
 * scrollable list with loading states.
 */
@Composable
fun ImageGalleryComponent(imageUrls: List<String>, modifier: Modifier = Modifier) {
  Card(
      modifier = modifier,
      elevation = CardDefaults.cardElevation(defaultElevation = 4.dp),
      colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)) {
        Column(modifier = Modifier.fillMaxWidth().padding(16.dp)) {
          Text(
              text = "🖼️ Image Gallery",
              fontSize = 20.sp,
              fontWeight = FontWeight.Bold,
              color = MaterialTheme.colorScheme.onSurface,
              modifier = Modifier.padding(bottom = 16.dp))

          Text(
              text = "Images loaded with Coil - efficient caching and lazy loading",
              fontSize = 14.sp,
              color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.7f),
              modifier = Modifier.padding(bottom = 16.dp))

          LazyColumn(
              verticalArrangement = Arrangement.spacedBy(12.dp),
              contentPadding = PaddingValues(vertical = 8.dp)) {
                items(imageUrls.withIndex().toList()) { (index, imageUrl) ->
                  ImageCard(
                      imageUrl = imageUrl,
                      title = "Image ${index + 1}",
                      modifier = Modifier.fillMaxWidth())
                }
              }
        }
      }
}

/** Individual image card with loading, error, and success states. */
@Composable
fun ImageCard(imageUrl: String, title: String, modifier: Modifier = Modifier) {
  Card(
      modifier = modifier,
      elevation = CardDefaults.cardElevation(defaultElevation = 2.dp),
      colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant)) {
        Column {
          Box(
              modifier =
                  Modifier.fillMaxWidth()
                      .aspectRatio(16f / 9f)
                      .clip(RoundedCornerShape(topStart = 12.dp, topEnd = 12.dp))) {
                AsyncImageWithStates(
                    imageUrl = imageUrl,
                    contentDescription = title,
                    modifier = Modifier.fillMaxSize())
              }

          Text(
              text = title,
              fontSize = 16.sp,
              fontWeight = FontWeight.Medium,
              color = MaterialTheme.colorScheme.onSurfaceVariant,
              modifier = Modifier.padding(12.dp))
        }
      }
}

/**
 * AsyncImage with custom loading, error, and success states. Demonstrates Coil's state management
 * capabilities.
 */
@Composable
fun AsyncImageWithStates(
    imageUrl: String,
    contentDescription: String?,
    modifier: Modifier = Modifier
) {
  val painter = rememberAsyncImagePainter(model = imageUrl)
  val state by painter.state.collectAsState()

  Box(modifier = modifier, contentAlignment = Alignment.Center) {
    AsyncImage(
        model = imageUrl,
        contentDescription = contentDescription,
        modifier = Modifier.fillMaxSize(),
        contentScale = ContentScale.Crop,
        onLoading = {
          // Loading state handled by the overlay below
        },
        onError = {
          // Error state handled by the overlay below
        },
        onSuccess = {
          // Success state - image is displayed
        })

    // Overlay for loading and error states
    when (state) {
      is AsyncImagePainter.State.Loading -> {
        LoadingOverlay()
      }

      is AsyncImagePainter.State.Error -> {
        ErrorOverlay()
      }

      else -> {
        // Image loaded successfully or empty state
      }
    }
  }
}

/** Loading overlay with circular progress indicator. */
@Composable
fun LoadingOverlay() {
  Box(
      modifier = Modifier.fillMaxSize().clip(RoundedCornerShape(12.dp)),
      contentAlignment = Alignment.Center) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center) {
              CircularProgressIndicator(
                  modifier = Modifier.size(40.dp), color = MaterialTheme.colorScheme.primary)
              Text(
                  text = "Loading...",
                  fontSize = 14.sp,
                  color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.7f),
                  modifier = Modifier.padding(top = 8.dp))
            }
      }
}

/** Error overlay for failed image loads. */
@Composable
fun ErrorOverlay() {
  Box(
      modifier = Modifier.fillMaxSize().clip(RoundedCornerShape(12.dp)),
      contentAlignment = Alignment.Center) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center) {
              Text(text = "❌", fontSize = 32.sp, textAlign = TextAlign.Center)
              Text(
                  text = "Failed to load image",
                  fontSize = 14.sp,
                  color = MaterialTheme.colorScheme.error,
                  textAlign = TextAlign.Center,
                  modifier = Modifier.padding(top = 8.dp))
            }
      }
}

/**
 * Preview for the image gallery component. Note: Android Studio previews don't have internet
 * access, so images may show as failed. The actual app will load these images correctly.
 */
@Preview(showBackground = true)
@Composable
fun ImageGalleryComponentPreview() {
  MaterialTheme {
    ImageGalleryComponent(
        imageUrls =
            listOf(
                "https://randomuser.me/api/portraits/lego/1.jpg",
                "https://randomuser.me/api/portraits/lego/2.jpg",
                "https://randomuser.me/api/portraits/lego/3.jpg",
                "https://randomuser.me/api/portraits/lego/4.jpg"))
  }
}
