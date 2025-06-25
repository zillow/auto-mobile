package com.zillow.automobile.mediaplayer

import android.content.Context
import android.content.res.Configuration
import android.net.Uri
import android.util.Log
import android.view.View
import androidx.activity.compose.LocalActivity
import androidx.annotation.RawRes
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.net.toUri
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.media3.common.MediaItem
import androidx.media3.common.util.UnstableApi
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.ui.PlayerView
import coil3.compose.AsyncImage

sealed class VideoResource {
  data class UriVideo(val uri: Uri) : VideoResource()

  data class RawVideo(
      @RawRes val portraitResourceId: Int,
      @RawRes val landscapeResourceId: Int? = null
  ) : VideoResource()

  data object PlaceholderVideo : VideoResource()
}

fun VideoResource.toMediaItem(context: Context? = null): MediaItem? {
  return when (this) {
    is VideoResource.UriVideo -> {
      Log.d("VideoResource", "Creating MediaItem from URI: $uri")
      MediaItem.fromUri(uri)
    }

    is VideoResource.RawVideo -> {
      // Check if context is in landscape mode and landscapeResourceId is available
      val resourceId =
          if (context != null && landscapeResourceId != null) {
            val configuration = context.resources.configuration
            if (configuration.orientation == Configuration.ORIENTATION_LANDSCAPE) {
              landscapeResourceId
            } else {
              portraitResourceId
            }
          } else {
            portraitResourceId
          }

      // Use the correct format for raw resources in Android
      val packageName = context?.packageName ?: "com.zillow.automobile.mediaplayer"
      val uri = "android.resource://$packageName/$resourceId".toUri()
      Log.d(
          "VideoResource",
          "Creating MediaItem from raw resource: $resourceId (landscape: $landscapeResourceId, portrait: $portraitResourceId), URI: $uri, package: $packageName")
      MediaItem.fromUri(uri)
    }

    is VideoResource.PlaceholderVideo -> {
      Log.d("VideoResource", "Placeholder video - returning null MediaItem")
      null
    }
  }
}

@Composable
fun VideoPlayerScreen(
    videoId: String,
    onNavigateBack: () -> Unit,
    viewModel: MediaPlayerViewModel = viewModel()
) {
  val context = LocalContext.current
  val activity = LocalActivity.current
  val player by viewModel.playerState.collectAsState()
  val playbackError by viewModel.playbackError.collectAsState()
  val shouldShowControls by viewModel.shouldShowControls.collectAsState()

  // Sample video data based on videoId
  // TODO: probably shouldn't assume video data id matches data
  val videoData = VideoData.entries.first { it.id == videoId }

  // Enable immersive mode
  LaunchedEffect(Unit) {
    activity?.let { act ->
      WindowCompat.setDecorFitsSystemWindows(act.window, false)
      val windowInsetsController =
          WindowCompat.getInsetsController(act.window, act.window.decorView)
      windowInsetsController.apply {
        hide(WindowInsetsCompat.Type.systemBars())
        systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
      }
    }
  }

  // Initialize player when video URL is provided
  LaunchedEffect(videoData.videoResource) {
    if (videoData.videoResource !is VideoResource.PlaceholderVideo) {
      viewModel.initializePlayer(context, videoData.videoResource)
    }
  }

  // Cleanup player and restore system UI on disposal
  DisposableEffect(Unit) {
    onDispose {
      viewModel.savePlayerState()
      viewModel.releasePlayer()
      // Restore system bars when leaving video player
      activity?.let { act ->
        WindowCompat.setDecorFitsSystemWindows(act.window, true)
        val windowInsetsController =
            WindowCompat.getInsetsController(act.window, act.window.decorView)
        windowInsetsController.show(WindowInsetsCompat.Type.systemBars())
      }
    }
  }

  Box(modifier = Modifier.fillMaxSize().background(Color.Black)) {
    // Video content or thumbnail
    if (playbackError == null && videoData.videoResource !is VideoResource.PlaceholderVideo) {
      ExoPlayerView(
          player = player,
          showControls = shouldShowControls,
          onControlsVisibilityChanged = { show ->
            if (show) viewModel.showControls() else viewModel.hideControls()
          },
          modifier = Modifier.fillMaxSize())
    } else if (playbackError == null) {
      // Show thumbnail for videos without URLs
      AsyncImage(
          model = videoData.thumbnailUrl,
          contentDescription = videoData.title,
          modifier = Modifier.fillMaxSize(),
          contentScale = ContentScale.Crop)
    } else {
      // Show error if playback failed
      playbackError?.let { error ->
        Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
          ErrorMessage(
              error = error,
              onRetry = {
                viewModel.clearError()
                viewModel.initializePlayer(context, videoData.videoResource)
              })
        }
      }
    }

    // Top bar with back button and title - Show only when controls are visible
    if (shouldShowControls) {
      Row(
          modifier =
              Modifier.fillMaxWidth()
                  .padding(16.dp)
                  .padding(top = 24.dp), // Additional top padding for status bar area
          verticalAlignment = Alignment.CenterVertically) {
            IconButton(
                onClick = onNavigateBack,
                modifier = Modifier.clip(CircleShape).background(Color.Black.copy(alpha = 0.5f))) {
                  Icon(
                      imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                      contentDescription = "Back",
                      tint = Color.White)
                }

            Spacer(modifier = Modifier.width(16.dp))

            Text(
                text = videoData.title,
                color = Color.White,
                fontSize = 18.sp,
                fontWeight = FontWeight.Bold)
          }
    }
  }
}

/** ExoPlayer view integrated with Compose using AndroidView. */
@UnstableApi
@Composable
fun ExoPlayerView(
    player: ExoPlayer?,
    showControls: Boolean,
    onControlsVisibilityChanged: (Boolean) -> Unit,
    modifier: Modifier = Modifier
) {
  AndroidView(
      modifier = modifier,
      factory = { context ->
        PlayerView(context).apply {
          this.player = player
          useController = true // Use ExoPlayer's built-in controls
          controllerHideOnTouch = true
          controllerShowTimeoutMs = 2000
          setControllerVisibilityListener(
              PlayerView.ControllerVisibilityListener { visibility ->
                onControlsVisibilityChanged(visibility == View.VISIBLE)
              })
        }
      },
      update = { playerView ->
        playerView.player = player
        if (showControls) {
          //        playerView.showController()
        } else {
          playerView.hideController()
        }
      })
}

/** Error message component with retry functionality. */
@UnstableApi
@Composable
fun ErrorMessage(error: String, onRetry: () -> Unit, modifier: Modifier = Modifier) {
  Card(
      modifier = modifier,
      colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.errorContainer)) {
        Column(
            modifier = Modifier.padding(16.dp),
            horizontalAlignment = Alignment.CenterHorizontally) {
              Icon(
                  imageVector = Icons.Filled.Warning,
                  contentDescription = "Error",
                  modifier = Modifier.size(24.dp))

              Text(
                  text = error,
                  fontSize = 14.sp,
                  color = MaterialTheme.colorScheme.onErrorContainer,
                  textAlign = TextAlign.Center,
                  modifier = Modifier.padding(vertical = 8.dp))

              Button(
                  onClick = onRetry,
                  colors =
                      ButtonDefaults.buttonColors(
                          containerColor = MaterialTheme.colorScheme.error)) {
                    Text(text = "Retry", color = MaterialTheme.colorScheme.onError)
                  }
            }
      }
}

@UnstableApi
enum class VideoData(
    val id: String,
    val title: String,
    val description: String,
    val thumbnailUrl: String,
    val videoResource: VideoResource,
    val duration: String
) {
  AUTO_MOBILE(
      "auto-mobile",
      "AutoMobile Promo",
      "Sample video for testing AutoMobile media player",
      "https://picsum.photos/800/450?random=1",
      // Use a publicly available MP4 for better codec compatibility
      VideoResource.RawVideo(R.raw.automobile_portrait, R.raw.automobile_landscape),
      "00:32")
}

private fun formatTime(timeMs: Long): String {
  val seconds = (timeMs / 1000).toInt()
  val minutes = seconds / 60
  val remainingSeconds = seconds % 60
  return "%02d:%02d".format(minutes, remainingSeconds)
}

private fun parseDuration(duration: String): Float {
  val parts = duration.split(":").map { it.toIntOrNull() ?: 0 }
  return if (parts.size == 2) {
    parts[0] * 60f + parts[1]
  } else {
    0f
  }
}
