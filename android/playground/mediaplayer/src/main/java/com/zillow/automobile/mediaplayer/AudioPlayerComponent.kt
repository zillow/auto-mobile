package com.zillow.automobile.mediaplayer

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Pause
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Slider
import androidx.compose.material3.SliderDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.media3.common.util.UnstableApi
import kotlinx.coroutines.launch

/**
 * Audio player component using ExoPlayer for audio playback. Provides a clean audio-focused UI with
 * playback controls.
 */
@UnstableApi
@Composable
fun AudioPlayerComponent(
    audioResource: VideoResource,
    modifier: Modifier = Modifier,
    viewModel: MediaPlayerViewModel = viewModel()
) {
  val context = LocalContext.current
  val player by viewModel.playerState.collectAsState()
  val isPlaying by viewModel.isPlaying.collectAsState()
  val currentPosition by viewModel.currentPosition.collectAsState()
  val duration by viewModel.duration.collectAsState()
  val playbackError by viewModel.playbackError.collectAsState()

  var isPlayerReady by remember { mutableStateOf(false) }

  // Initialize player when audio URL is provided
  LaunchedEffect(audioResource) {
    if (audioResource is VideoResource.UriVideo) {
      viewModel.initializePlayer(context, audioResource)
    }
  }

  // Update player ready state
  LaunchedEffect(player) { isPlayerReady = player != null }

  // Cleanup player on disposal
  DisposableEffect(Unit) {
    onDispose {
      viewModel.savePlayerState()
      viewModel.releasePlayer()
    }
  }

  Card(
      modifier = modifier,
      elevation = CardDefaults.cardElevation(defaultElevation = 4.dp),
      colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)) {
        Column(modifier = Modifier.fillMaxWidth().padding(16.dp)) {
          Text(
              text = "🎵 Audio Player",
              fontSize = 20.sp,
              fontWeight = FontWeight.Bold,
              color = MaterialTheme.colorScheme.onSurface,
              modifier = Modifier.padding(bottom = 16.dp))

          Text(
              text = "Audio playback with ExoPlayer - supports various audio formats",
              fontSize = 14.sp,
              color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.7f),
              modifier = Modifier.padding(bottom = 16.dp))

          // Show error if playback failed
          playbackError?.let { error ->
            ErrorMessage(
                error = error,
                onRetry = {
                  viewModel.clearError()
                  viewModel.initializePlayer(context, audioResource)
                },
                modifier = Modifier.fillMaxWidth().padding(bottom = 16.dp))
          }

          // Audio player interface
          if (playbackError == null) {
            AudioPlayerInterface(
                isPlaying = isPlaying,
                isPlayerReady = isPlayerReady,
                currentPosition = currentPosition,
                duration = duration,
                onPlayPause = { viewModel.togglePlayPause() },
                onSeek = { position -> viewModel.seekTo(position) },
                onVolumeChange = { volume -> viewModel.setVolume(volume) })
          }
        }
      }
}

/** Audio player interface with visualizations and controls. */
@UnstableApi
@Composable
fun AudioPlayerInterface(
    isPlaying: Boolean,
    isPlayerReady: Boolean,
    currentPosition: Long,
    duration: Long,
    onPlayPause: () -> Unit,
    onSeek: (Long) -> Unit,
    onVolumeChange: (Float) -> Unit
) {
  Column(
      horizontalAlignment = Alignment.CenterHorizontally,
      verticalArrangement = Arrangement.spacedBy(24.dp)) {
        // Audio visualization area
        AudioVisualization(isPlaying = isPlaying, isPlayerReady = isPlayerReady)

        // Track progress
        if (isPlayerReady) {
          TrackProgress(currentPosition = currentPosition, duration = duration, onSeek = onSeek)
        }

        // Audio controls
        AudioControls(
            isPlaying = isPlaying,
            isPlayerReady = isPlayerReady,
            onPlayPause = onPlayPause,
            onVolumeChange = onVolumeChange)
      }
}

/** Audio visualization component with animated elements. */
@UnstableApi
@Composable
fun AudioVisualization(isPlaying: Boolean, isPlayerReady: Boolean) {
  Box(
      modifier = Modifier.fillMaxWidth().padding(vertical = 32.dp),
      contentAlignment = Alignment.Center) {
        if (!isPlayerReady) {
          // Loading state
          Column(horizontalAlignment = Alignment.CenterHorizontally) {
            CircularProgressIndicator(
                modifier = Modifier.size(64.dp),
                color = MaterialTheme.colorScheme.primary,
                strokeWidth = 4.dp)
            Text(
                text = "Loading audio...",
                fontSize = 14.sp,
                color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.7f),
                modifier = Modifier.padding(top = 16.dp))
          }
        } else {
          // Audio waveform visualization (simplified)
          AudioWaveform(isPlaying = isPlaying)
        }
      }
}

/** Simplified audio waveform visualization. */
@UnstableApi
@Composable
fun AudioWaveform(isPlaying: Boolean) {
  val waveformColor =
      if (isPlaying) {
        MaterialTheme.colorScheme.primary
      } else {
        MaterialTheme.colorScheme.outline.copy(alpha = 0.5f)
      }

  Column(horizontalAlignment = Alignment.CenterHorizontally) {
    // Large audio icon
    Box(
        modifier =
            Modifier.size(120.dp)
                .clip(CircleShape)
                .background(
                    MaterialTheme.colorScheme.primaryContainer.copy(
                        alpha = if (isPlaying) 1f else 0.5f)),
        contentAlignment = Alignment.Center) {
          Text(text = if (isPlaying) "🎵" else "🎼", fontSize = 48.sp)
        }

    // Waveform bars (simplified visualization)
    Row(
        modifier = Modifier.padding(top = 24.dp),
        horizontalArrangement = Arrangement.spacedBy(4.dp)) {
          repeat(12) { index ->
            val height = remember { (20..60).random() }
            Box(
                modifier =
                    Modifier.size(width = 4.dp, height = height.dp)
                        .clip(RoundedCornerShape(2.dp))
                        .background(waveformColor))
          }
        }

    Text(
        text = if (isPlaying) "♪ Now Playing ♪" else "♪ Audio Ready ♪",
        fontSize = 16.sp,
        fontWeight = FontWeight.Medium,
        color = MaterialTheme.colorScheme.onSurface,
        modifier = Modifier.padding(top = 16.dp))
  }
}

/** Track progress with seek functionality. */
@UnstableApi
@Composable
fun TrackProgress(currentPosition: Long, duration: Long, onSeek: (Long) -> Unit) {
  Column(modifier = Modifier.fillMaxWidth()) {
    // Time labels
    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
      Text(
          text = formatTime(currentPosition),
          fontSize = 12.sp,
          color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.7f))
      Text(
          text = formatTime(duration),
          fontSize = 12.sp,
          color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.7f))
    }

    // Progress slider
    if (duration > 0) {
      val coroutineScope = rememberCoroutineScope()
      Slider(
          value = currentPosition.toFloat(),
          onValueChange = { newPosition -> coroutineScope.launch { onSeek(newPosition.toLong()) } },
          valueRange = 0f..duration.toFloat(),
          modifier = Modifier.fillMaxWidth(),
          colors =
              SliderDefaults.colors(
                  thumbColor = MaterialTheme.colorScheme.primary,
                  activeTrackColor = MaterialTheme.colorScheme.primary,
                  inactiveTrackColor = MaterialTheme.colorScheme.outline.copy(alpha = 0.3f)))
    } else {
      // Progress indicator when duration is unknown
      LinearProgressIndicator(
          modifier = Modifier.fillMaxWidth(),
          color = MaterialTheme.colorScheme.primary,
          trackColor = MaterialTheme.colorScheme.outline.copy(alpha = 0.3f))
    }
  }
}

/** Audio control buttons with play/pause and volume. */
@UnstableApi
@Composable
fun AudioControls(
    isPlaying: Boolean,
    isPlayerReady: Boolean,
    onPlayPause: () -> Unit,
    onVolumeChange: (Float) -> Unit
) {
  var volume by remember { mutableFloatStateOf(0.7f) }

  Column(
      horizontalAlignment = Alignment.CenterHorizontally,
      verticalArrangement = Arrangement.spacedBy(16.dp)) {
        // Play/Pause button
        Button(
            onClick = onPlayPause,
            enabled = isPlayerReady,
            modifier = Modifier.size(72.dp),
            colors =
                ButtonDefaults.buttonColors(
                    containerColor = MaterialTheme.colorScheme.primary,
                    disabledContainerColor = MaterialTheme.colorScheme.outline.copy(alpha = 0.3f)),
            shape = CircleShape) {
              Icon(
                  imageVector = if (isPlaying) Icons.Filled.Pause else Icons.Filled.PlayArrow,
                  contentDescription = if (isPlaying) "Pause" else "Play")
            }

        // Volume control
        Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth()) {
          Text(text = "🔉", fontSize = 18.sp, modifier = Modifier.padding(end = 12.dp))

          Slider(
              value = volume,
              onValueChange = { newVolume ->
                volume = newVolume
                onVolumeChange(newVolume)
              },
              valueRange = 0f..1f,
              modifier = Modifier.weight(1f),
              colors =
                  SliderDefaults.colors(
                      thumbColor = MaterialTheme.colorScheme.primary,
                      activeTrackColor = MaterialTheme.colorScheme.primary,
                      inactiveTrackColor = MaterialTheme.colorScheme.outline.copy(alpha = 0.3f)))

          Text(text = "🔊", fontSize = 18.sp, modifier = Modifier.padding(start = 12.dp))
        }
      }
}

/** Format time in milliseconds to MM:SS format. */
@UnstableApi
private fun formatTime(timeMs: Long): String {
  val seconds = (timeMs / 1000).toInt()
  val minutes = seconds / 60
  val remainingSeconds = seconds % 60
  return "%02d:%02d".format(minutes, remainingSeconds)
}

/** Preview for the audio player component. */
@UnstableApi
@Preview(showBackground = true)
@Composable
fun AudioPlayerComponentPreview() {
  MaterialTheme {
    AudioPlayerComponent(
        audioResource =
            VideoResource.UriVideo(
                android.net.Uri.parse("https://www.soundjay.com/misc/sounds/bell-ringing-05.wav")))
  }
}
