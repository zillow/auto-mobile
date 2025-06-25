package com.zillow.automobile.mediaplayer

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.VolumeUp
import androidx.compose.material.icons.filled.Pause
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.VolumeUp
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Slider
import androidx.compose.material3.SliderDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.net.toUri
import com.zillow.automobile.design.system.theme.AutoMobileTheme
import kotlinx.coroutines.delay

/** Main media player screen with image and video components. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MediaPlayerScreen() {

  var selectedMediaType by remember { mutableStateOf(MediaType.IMAGE) }

  Scaffold(
      topBar = {
        TopAppBar(
            title = { Text(text = "Media Player", fontWeight = FontWeight.Bold) },
            colors =
                TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.primaryContainer,
                    titleContentColor = MaterialTheme.colorScheme.onPrimaryContainer))
      }) { paddingValues ->
        LazyColumn(
            modifier = Modifier.fillMaxSize().padding(paddingValues).padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)) {
              // Media type selection cards
              items(MediaType.entries) { mediaType ->
                MediaTypeCard(
                    mediaType = mediaType,
                    isSelected = selectedMediaType == mediaType,
                    onClick = { selectedMediaType = mediaType })
              }

              // Selected media player
              item {
                when (selectedMediaType) {
                  MediaType.IMAGE -> {
                    ImageGalleryComponent(
                        imageUrls = getSampleImageUrls(), modifier = Modifier.fillMaxWidth())
                  }

                  MediaType.VIDEO -> {
                    // VideoPlayerComponent was merged into VideoPlayerScreen
                    Text(
                        text = "Video player functionality moved to VideoPlayerScreen",
                        modifier = Modifier.fillMaxWidth().padding(16.dp),
                        style = MaterialTheme.typography.bodyMedium)
                  }

                  MediaType.AUDIO -> {
                    AudioPlayerComponent(
                        audioResource = VideoResource.UriVideo(getSampleAudioUrl().toUri()),
                        modifier = Modifier.fillMaxWidth())
                  }
                }
              }
            }
      }
}

/** Fullscreen media player with auto-hiding controls. */
@Composable
fun FullscreenMediaPlayer() {
  var isPlaying by remember { mutableStateOf(false) }
  var showControls by remember { mutableStateOf(true) }
  var currentTime by remember { mutableFloatStateOf(0f) }
  var volume by remember { mutableFloatStateOf(0.7f) }

  // Auto-hide controls after 3 seconds
  LaunchedEffect(showControls) {
    if (showControls) {
      delay(3000)
      showControls = false
    }
  }

  // Simulate playback progress
  LaunchedEffect(isPlaying) {
    while (isPlaying && currentTime < 100f) {
      delay(100)
      currentTime += 0.5f
    }
    if (currentTime >= 100f) {
      isPlaying = false
      currentTime = 0f
    }
  }

  Box(
      modifier =
          Modifier.fillMaxSize().background(Color.Black).clickable(
              interactionSource = remember { MutableInteractionSource() }, indication = null) {
                showControls = !showControls
              }) {

        // Media controls overlay
        AnimatedVisibility(
            visible = showControls,
            enter = fadeIn(),
            exit = fadeOut(),
            modifier = Modifier.align(Alignment.BottomCenter)) {
              MediaControlsOverlay(
                  isPlaying = isPlaying,
                  currentTime = currentTime,
                  volume = volume,
                  onPlayPause = {
                    isPlaying = !isPlaying
                    showControls = true
                  },
                  onSeek = { newTime ->
                    currentTime = newTime
                    showControls = true
                  },
                  onVolumeChange = { newVolume ->
                    volume = newVolume
                    showControls = true
                  })
            }

        // Progress indicator when playing
        if (isPlaying) {
          LinearProgressIndicator(
              progress = { currentTime / 100f },
              modifier = Modifier.fillMaxWidth().align(Alignment.TopCenter),
              color = MaterialTheme.colorScheme.primary,
              trackColor = Color.Transparent)
        }
      }
}

/** Media controls overlay with play/pause, seek, and volume controls. */
@Composable
fun MediaControlsOverlay(
    isPlaying: Boolean,
    currentTime: Float,
    volume: Float,
    onPlayPause: () -> Unit,
    onSeek: (Float) -> Unit,
    onVolumeChange: (Float) -> Unit
) {
  Column(
      modifier = Modifier.fillMaxWidth().background(Color.Black.copy(alpha = 0.7f)).padding(16.dp),
      horizontalAlignment = Alignment.CenterHorizontally,
      verticalArrangement = Arrangement.spacedBy(16.dp)) {
        // Progress slider
        Column {
          Text(
              text = "${formatTime(currentTime)} / ${formatTime(100f)}",
              color = Color.White,
              fontSize = 14.sp)
          Slider(
              value = currentTime,
              onValueChange = onSeek,
              valueRange = 0f..100f,
              modifier = Modifier.fillMaxWidth(),
              colors =
                  SliderDefaults.colors(
                      thumbColor = MaterialTheme.colorScheme.primary,
                      activeTrackColor = MaterialTheme.colorScheme.primary,
                      inactiveTrackColor = Color.Gray))
        }

        // Control buttons
        Row(
            horizontalArrangement = Arrangement.spacedBy(24.dp),
            verticalAlignment = Alignment.CenterVertically) {
              // Volume control
              Column(horizontalAlignment = Alignment.CenterHorizontally) {
                Icon(
                    imageVector = Icons.AutoMirrored.Filled.VolumeUp,
                    contentDescription = "Volume Up",
                    tint = Color.White)
                Slider(
                    value = volume,
                    onValueChange = onVolumeChange,
                    valueRange = 0f..1f,
                    modifier = Modifier.width(120.dp),
                    colors =
                        SliderDefaults.colors(
                            thumbColor = MaterialTheme.colorScheme.primary,
                            activeTrackColor = MaterialTheme.colorScheme.primary,
                            inactiveTrackColor = Color.Gray))
              }

              // Play/Pause button
              Button(
                  onClick = onPlayPause,
                  modifier = Modifier.size(64.dp),
                  colors =
                      ButtonDefaults.buttonColors(
                          containerColor = MaterialTheme.colorScheme.primary)) {
                    Icon(
                        imageVector = if (isPlaying) Icons.Filled.Pause else Icons.Filled.PlayArrow,
                        contentDescription = if (isPlaying) "Pause" else "Play",
                        tint = Color.White,
                    )
                  }
            }
      }
}

/** Format time in seconds to MM:SS format. */
private fun formatTime(seconds: Float): String {
  val minutes = (seconds / 60).toInt()
  val remainingSeconds = (seconds % 60).toInt()
  return "%02d:%02d".format(minutes, remainingSeconds)
}

/** Media type selection card. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MediaTypeCard(mediaType: MediaType, isSelected: Boolean, onClick: () -> Unit) {
  Card(
      onClick = onClick,
      modifier = Modifier.fillMaxWidth(),
      colors =
          CardDefaults.cardColors(
              containerColor =
                  if (isSelected) {
                    MaterialTheme.colorScheme.primaryContainer
                  } else {
                    MaterialTheme.colorScheme.surface
                  }),
      elevation = CardDefaults.cardElevation(defaultElevation = 4.dp)) {
        Column(modifier = Modifier.padding(16.dp)) {
          Text(
              text = "${mediaType.icon} ${mediaType.displayName}",
              fontSize = 18.sp,
              fontWeight = FontWeight.Medium,
              color =
                  if (isSelected) {
                    MaterialTheme.colorScheme.onPrimaryContainer
                  } else {
                    MaterialTheme.colorScheme.onSurface
                  })
          Text(
              text = mediaType.description,
              fontSize = 14.sp,
              color =
                  if (isSelected) {
                    MaterialTheme.colorScheme.onPrimaryContainer.copy(alpha = 0.7f)
                  } else {
                    MaterialTheme.colorScheme.onSurface.copy(alpha = 0.7f)
                  })
        }
      }
}

/** Enum for different media types. */
enum class MediaType(val displayName: String, val description: String, val icon: String) {
  IMAGE("Image Gallery", "View images with Coil loading", "🖼️"),
  VIDEO("Video Player", "Play videos with ExoPlayer", "🎬"),
  AUDIO("Audio Player", "Play audio with ExoPlayer", "🎵")
}

/** Sample image URLs for testing. */
private fun getSampleImageUrls(): List<String> =
    listOf(
        "https://picsum.photos/800/600?random=1",
        "https://picsum.photos/800/600?random=2",
        "https://picsum.photos/800/600?random=3",
        "https://picsum.photos/800/600?random=4")

/** Sample video URL for testing. */
private fun getSampleVideoUrl(): String =
    "android.resource://com.zillow.automobile.mediaplayer/raw/automobile"

/** Sample audio URL for testing. */
private fun getSampleAudioUrl(): String = "https://www.soundjay.com/misc/sounds/bell-ringing-05.wav"

/** Preview for the media player screen. */
@Preview(showBackground = true)
@Composable
fun MediaPlayerScreenPreview() {
  AutoMobileTheme { MediaPlayerScreen() }
}

/** Preview for the fullscreen media player. */
@Preview(showBackground = true)
@Composable
fun FullscreenMediaPlayerPreview() {
  AutoMobileTheme { FullscreenMediaPlayer() }
}
