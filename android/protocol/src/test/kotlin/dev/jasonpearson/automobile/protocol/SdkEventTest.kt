package dev.jasonpearson.automobile.protocol

import kotlinx.serialization.json.Json
import org.junit.jupiter.api.Test
import kotlin.test.assertEquals
import kotlin.test.assertIs
import kotlin.test.assertTrue

class SdkEventTest {
  private val json = Json {
    classDiscriminator = "type"
    ignoreUnknownKeys = true
    encodeDefaults = true
  }

  @Test
  fun `serialize navigation event`() {
    val event: SdkEvent = SdkNavigationEvent(
      timestamp = 1234567890L,
      applicationId = "com.example.app",
      destination = "home",
      source = NavigationSourceType.COMPOSE_NAVIGATION,
      arguments = mapOf("userId" to "123"),
      metadata = mapOf("screenType" to "main")
    )

    val encoded = json.encodeToString(SdkEvent.serializer(), event)

    assertTrue(encoded.contains(""""type":"navigation""""))
    assertTrue(encoded.contains(""""destination":"home""""))
    assertTrue(encoded.contains(""""source":"COMPOSE_NAVIGATION""""))
    assertTrue(encoded.contains(""""applicationId":"com.example.app""""))
  }

  @Test
  fun `deserialize navigation event`() {
    val message = """{
      "type": "navigation",
      "timestamp": 1234567890,
      "applicationId": "com.example.app",
      "destination": "profile",
      "source": "CIRCUIT",
      "arguments": {"userId": "456"}
    }"""

    val event = json.decodeFromString<SdkEvent>(message)

    assertIs<SdkNavigationEvent>(event)
    assertEquals("profile", event.destination)
    assertEquals(NavigationSourceType.CIRCUIT, event.source)
    assertEquals("com.example.app", event.applicationId)
    assertEquals("456", event.arguments?.get("userId"))
  }

  @Test
  fun `serialize handled exception event`() {
    val event: SdkEvent = SdkHandledExceptionEvent(
      timestamp = 1234567890L,
      applicationId = "com.example.app",
      exceptionClass = "java.lang.NullPointerException",
      exceptionMessage = "Value cannot be null",
      stackTrace = "at com.example.MyClass.method(MyClass.kt:42)",
      customMessage = "Failed to load user data",
      currentScreen = "profile",
      appVersion = "1.2.3",
      deviceInfo = SdkDeviceInfo(
        model = "Pixel 6",
        manufacturer = "Google",
        osVersion = "14",
        sdkInt = 34
      )
    )

    val encoded = json.encodeToString(SdkEvent.serializer(), event)

    assertTrue(encoded.contains(""""type":"handled_exception""""))
    assertTrue(encoded.contains(""""exceptionClass":"java.lang.NullPointerException""""))
    assertTrue(encoded.contains(""""customMessage":"Failed to load user data""""))
    assertTrue(encoded.contains(""""model":"Pixel 6""""))
  }

  @Test
  fun `deserialize handled exception event`() {
    val message = """{
      "type": "handled_exception",
      "timestamp": 1234567890,
      "applicationId": "com.example.app",
      "exceptionClass": "java.io.IOException",
      "exceptionMessage": "Network error",
      "stackTrace": "at com.example.Network.fetch(Network.kt:100)",
      "currentScreen": "settings"
    }"""

    val event = json.decodeFromString<SdkEvent>(message)

    assertIs<SdkHandledExceptionEvent>(event)
    assertEquals("java.io.IOException", event.exceptionClass)
    assertEquals("Network error", event.exceptionMessage)
    assertEquals("settings", event.currentScreen)
  }

  @Test
  fun `serialize notification action event`() {
    val event: SdkEvent = SdkNotificationActionEvent(
      timestamp = 1234567890L,
      applicationId = "com.example.app",
      notificationId = "notif_123",
      actionId = "reply",
      actionLabel = "Reply"
    )

    val encoded = json.encodeToString(SdkEvent.serializer(), event)

    assertTrue(encoded.contains(""""type":"notification_action""""))
    assertTrue(encoded.contains(""""notificationId":"notif_123""""))
    assertTrue(encoded.contains(""""actionId":"reply""""))
    assertTrue(encoded.contains(""""actionLabel":"Reply""""))
  }

  @Test
  fun `deserialize notification action event`() {
    val message = """{
      "type": "notification_action",
      "timestamp": 1234567890,
      "applicationId": "com.example.app",
      "notificationId": "notif_456",
      "actionId": "dismiss",
      "actionLabel": "Dismiss"
    }"""

    val event = json.decodeFromString<SdkEvent>(message)

    assertIs<SdkNotificationActionEvent>(event)
    assertEquals("notif_456", event.notificationId)
    assertEquals("dismiss", event.actionId)
  }

  @Test
  fun `serialize recomposition snapshot event`() {
    val event: SdkEvent = SdkRecompositionSnapshotEvent(
      timestamp = 1234567890L,
      applicationId = "com.example.app",
      snapshotJson = """{"composables":[{"name":"MyComposable","count":5}]}"""
    )

    val encoded = json.encodeToString(SdkEvent.serializer(), event)

    assertTrue(encoded.contains(""""type":"recomposition_snapshot""""))
    assertTrue(encoded.contains(""""snapshotJson":"""))
  }

  @Test
  fun `deserialize recomposition snapshot event`() {
    val message = """{
      "type": "recomposition_snapshot",
      "timestamp": 1234567890,
      "applicationId": "com.example.app",
      "snapshotJson": "{\"count\":10}"
    }"""

    val event = json.decodeFromString<SdkEvent>(message)

    assertIs<SdkRecompositionSnapshotEvent>(event)
    assertEquals("""{"count":10}""", event.snapshotJson)
  }

  @Test
  fun `all navigation sources are serializable`() {
    NavigationSourceType.entries.forEach { source ->
      val event: SdkEvent = SdkNavigationEvent(
        timestamp = 1234567890L,
        destination = "test",
        source = source
      )

      val encoded = json.encodeToString(SdkEvent.serializer(), event)
      val decoded = json.decodeFromString<SdkEvent>(encoded)

      assertIs<SdkNavigationEvent>(decoded)
      assertEquals(source, decoded.source)
    }
  }
}
