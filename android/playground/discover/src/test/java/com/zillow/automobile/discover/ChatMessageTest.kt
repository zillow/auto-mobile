package com.zillow.automobile.discover

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class ChatMessageTest {

  @Test
  fun `creates message with all properties`() {
    val message = ChatMessage(
      id = "test-id",
      text = "Test message",
      isFromUser = true,
      timestamp = 1234567890L,
      profileImageUrl = "https://example.com/profile.jpg"
    )

    assertEquals("test-id", message.id)
    assertEquals("Test message", message.text)
    assertTrue(message.isFromUser)
    assertEquals(1234567890L, message.timestamp)
    assertEquals("https://example.com/profile.jpg", message.profileImageUrl)
  }

  @Test
  fun `creates message with default timestamp`() {
    val beforeTime = System.currentTimeMillis()

    val message = ChatMessage(
      id = "test-id",
      text = "Test message",
      isFromUser = false
    )

    val afterTime = System.currentTimeMillis()

    assertEquals("test-id", message.id)
    assertEquals("Test message", message.text)
    assertFalse(message.isFromUser)
    assertTrue(
      "Timestamp should be within expected range",
      message.timestamp in beforeTime..afterTime
    )
    assertNull("Profile image should be null by default", message.profileImageUrl)
  }

  @Test
  fun `creates user message`() {
    val message = ChatMessage(
      id = "user-1",
      text = "Hello from user",
      isFromUser = true
    )

    assertTrue("Should be from user", message.isFromUser)
    assertEquals("Hello from user", message.text)
  }

  @Test
  fun `creates bot message`() {
    val message = ChatMessage(
      id = "bot-1",
      text = "Hello from bot",
      isFromUser = false,
      profileImageUrl = "https://bot.com/avatar.png"
    )

    assertFalse("Should be from bot", message.isFromUser)
    assertEquals("Hello from bot", message.text)
    assertEquals("https://bot.com/avatar.png", message.profileImageUrl)
  }

  @Test
  fun `data class equality works correctly`() {
    val message1 = ChatMessage(
      id = "same-id",
      text = "Same message",
      isFromUser = true,
      timestamp = 1000L
    )

    val message2 = ChatMessage(
      id = "same-id",
      text = "Same message",
      isFromUser = true,
      timestamp = 1000L
    )

    val message3 = ChatMessage(
      id = "different-id",
      text = "Same message",
      isFromUser = true,
      timestamp = 1000L
    )

    assertEquals("Messages with same content should be equal", message1, message2)
    assertEquals("Hash codes should be equal", message1.hashCode(), message2.hashCode())
    assertTrue("Messages with different IDs should not be equal", message1 != message3)
  }

  @Test
  fun `toString contains all properties`() {
    val message = ChatMessage(
      id = "test-id",
      text = "Test message",
      isFromUser = true,
      timestamp = 1234567890L,
      profileImageUrl = "https://example.com/profile.jpg"
    )

    val toString = message.toString()

    assertTrue("toString should contain id", toString.contains("test-id"))
    assertTrue("toString should contain text", toString.contains("Test message"))
    assertTrue("toString should contain isFromUser", toString.contains("true"))
    assertTrue("toString should contain timestamp", toString.contains("1234567890"))
    assertTrue(
      "toString should contain profileImageUrl",
      toString.contains("https://example.com/profile.jpg")
    )
  }
}
