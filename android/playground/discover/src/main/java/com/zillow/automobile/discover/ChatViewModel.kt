package com.zillow.automobile.discover

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import java.util.concurrent.atomic.AtomicLong
import kotlin.random.Random
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

data class ChatMessage(
    val id: String,
    val text: String,
    val isFromUser: Boolean,
    val timestamp: Long = System.currentTimeMillis(),
    val profileImageUrl: String? = null
)

class ChatViewModel : ViewModel() {
  private val messageIdCounter = AtomicLong(3) // Start after initial messages

  private val _messages =
      MutableStateFlow<List<ChatMessage>>(
          listOf(
              ChatMessage(
                  id = "1",
                  text =
                      "Hello! Welcome to the chat screen. This is an example of a realistic chat interface.",
                  isFromUser = false,
                  profileImageUrl = null),
              ChatMessage(
                  id = "2",
                  text = "You can type messages and they will appear here. Try sending a message!",
                  isFromUser = false,
                  profileImageUrl = null)))
  val messages: StateFlow<List<ChatMessage>> = _messages.asStateFlow()

  private val botResponses =
      listOf(
          "That's interesting! Tell me more.",
          "I see what you mean.",
          "Thanks for sharing that with me.",
          "How do you feel about that?",
          "What do you think about this topic?",
          "That sounds great!",
          "I understand your perspective.",
          "Could you elaborate on that?",
          "That's a good point.",
          "I appreciate you telling me this.")

  private fun generateUniqueId(): String {
    return "${System.currentTimeMillis()}-${messageIdCounter.getAndIncrement()}"
  }

  fun addUserMessage(text: String) {
    if (text.isBlank()) return

    val userMessage = ChatMessage(id = generateUniqueId(), text = text.trim(), isFromUser = true)

    _messages.value = _messages.value + userMessage

    // Simulate bot response after a delay
    viewModelScope.launch {
      delay(1000L + Random.nextLong(2001L)) // Random delay between 1-3 seconds
      addBotMessage()
    }
  }

  fun requestNewIncomingMessage() {
    viewModelScope.launch {
      delay(500L)
      addBotMessage()
    }
  }

  private fun addBotMessage() {
    val botMessage =
        ChatMessage(
            id = generateUniqueId(),
            text = botResponses[Random.nextInt(botResponses.size)],
            isFromUser = false,
            profileImageUrl = null)

    _messages.value = _messages.value + botMessage
  }
}
