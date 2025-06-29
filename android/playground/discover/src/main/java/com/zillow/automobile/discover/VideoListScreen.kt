package com.zillow.automobile.discover

import android.content.res.Configuration
import androidx.compose.foundation.background
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
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil3.compose.AsyncImage
import com.zillow.automobile.design.system.theme.AutoMobileTheme
import com.zillow.automobile.mediaplayer.VideoData

/** MEDIA screen content displaying a scrollable list of videos */
@Composable
fun VideoListScreen(onNavigateToVideoPlayer: (String) -> Unit) {
  LazyColumn(
      modifier = Modifier.fillMaxSize(),
      contentPadding = PaddingValues(16.dp),
      verticalArrangement = Arrangement.spacedBy(16.dp)) {
        items(VideoData.entries) { video ->
          VideoCard(video = video, onClick = { onNavigateToVideoPlayer(video.id) })
        }
      }
}

@Composable
fun VideoCard(video: VideoData, onClick: () -> Unit) {
  Card(
      onClick = onClick,
      modifier = Modifier.fillMaxWidth(),
      elevation = CardDefaults.cardElevation(defaultElevation = 4.dp),
      shape = RoundedCornerShape(12.dp)) {
        Column {
          Box {
            AsyncImage(
                model = video.thumbnailUrl,
                contentDescription = video.title,
                modifier =
                    Modifier.fillMaxWidth()
                        .aspectRatio(16f / 9f)
                        .clip(RoundedCornerShape(topStart = 12.dp, topEnd = 12.dp)),
                contentScale = ContentScale.Crop)

            // Play button overlay
            Box(
                modifier = Modifier.fillMaxSize().padding(8.dp),
                contentAlignment = Alignment.BottomEnd) {
                  Card(
                      colors =
                          CardDefaults.cardColors(
                              containerColor =
                                  MaterialTheme.colorScheme.surface.copy(alpha = 0.9f)),
                      shape = RoundedCornerShape(4.dp)) {
                        Text(
                            text = video.duration,
                            modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp),
                            fontSize = 12.sp,
                            color = MaterialTheme.colorScheme.onSurface)
                      }
                }

            // Play icon centered
            Icon(
                imageVector = Icons.Filled.PlayArrow,
                contentDescription = "Play",
                modifier = Modifier.align(Alignment.Center).size(48.dp),
                tint = MaterialTheme.colorScheme.primary.copy(alpha = 0.8f))
          }

          Column(modifier = Modifier.padding(12.dp)) {
            Text(
                text = video.title,
                fontSize = 16.sp,
                fontWeight = FontWeight.Bold,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
                color = MaterialTheme.colorScheme.onSurface)

            Text(
                text = video.description,
                fontSize = 14.sp,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(top = 4.dp))
          }
        }
      }
}

@Preview(name = "VideoList", showBackground = true, uiMode = Configuration.UI_MODE_NIGHT_NO)
@Preview(name = "VideoList - Dark", showBackground = true, uiMode = Configuration.UI_MODE_NIGHT_YES)
@Composable
fun PreviewVideoListScreen() {
  val isDarkMode =
      when (LocalConfiguration.current.uiMode and Configuration.UI_MODE_NIGHT_MASK) {
        Configuration.UI_MODE_NIGHT_YES -> true
        else -> false
      }

  AutoMobileTheme(darkTheme = isDarkMode) {
    Column(Modifier.background(MaterialTheme.colorScheme.background)) {
      VideoListScreen(onNavigateToVideoPlayer = {})
    }
  }
}

@Preview(name = "VideCard", showBackground = true, uiMode = Configuration.UI_MODE_NIGHT_NO)
@Preview(name = "VideCard - Dark", showBackground = true, uiMode = Configuration.UI_MODE_NIGHT_YES)
@Composable
fun PreviewVideoCard() {
  val sampleVideo = VideoData.AUTO_MOBILE

  val isDarkMode =
      when (LocalConfiguration.current.uiMode and Configuration.UI_MODE_NIGHT_MASK) {
        Configuration.UI_MODE_NIGHT_YES -> true
        else -> false
      }

  AutoMobileTheme(darkTheme = isDarkMode) {
    Column(Modifier.background(MaterialTheme.colorScheme.background)) {
      VideoCard(video = sampleVideo, onClick = {})
    }
  }
}

@Preview(name = "VideoCard in List", showBackground = true, uiMode = Configuration.UI_MODE_NIGHT_NO)
@Preview(
    name = "VideoCard in List - Dark",
    showBackground = true,
    uiMode = Configuration.UI_MODE_NIGHT_YES)
@Composable
fun PreviewVideoCardList() {
  val isDarkMode =
      when (LocalConfiguration.current.uiMode and Configuration.UI_MODE_NIGHT_MASK) {
        Configuration.UI_MODE_NIGHT_YES -> true
        else -> false
      }

  AutoMobileTheme(darkTheme = isDarkMode) {
    LazyColumn(
        modifier = Modifier.background(MaterialTheme.colorScheme.background),
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp)) {
          items(VideoData.entries) { video -> VideoCard(video = video, onClick = {}) }
        }
  }
}
