package com.zillow.automobile.discover

import android.content.res.Configuration
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Send
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.viewmodel.compose.viewModel
import coil3.compose.AsyncImage
import com.zillow.automobile.design.system.theme.AutoMobileTheme

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ChatScreen(viewModel: ChatViewModel = viewModel()) {
  val messages by viewModel.messages.collectAsState()
  val listState = rememberLazyListState()
  var messageText by remember { mutableStateOf("") }

  // Auto-scroll to bottom when new messages arrive
  LaunchedEffect(messages.size) {
    if (messages.isNotEmpty()) {
      listState.animateScrollToItem(messages.size - 1)
    }
  }

  Column(modifier = Modifier.fillMaxSize()) {
    // Chat Header
    TopAppBar(
        title = {
          Row(
              verticalAlignment = Alignment.CenterVertically,
              horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Box(
                    modifier =
                        Modifier.size(40.dp)
                            .clip(CircleShape)
                            .background(MaterialTheme.colorScheme.primary)) {
                      Text(
                          text = "AI",
                          color = MaterialTheme.colorScheme.onPrimary,
                          fontWeight = FontWeight.Bold,
                          modifier = Modifier.align(Alignment.Center))
                    }
                Column {
                  Text(text = "Chat Assistant", fontSize = 16.sp, fontWeight = FontWeight.Bold)
                  Text(
                      text = "Online",
                      fontSize = 12.sp,
                      color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
              }
        },
        actions = {
          Button(
              onClick = { viewModel.requestNewIncomingMessage() },
              modifier = Modifier.padding(end = 8.dp)) {
                Text("Request Message")
              }
        })

    // Messages List
    LazyColumn(
        state = listState,
        modifier = Modifier.weight(1f).fillMaxSize().padding(horizontal = 16.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp)) {
          item { Spacer(modifier = Modifier.height(8.dp)) }

          items(messages) { message ->
            MessageBubble(message = message, modifier = Modifier.fillMaxWidth())
          }

          item { Spacer(modifier = Modifier.height(16.dp)) }
        }

    // Animated Chat Input
    AnimatedChatInput(
        text = messageText,
        onTextChange = { messageText = it },
        onSendMessage = {
          if (messageText.isNotBlank()) {
            viewModel.addUserMessage(messageText)
            messageText = ""
          }
        },
        modifier = Modifier.fillMaxWidth())
  }
}

@Composable
fun MessageBubble(message: ChatMessage, modifier: Modifier = Modifier) {
  Row(
      modifier = modifier,
      horizontalArrangement =
          if (message.isFromUser) {
            Arrangement.End
          } else {
            Arrangement.Start
          }) {
        if (!message.isFromUser) {
          // Profile image for bot messages
          Box(
              modifier =
                  Modifier.size(32.dp)
                      .clip(CircleShape)
                      .background(MaterialTheme.colorScheme.secondaryContainer)) {
                if (message.profileImageUrl != null) {
                  AsyncImage(
                      model = message.profileImageUrl,
                      contentDescription = "Profile",
                      modifier = Modifier.fillMaxSize())
                } else {
                  Text(
                      text = "AI",
                      color = MaterialTheme.colorScheme.onSecondaryContainer,
                      fontSize = 12.sp,
                      fontWeight = FontWeight.Bold,
                      modifier = Modifier.align(Alignment.Center))
                }
              }
          Spacer(modifier = Modifier.width(8.dp))
        }

        // Message bubble
        Card(
            modifier = Modifier.weight(1f, fill = false),
            colors =
                CardDefaults.cardColors(
                    containerColor =
                        if (message.isFromUser) {
                          MaterialTheme.colorScheme.primary
                        } else {
                          MaterialTheme.colorScheme.surfaceVariant
                        }),
            shape =
                RoundedCornerShape(
                    topStart = 16.dp,
                    topEnd = 16.dp,
                    bottomStart = if (message.isFromUser) 16.dp else 4.dp,
                    bottomEnd = if (message.isFromUser) 4.dp else 16.dp)) {
              SelectionContainer {
                Text(
                    text = message.text,
                    color =
                        if (message.isFromUser) {
                          MaterialTheme.colorScheme.onPrimary
                        } else {
                          MaterialTheme.colorScheme.onSurfaceVariant
                        },
                    modifier = Modifier.padding(12.dp),
                    fontSize = 14.sp)
              }
            }

        if (message.isFromUser) {
          Spacer(modifier = Modifier.width(8.dp))
          // Profile image for user messages
          Box(
              modifier =
                  Modifier.size(32.dp)
                      .clip(CircleShape)
                      .background(MaterialTheme.colorScheme.primary)) {
                Text(
                    text = "You",
                    color = MaterialTheme.colorScheme.onPrimary,
                    fontSize = 10.sp,
                    fontWeight = FontWeight.Bold,
                    modifier = Modifier.align(Alignment.Center))
              }
        }
      }
}

@Composable
fun AnimatedChatInput(
    text: String,
    onTextChange: (String) -> Unit,
    onSendMessage: () -> Unit,
    modifier: Modifier = Modifier
) {
  val sendButtonAlpha by
      animateFloatAsState(
          targetValue = if (text.isNotBlank()) 1f else 0.3f,
          animationSpec = tween(200),
          label = "send_button_alpha")

  Surface(modifier = modifier, color = MaterialTheme.colorScheme.surface) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(16.dp),
        verticalAlignment = Alignment.Bottom,
        horizontalArrangement = Arrangement.spacedBy(8.dp)) {
          OutlinedTextField(
              value = text,
              onValueChange = onTextChange,
              placeholder = { Text("What do you want to say?") },
              modifier = Modifier.weight(1f),
              maxLines = 4,
              shape = RoundedCornerShape(24.dp))

          FloatingActionButton(
              onClick = onSendMessage,
              modifier = Modifier.size(56.dp).alpha(sendButtonAlpha),
              containerColor = MaterialTheme.colorScheme.primary) {
                Icon(
                    Icons.Filled.Send,
                    contentDescription = "Send message",
                    tint = MaterialTheme.colorScheme.onPrimary)
              }
        }
  }
}

@Preview(name = "Chat Screen", showBackground = true, uiMode = Configuration.UI_MODE_NIGHT_NO)
@Preview(
    name = "Chat Screen - Dark", showBackground = true, uiMode = Configuration.UI_MODE_NIGHT_YES)
@Composable
fun PreviewChatScreen() {
  val isDarkMode =
      when (LocalConfiguration.current.uiMode and Configuration.UI_MODE_NIGHT_MASK) {
        Configuration.UI_MODE_NIGHT_YES -> true
        else -> false
      }

  AutoMobileTheme(darkTheme = isDarkMode) {
    Column(modifier = Modifier.background(MaterialTheme.colorScheme.background)) { ChatScreen() }
  }
}

@Preview(name = "Message Bubble", showBackground = true, uiMode = Configuration.UI_MODE_NIGHT_NO)
@Preview(
    name = "Message Bubble - Dark", showBackground = true, uiMode = Configuration.UI_MODE_NIGHT_YES)
@Composable
fun PreviewMessageBubble() {
  val isDarkMode =
      when (LocalConfiguration.current.uiMode and Configuration.UI_MODE_NIGHT_MASK) {
        Configuration.UI_MODE_NIGHT_YES -> true
        else -> false
      }

  AutoMobileTheme(darkTheme = isDarkMode) {
    Column(
        modifier = Modifier.background(MaterialTheme.colorScheme.background).padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp)) {
          MessageBubble(
              message =
                  ChatMessage(
                      id = "1",
                      text =
                          "Hello! This is a message from the bot. It can be quite long to show how the bubble adapts to different text lengths.",
                      isFromUser = false))
          MessageBubble(
              message =
                  ChatMessage(id = "2", text = "This is my response as a user!", isFromUser = true))
        }
  }
}

@Preview(
    name = "Chat Screen - Keyboard Open",
    showBackground = true,
    uiMode = Configuration.UI_MODE_NIGHT_NO)
@Preview(
    name = "Chat Screen - Keyboard Open - Dark",
    showBackground = true,
    uiMode = Configuration.UI_MODE_NIGHT_YES)
@Composable
fun PreviewChatScreenKeyboardOpen() {
  val isDarkMode =
      when (LocalConfiguration.current.uiMode and Configuration.UI_MODE_NIGHT_MASK) {
        Configuration.UI_MODE_NIGHT_YES -> true
        else -> false
      }

  AutoMobileTheme(darkTheme = isDarkMode) {
    Box(modifier = Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)) {
      ChatScreen()

      // Simulate keyboard overlay
      Box(
          modifier =
              Modifier.fillMaxWidth()
                  .height(240.dp)
                  .align(Alignment.BottomCenter)
                  .background(MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.95f))) {
            Text(
                text = "Keyboard Area",
                modifier = Modifier.align(Alignment.Center),
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                fontSize = 12.sp)
          }
    }
  }
}
