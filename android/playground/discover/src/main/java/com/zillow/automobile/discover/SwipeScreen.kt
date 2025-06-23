package com.zillow.automobile.discover

import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewmodel.compose.viewModel
import com.zillow.automobile.discover.ui.GridImage
import com.zillow.automobile.discover.ui.ReorderableGrid
import com.zillow.automobile.discover.ui.SwipeCard
import com.zillow.automobile.discover.ui.SwipeableCard
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

class SwipeScreenViewModel : ViewModel() {
  private val _swipeCards =
      MutableStateFlow(
          listOf(
              SwipeCard(
                  id = "1",
                  title = "Swipe Left/Right",
                  description = "Try swiping this card left or right to see the animation",
                  imageUrl = "https://picsum.photos/300/200?random=1",
                  color = Color(0xFF6200EE)),
              SwipeCard(
                  id = "2",
                  title = "Another Swipeable Card",
                  description = "This card also supports horizontal swipe gestures",
                  imageUrl = "https://picsum.photos/300/200?random=2",
                  color = Color(0xFF03DAC5)),
              SwipeCard(
                  id = "3",
                  title = "Gesture Recognition",
                  description = "Each swipe is detected and animated smoothly",
                  imageUrl = "https://picsum.photos/300/200?random=3",
                  color = Color(0xFFFF5722))))
  val swipeCards: StateFlow<List<SwipeCard>> = _swipeCards.asStateFlow()

  private val _gridImages =
      MutableStateFlow(
          listOf(
              GridImage("grid1", "https://picsum.photos/200/200?random=21", "Image 1"),
              GridImage("grid2", "https://picsum.photos/200/200?random=22", "Image 2"),
              GridImage("grid3", "https://picsum.photos/200/200?random=23", "Image 3"),
              GridImage("grid4", "https://picsum.photos/200/200?random=24", "Image 4"),
              GridImage("grid5", "https://picsum.photos/200/200?random=25", "Image 5"),
              GridImage("grid6", "https://picsum.photos/200/200?random=26", "Image 6")))
  val gridImages: StateFlow<List<GridImage>> = _gridImages.asStateFlow()

  fun reorderGridImages(fromIndex: Int, toIndex: Int) {
    val currentList = _gridImages.value.toMutableList()
    val item = currentList.removeAt(fromIndex)
    currentList.add(toIndex, item)
    _gridImages.value = currentList
  }

  fun removeSwipeCard(cardId: String) {
    _swipeCards.value = _swipeCards.value.filter { it.id != cardId }
  }
}

/** SWIPE screen content with various swipe gestures and drag-and-drop functionality */
@OptIn(ExperimentalFoundationApi::class)
@Composable
fun SwipeScreen(viewModel: SwipeScreenViewModel = viewModel()) {
  val swipeCards by viewModel.swipeCards.collectAsState()
  val gridImages by viewModel.gridImages.collectAsState()

  LazyColumn(
      modifier = Modifier.fillMaxSize(),
      contentPadding = PaddingValues(16.dp),
      verticalArrangement = Arrangement.spacedBy(24.dp)) {
        item {
          Text(
              text = "Swipeable Cards",
              fontSize = 18.sp,
              fontWeight = FontWeight.Bold,
              modifier = Modifier.padding(bottom = 8.dp))
        }

        // Swipeable Cards
        itemsIndexed(swipeCards) { index, card ->
          SwipeableCard(card = card, onSwipeAway = { viewModel.removeSwipeCard(card.id) })
        }

        item {
          Text(
              text = "Reorderable Grid (3x2)",
              fontSize = 18.sp,
              fontWeight = FontWeight.Bold,
              modifier = Modifier.padding(top = 16.dp, bottom = 8.dp))
        }

        item {
          ReorderableGrid(
              images = gridImages,
              onReorder = { fromIndex, toIndex -> viewModel.reorderGridImages(fromIndex, toIndex) })
        }
      }
}

@Preview(showBackground = true)
@Composable
fun PreviewSwipeScreen() {
  MaterialTheme { SwipeScreen() }
}
