package dev.jasonpearson.automobile.discover

import android.os.SystemClock
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.tween
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.gestures.detectDragGesturesAfterLongPress
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.TouchApp
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Divider
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.zIndex
import dev.jasonpearson.automobile.design.system.theme.AutoMobileTheme
import kotlin.math.roundToInt
import kotlinx.coroutines.launch

data class DraggableListItem(val id: Int, val label: String)

@OptIn(ExperimentalMaterial3Api::class, ExperimentalFoundationApi::class)
@Composable
fun LongPressScreen() {
  val haptics = LocalHapticFeedback.current
  val scrollState = rememberScrollState()

  var longPressFeedback by remember { mutableStateOf("Hold to trigger") }
  var contextMenuExpanded by remember { mutableStateOf(false) }
  var hapticConfirmation by remember { mutableStateOf(false) }

  Column(
      modifier =
          Modifier.fillMaxSize().verticalScroll(scrollState).padding(16.dp).semantics {
            testTag = "long_press_screen_content"
          },
      verticalArrangement = Arrangement.spacedBy(16.dp)) {
        Text(
            text = "LONG PRESS SCREEN",
            fontSize = 24.sp,
            fontWeight = FontWeight.Bold,
            modifier = Modifier.fillMaxWidth().semantics { testTag = "long_press_screen_title" })

        Text(
            text = "Dedicated long press scenarios for testing gestures and timing",
            fontSize = 16.sp,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.fillMaxWidth().semantics { testTag = "long_press_screen_description" })

        Divider()

        Text(
            text = "Basic Long Press",
            fontSize = 18.sp,
            fontWeight = FontWeight.Bold,
            modifier = Modifier.fillMaxWidth())

        Card(
            modifier =
                Modifier.fillMaxWidth()
                    .combinedClickable(
                        onClick = { longPressFeedback = "Tap detected" },
                        onLongClick = { longPressFeedback = "Long pressed!" })
                    .semantics {
                      testTag = "long_press_card"
                      contentDescription = "Basic long press card"
                    },
            colors =
                CardDefaults.cardColors(
                    containerColor = MaterialTheme.colorScheme.secondaryContainer)) {
              Column(modifier = Modifier.padding(16.dp)) {
                Text(
                    text = "Long press me",
                    fontSize = 16.sp,
                    fontWeight = FontWeight.Medium,
                    color = MaterialTheme.colorScheme.onSecondaryContainer)
                Spacer(modifier = Modifier.height(8.dp))
                Text(
                    text = longPressFeedback,
                    fontSize = 14.sp,
                    color = MaterialTheme.colorScheme.onSecondaryContainer,
                    modifier = Modifier.semantics { testTag = "long_press_card_feedback" })
              }
            }

        Divider()

        Text(
            text = "Context Menu Trigger",
            fontSize = 18.sp,
            fontWeight = FontWeight.Bold,
            modifier = Modifier.fillMaxWidth())

        Text(
            text = "Long press for options",
            modifier =
                Modifier.fillMaxWidth()
                    .combinedClickable(
                        onClick = { contextMenuExpanded = false },
                        onLongClick = { contextMenuExpanded = true })
                    .padding(12.dp)
                    .semantics { testTag = "context_menu_trigger" },
            fontSize = 16.sp,
            color = MaterialTheme.colorScheme.primary)

        DropdownMenu(
            expanded = contextMenuExpanded,
            onDismissRequest = { contextMenuExpanded = false },
            modifier = Modifier.semantics { testTag = "context_menu" }) {
              DropdownMenuItem(
                  text = { Text("Copy") },
                  onClick = { contextMenuExpanded = false },
                  modifier = Modifier.semantics { testTag = "context_menu_item_copy" })
              DropdownMenuItem(
                  text = { Text("Share") },
                  onClick = { contextMenuExpanded = false },
                  modifier = Modifier.semantics { testTag = "context_menu_item_share" })
              DropdownMenuItem(
                  text = { Text("Delete") },
                  onClick = { contextMenuExpanded = false },
                  modifier = Modifier.semantics { testTag = "context_menu_item_delete" })
            }

        Divider()

        Text(
            text = "Long Press Drag",
            fontSize = 18.sp,
            fontWeight = FontWeight.Bold,
            modifier = Modifier.fillMaxWidth())

        LongPressDragList()

        Divider()

        Text(
            text = "Text Selection",
            fontSize = 18.sp,
            fontWeight = FontWeight.Bold,
            modifier = Modifier.fillMaxWidth())

        SelectionContainer {
          Text(
              text = "This is selectable text. Long press to select words.",
              modifier = Modifier.semantics { testTag = "selectable_text" },
              fontSize = 16.sp)
        }

        Divider()

        Text(
            text = "Variable Duration Buttons",
            fontSize = 18.sp,
            fontWeight = FontWeight.Bold,
            modifier = Modifier.fillMaxWidth())

        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
          LongPressDurationButton(
              requiredDurationMs = 300,
              label = "Quick hold (300ms)",
              testTag = "quick_hold_button")
          LongPressDurationButton(
              requiredDurationMs = 1000,
              label = "Standard hold (1s)",
              testTag = "standard_hold_button")
          LongPressDurationButton(
              requiredDurationMs = 2000,
              label = "Long hold (2s)",
              testTag = "long_hold_button")
        }

        Divider()

        Text(
            text = "Haptic Feedback",
            fontSize = 18.sp,
            fontWeight = FontWeight.Bold,
            modifier = Modifier.fillMaxWidth())

        Card(
            modifier =
                Modifier.fillMaxWidth()
                    .combinedClickable(
                        onClick = { hapticConfirmation = false },
                        onLongClick = {
                          haptics.performHapticFeedback(HapticFeedbackType.LongPress)
                          hapticConfirmation = true
                        })
                    .semantics { testTag = "haptic_long_press_card" },
            colors =
                CardDefaults.cardColors(
                    containerColor = MaterialTheme.colorScheme.primaryContainer)) {
              Column(modifier = Modifier.padding(16.dp)) {
                Text(
                    text = "Long press for haptic feedback",
                    fontSize = 16.sp,
                    fontWeight = FontWeight.Medium,
                    color = MaterialTheme.colorScheme.onPrimaryContainer)
                Spacer(modifier = Modifier.height(8.dp))
                Text(
                    text = if (hapticConfirmation) "Haptic feedback triggered" else "Waiting...",
                    fontSize = 14.sp,
                    color = MaterialTheme.colorScheme.onPrimaryContainer,
                    modifier = Modifier.semantics { testTag = "haptic_feedback_status" })
              }
            }

        Divider()

        Text(
            text = "Cancelable Long Press",
            fontSize = 18.sp,
            fontWeight = FontWeight.Bold,
            modifier = Modifier.fillMaxWidth())

        CancelableLongPress()
      }
}

@Composable
private fun LongPressDurationButton(requiredDurationMs: Int, label: String, testTag: String) {
  var statusText by remember { mutableStateOf("Hold to confirm") }
  val highlightColor = MaterialTheme.colorScheme.tertiaryContainer
  val defaultColor = MaterialTheme.colorScheme.surfaceVariant

  Card(
      modifier =
          Modifier.fillMaxWidth()
              .pointerInput(requiredDurationMs) {
                detectTapGestures(
                    onPress = {
                      statusText = "Holding..."
                      val start = SystemClock.elapsedRealtime()
                      val released = tryAwaitRelease()
                      val elapsed = SystemClock.elapsedRealtime() - start
                      statusText =
                          if (released && elapsed >= requiredDurationMs) {
                            "Success (${elapsed}ms)"
                          } else {
                            "Too short (${elapsed}ms)"
                          }
                    })
              }
              .semantics { this.testTag = testTag },
      colors =
          CardDefaults.cardColors(
              containerColor = if (statusText.startsWith("Success")) highlightColor else defaultColor),
      elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(12.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically) {
              Column {
                Text(text = label, fontSize = 16.sp, fontWeight = FontWeight.Medium)
                Text(text = statusText, fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
              }
              Icon(
                  imageVector = Icons.Filled.TouchApp,
                  contentDescription = "Hold gesture",
                  tint = MaterialTheme.colorScheme.primary)
            }
      }
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun LongPressDragList() {
  val items =
      remember {
        mutableStateListOf(
            DraggableListItem(1, "Drag item 1"),
            DraggableListItem(2, "Drag item 2"),
            DraggableListItem(3, "Drag item 3"),
            DraggableListItem(4, "Drag item 4"),
            DraggableListItem(5, "Drag item 5"))
      }
  var draggingIndex by remember { mutableIntStateOf(-1) }
  var dragOffset by remember { mutableFloatStateOf(0f) }
  val itemHeight = 56.dp
  val itemHeightPx = with(LocalDensity.current) { itemHeight.toPx() }

  Card(modifier = Modifier.fillMaxWidth(), elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)) {
    LazyColumn(
        modifier = Modifier.fillMaxWidth().height(280.dp),
        contentPadding = PaddingValues(8.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp)) {
          itemsIndexed(items, key = { _, item -> item.id }) { index, item ->
            val isDragging = draggingIndex == index
            val offsetY = if (isDragging) dragOffset else 0f

            Card(
                modifier =
                    Modifier.fillMaxWidth()
                        .height(itemHeight)
                        .offset { IntOffset(0, offsetY.roundToInt()) }
                        .zIndex(if (isDragging) 1f else 0f)
                        .pointerInput(items.size, draggingIndex) {
                          detectDragGesturesAfterLongPress(
                              onDragStart = { draggingIndex = index },
                              onDragEnd = {
                                draggingIndex = -1
                                dragOffset = 0f
                              },
                              onDragCancel = {
                                draggingIndex = -1
                                dragOffset = 0f
                              }) { change, dragAmount ->
                                change.consume()
                                dragOffset += dragAmount.y
                                val offsetIndex = (dragOffset / itemHeightPx).toInt()
                                if (offsetIndex != 0 && draggingIndex != -1) {
                                  val newIndex = (draggingIndex + offsetIndex).coerceIn(0, items.lastIndex)
                                  if (newIndex != draggingIndex) {
                                    val movedItem = items.removeAt(draggingIndex)
                                    items.add(newIndex, movedItem)
                                    draggingIndex = newIndex
                                    dragOffset -= offsetIndex * itemHeightPx
                                  }
                                }
                              }
                        }
                        .semantics { testTag = "draggable_item_${item.id}" },
                colors =
                    CardDefaults.cardColors(
                        containerColor =
                            if (isDragging) MaterialTheme.colorScheme.primaryContainer
                            else MaterialTheme.colorScheme.surfaceVariant)) {
                  Row(
                      modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp),
                      verticalAlignment = Alignment.CenterVertically,
                      horizontalArrangement = Arrangement.SpaceBetween) {
                        Text(text = item.label, fontSize = 14.sp, fontWeight = FontWeight.Medium)
                        Icon(
                            imageVector = Icons.Filled.TouchApp,
                            contentDescription = "Drag handle",
                            tint = MaterialTheme.colorScheme.primary)
                      }
                }
          }
        }
  }
}

@Composable
private fun CancelableLongPress() {
  val progress = remember { Animatable(0f) }
  var statusText by remember { mutableStateOf("Hold to confirm") }
  val requiredDurationMs = 1500
  val coroutineScope = rememberCoroutineScope()

  Card(
      modifier =
          Modifier.fillMaxWidth()
              .pointerInput(Unit) {
                detectTapGestures(
                    onPress = {
                      statusText = "Holding..."
                      progress.snapTo(0f)
                      val animation = coroutineScope.launch {
                        progress.animateTo(1f, tween(requiredDurationMs, easing = LinearEasing))
                      }

                      val released = tryAwaitRelease()
                      if (!released) {
                        animation.cancel()
                        progress.snapTo(0f)
                        statusText = "Cancelled"
                        return@detectTapGestures
                      }

                      if (progress.value >= 1f) {
                        statusText = "Confirmed"
                      } else {
                        animation.cancel()
                        progress.snapTo(0f)
                        statusText = "Cancelled"
                      }
                    })
              }
              .semantics { testTag = "cancelable_long_press" },
      colors =
          CardDefaults.cardColors(
              containerColor = MaterialTheme.colorScheme.surfaceVariant)) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(16.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(16.dp)) {
              Box(contentAlignment = Alignment.Center, modifier = Modifier.size(48.dp)) {
                CircularProgressIndicator(
                    progress = { progress.value },
                    modifier = Modifier.fillMaxSize(),
                    strokeWidth = 4.dp)
                Text(text = "${(progress.value * 100).roundToInt()}%", fontSize = 10.sp)
              }
              Column {
                Text(text = "Hold to confirm", fontSize = 16.sp, fontWeight = FontWeight.Medium)
                Text(text = statusText, fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
              }
            }
      }
}

@Preview(showBackground = true)
@Composable
fun PreviewLongPressScreen() {
  AutoMobileTheme { LongPressScreen() }
}
