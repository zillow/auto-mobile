package com.zillow.automobile.discover

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class ChatViewModelTest {

  private val testDispatcher = StandardTestDispatcher()
  private lateinit var viewModel: ChatViewModel

  @Before
  fun setup() {
    Dispatchers.setMain(testDispatcher)
    viewModel = ChatViewModel()
  }

  @After
  fun tearDown() {
    Dispatchers.resetMain()
  }

  @Test
  fun `initial messages are loaded correctly`() = runTest {
    val messages = viewModel.messages.value

    assertEquals(2, messages.size)
    assertFalse("First message should be from bot", messages[0].isFromUser)
    assertFalse("Second message should be from bot", messages[1].isFromUser)
    assertTrue("First message should contain welcome text", messages[0].text.contains("Welcome"))
  }

  @Test
  fun `addUserMessage adds user message correctly`() = runTest {
    val testMessage = "Hello, this is a test message"

    viewModel.addUserMessage(testMessage)

    val messages = viewModel.messages.value
    val lastMessage = messages.last()

    assertTrue("Last message should be from user", lastMessage.isFromUser)
    assertEquals("Message text should match", testMessage, lastMessage.text)
    assertEquals("Should have 3 messages (2 initial + 1 user)", 3, messages.size)
  }

  @Test
  fun `addUserMessage trims whitespace`() = runTest {
    val testMessage = "  Hello with spaces  "

    viewModel.addUserMessage(testMessage)

    val messages = viewModel.messages.value
    val lastMessage = messages.last()

    assertEquals("Message should be trimmed", "Hello with spaces", lastMessage.text)
  }

  @Test
  fun `addUserMessage ignores blank messages`() = runTest {
    val initialCount = viewModel.messages.value.size

    viewModel.addUserMessage("")
    viewModel.addUserMessage("   ")
    viewModel.addUserMessage("\n\t")

    val finalCount = viewModel.messages.value.size
    assertEquals("Should not add blank messages", initialCount, finalCount)
  }

  @Test
  fun `addUserMessage triggers bot response after delay`() = runTest {
    val initialCount = viewModel.messages.value.size

    viewModel.addUserMessage("Test message")

    // Advance time to trigger bot response
    advanceTimeBy(4000L) // More than max delay (3000ms)

    val messages = viewModel.messages.value
    assertEquals("Should have user message + bot response", initialCount + 2, messages.size)

    val userMessage = messages[messages.size - 2]
    val botMessage = messages[messages.size - 1]

    assertTrue("Second to last should be user message", userMessage.isFromUser)
    assertFalse("Last should be bot message", botMessage.isFromUser)
  }

  @Test
  fun `requestNewIncomingMessage adds bot message`() = runTest {
    val initialCount = viewModel.messages.value.size

    viewModel.requestNewIncomingMessage()

    // Advance time to trigger bot response
    advanceTimeBy(1000L)

    val messages = viewModel.messages.value
    assertEquals("Should have one additional bot message", initialCount + 1, messages.size)

    val lastMessage = messages.last()
    assertFalse("New message should be from bot", lastMessage.isFromUser)
  }

  @Test
  fun `bot responses are from predefined list`() = runTest {
    val botResponses =
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

    viewModel.addUserMessage("Test message")
    advanceTimeBy(4000L)

    val messages = viewModel.messages.value
    val botMessage = messages.last()

    assertTrue(
        "Bot response should be from predefined list", botResponses.contains(botMessage.text))
  }

  @Test
  fun `message IDs are unique`() = runTest {
    // Get initial messages count
    val initialMessages = viewModel.messages.value
    val initialCount = initialMessages.size

    viewModel.addUserMessage("Message 1")
    // Small delay to ensure different timestamps
    advanceTimeBy(100L)

    viewModel.addUserMessage("Message 2")

    advanceTimeBy(4000L)

    val messages = viewModel.messages.value
    val messageIds = messages.map { it.id }
    val uniqueIds = messageIds.toSet()

    assertEquals("All message IDs should be unique", messageIds.size, uniqueIds.size)
    // Should have initial messages + 2 user messages + 2 bot responses
    assertEquals("Should have expected number of messages", initialCount + 4, messages.size)
  }

  @Test
  fun `user messages have correct timestamp`() = runTest {
    val beforeTime = System.currentTimeMillis()

    viewModel.addUserMessage("Test message")

    val afterTime = System.currentTimeMillis()
    val messages = viewModel.messages.value
    val userMessage = messages.last()

    assertTrue(
        "Message timestamp should be within expected range",
        userMessage.timestamp in beforeTime..afterTime)
  }
}
