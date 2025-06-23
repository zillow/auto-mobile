package com.zillow.automobile.discover.ui

import androidx.compose.animation.core.Animatable
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.itemsIndexed
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Star
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.scale
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import androidx.compose.ui.zIndex
import coil3.compose.AsyncImage
import kotlin.math.roundToInt

data class GridImage(val id: String, val imageUrl: String, val description: String)

@Composable
fun ReorderableGrid(images: List<GridImage>, onReorder: (Int, Int) -> Unit) {
  var draggedIndex by remember { mutableIntStateOf(-1) }
  var draggedOverIndex by remember { mutableIntStateOf(-1) }
  var tempReorderedImages by remember { mutableStateOf<List<GridImage>?>(null) }
  val density = LocalDensity.current

  // Use either the temporary reordered list or the original list
  val displayImages = tempReorderedImages ?: images

  // Reset temp list when images change from outside
  LaunchedEffect(images) {
    if (draggedIndex == -1) {
      tempReorderedImages = null
    }
  }

  LazyVerticalGrid(
      columns = GridCells.Fixed(3),
      contentPadding = PaddingValues(8.dp),
      horizontalArrangement = Arrangement.spacedBy(8.dp),
      verticalArrangement = Arrangement.spacedBy(8.dp),
      modifier = Modifier.height(280.dp)) {
        itemsIndexed(displayImages, key = { _, image -> image.id }) { index, image ->
          val isBeingDragged = draggedIndex != -1 && images[draggedIndex].id == image.id
          val isDropTarget = draggedOverIndex == index && !isBeingDragged

          GridImageItem(
              image = image,
              isDragged = isBeingDragged,
              isDropTarget = isDropTarget,
              onDragStart = {
                val originalIndex = images.indexOfFirst { it.id == image.id }
                draggedIndex = originalIndex
                tempReorderedImages = images.toList()
              },
              onDragEnd = {
                if (draggedIndex != -1 && tempReorderedImages != null) {
                  val finalIndex =
                      tempReorderedImages!!.indexOfFirst { it.id == images[draggedIndex].id }
                  if (finalIndex != draggedIndex) {
                    onReorder(draggedIndex, finalIndex)
                  }
                }
                draggedIndex = -1
                draggedOverIndex = -1
                tempReorderedImages = null
              },
              onDragMove = { offset ->
                if (draggedIndex != -1 && tempReorderedImages != null) {
                  // Calculate grid position based on drag offset
                  val itemSize =
                      with(density) { 88.dp.toPx() } // Approximate item size including spacing
                  val cols = 3
                  val currentRow = index / cols
                  val currentCol = index % cols

                  val newCol =
                      ((currentCol * itemSize + offset.x) / itemSize)
                          .roundToInt()
                          .coerceIn(0, cols - 1)
                  val newRow =
                      ((currentRow * itemSize + offset.y) / itemSize)
                          .roundToInt()
                          .coerceIn(0, 1) // 2 rows max
                  val newIndex = (newRow * cols + newCol).coerceIn(0, displayImages.size - 1)

                  if (newIndex != draggedOverIndex &&
                      newIndex != index &&
                      newIndex < displayImages.size) {
                    draggedOverIndex = newIndex

                    // Create new reordered list by moving the dragged item to the hovered position
                    val currentList = tempReorderedImages!!.toMutableList()
                    val draggedImage = images[draggedIndex]
                    val currentDraggedIndex = currentList.indexOfFirst { it.id == draggedImage.id }

                    if (currentDraggedIndex != -1) {
                      currentList.removeAt(currentDraggedIndex)
                      currentList.add(newIndex, draggedImage)
                      tempReorderedImages = currentList
                    }
                  }
                }
              },
              modifier = Modifier.animateItem(fadeInSpec = null, fadeOutSpec = null))
        }
      }
}

@Composable
fun GridImageItem(
    image: GridImage,
    isDragged: Boolean,
    isDropTarget: Boolean,
    onDragStart: () -> Unit,
    onDragEnd: () -> Unit,
    onDragMove: (Offset) -> Unit,
    modifier: Modifier = Modifier
) {
  var dragOffset by remember { mutableStateOf(Offset.Zero) }
  val scale = remember { Animatable(1f) }

  LaunchedEffect(isDragged) { scale.animateTo(if (isDragged) 1.15f else 1f) }

  LaunchedEffect(isDropTarget, isDragged) {
    if (!isDragged) {
      dragOffset = Offset.Zero
    }
  }

  Card(
      modifier =
          modifier
              .aspectRatio(1f)
              .offset {
                if (isDragged) IntOffset(dragOffset.x.roundToInt(), dragOffset.y.roundToInt())
                else IntOffset.Zero
              }
              .scale(scale.value)
              .zIndex(if (isDragged) 1f else 0f)
              .shadow(if (isDragged) 16.dp else 4.dp, RoundedCornerShape(8.dp))
              .pointerInput(Unit) {
                detectDragGestures(
                    onDragStart = { offset ->
                      // Start drag immediately on touch
                      onDragStart()
                      dragOffset = Offset.Zero
                    },
                    onDragEnd = {
                      onDragEnd()
                      dragOffset = Offset.Zero
                    }) { change, dragAmount ->
                      dragOffset += dragAmount
                      onDragMove(dragOffset)
                    }
              },
      elevation = CardDefaults.cardElevation(defaultElevation = if (isDragged) 16.dp else 4.dp),
      colors =
          CardDefaults.cardColors(
              containerColor =
                  when {
                    isDragged -> MaterialTheme.colorScheme.primaryContainer
                    isDropTarget -> MaterialTheme.colorScheme.secondaryContainer
                    else -> MaterialTheme.colorScheme.surface
                  })) {
        Box(modifier = Modifier.fillMaxSize()) {
          AsyncImage(
              model = image.imageUrl,
              contentDescription = image.description,
              modifier = Modifier.fillMaxSize(),
              contentScale = ContentScale.Crop)

          if (isDragged) {
            Box(
                modifier =
                    Modifier.fillMaxSize()
                        .background(MaterialTheme.colorScheme.primary.copy(alpha = 0.2f)))
          }

          if (isDropTarget && !isDragged) {
            Box(
                modifier =
                    Modifier.fillMaxSize()
                        .background(MaterialTheme.colorScheme.secondary.copy(alpha = 0.3f)))
          }

          Icon(
              imageVector = Icons.Filled.Star,
              contentDescription = "Drag handle",
              modifier = Modifier.align(Alignment.TopEnd).padding(4.dp).size(16.dp),
              tint = Color.White)
        }
      }
}

@Preview(showBackground = true)
@Composable
fun ReorderableGridPreview() {
  val sampleImages =
      listOf(
          GridImage("1", "https://picsum.photos/200/200?random=1", "Sample image 1"),
          GridImage("2", "https://picsum.photos/200/200?random=2", "Sample image 2"),
          GridImage("3", "https://picsum.photos/200/200?random=3", "Sample image 3"),
          GridImage("4", "https://picsum.photos/200/200?random=4", "Sample image 4"),
          GridImage("5", "https://picsum.photos/200/200?random=5", "Sample image 5"),
          GridImage("6", "https://picsum.photos/200/200?random=6", "Sample image 6"))

  MaterialTheme {
    ReorderableGrid(
        images = sampleImages,
        onReorder = { fromIndex, toIndex ->
          // Preview doesn't handle reordering
        })
  }
}
