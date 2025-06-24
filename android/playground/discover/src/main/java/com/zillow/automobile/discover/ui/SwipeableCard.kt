package com.zillow.automobile.discover.ui

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.tween
import androidx.compose.foundation.gestures.detectHorizontalDragGestures
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.DragHandle
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil3.compose.AsyncImage
import kotlin.math.abs
import kotlin.math.roundToInt
import kotlinx.coroutines.launch

data class SwipeCard(
    val id: String,
    val title: String,
    val description: String,
    val imageUrl: String,
    val color: Color
)

@Composable
fun SwipeableCard(card: SwipeCard, onSwipeAway: () -> Unit) {
  val offsetX = remember { Animatable(0f) }
  val scale = remember { Animatable(1f) }
  val coroutineScope = rememberCoroutineScope()

  Card(
      modifier =
          Modifier.fillMaxWidth()
              .height(200.dp)
              .offset { IntOffset(offsetX.value.roundToInt(), 0) }
              .scale(scale.value)
              .pointerInput(Unit) {
                detectHorizontalDragGestures(
                    onDragEnd = {
                      if (abs(offsetX.value) > 300) {
                        // Swipe away animation
                        coroutineScope.launch {
                          offsetX.animateTo(
                              targetValue = if (offsetX.value > 0) 1000f else -1000f,
                              animationSpec = tween(300))
                          onSwipeAway()
                        }
                      } else {
                        // Snap back animation
                        coroutineScope.launch {
                          offsetX.snapTo(0f)
                          scale.snapTo(1f)
                        }
                      }
                    }) { change, dragAmount ->
                      change.consume()
                      coroutineScope.launch {
                        offsetX.snapTo(offsetX.value + dragAmount)
                        val progress = abs(offsetX.value) / 300f
                        scale.snapTo(1f - (progress * 0.1f).coerceAtMost(0.1f))
                      }
                    }
              },
      colors = CardDefaults.cardColors(containerColor = card.color.copy(alpha = 0.1f))) {
        Row(
            modifier = Modifier.fillMaxSize().padding(16.dp),
            verticalAlignment = Alignment.CenterVertically) {
              AsyncImage(
                  model = card.imageUrl,
                  contentDescription = card.title,
                  modifier = Modifier.size(120.dp).clip(RoundedCornerShape(8.dp)),
                  contentScale = ContentScale.Crop)

              Column(modifier = Modifier.weight(1f).padding(start = 16.dp)) {
                Text(
                    text = card.title,
                    fontSize = 18.sp,
                    fontWeight = FontWeight.Bold,
                    color = MaterialTheme.colorScheme.onSurface)
                Text(
                    text = card.description,
                    fontSize = 14.sp,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(top = 8.dp))
              }

              Icon(
                  imageVector = Icons.Filled.DragHandle,
                  contentDescription = "Swipe indicator",
                  tint = MaterialTheme.colorScheme.onSurfaceVariant)
            }
      }
}

@Preview(showBackground = true)
@Composable
fun PreviewSwipeableCard() {
  val sampleCard =
      SwipeCard(
          id = "1",
          title = "Preview Card",
          description = "This is a preview of the swipeable card component",
          imageUrl = "https://picsum.photos/300/200?random=1",
          color = Color(0xFF6200EE))

  MaterialTheme { SwipeableCard(card = sampleCard, onSwipeAway = {}) }
}
