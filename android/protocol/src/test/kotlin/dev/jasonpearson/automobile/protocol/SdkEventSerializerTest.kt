package dev.jasonpearson.automobile.protocol

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertIs
import kotlin.test.assertNotNull
import kotlin.test.assertNull

class SdkEventSerializerTest {

  @Test
  fun `toJson and fromJson roundtrip for navigation event`() {
    val event = SdkNavigationEvent(
      timestamp = 1234567890L,
      applicationId = "com.example.app",
      destination = "/home",
      source = NavigationSourceType.COMPOSE_NAVIGATION,
      arguments = mapOf("id" to "123", "name" to "test"),
      metadata = mapOf("tag" to "main"),
    )

    val json = SdkEventSerializer.toJson(event)
    val deserialized = SdkEventSerializer.fromJson(json)

    assertNotNull(deserialized)
    assertIs<SdkNavigationEvent>(deserialized)
    assertEquals(event.timestamp, deserialized.timestamp)
    assertEquals(event.applicationId, deserialized.applicationId)
    assertEquals(event.destination, deserialized.destination)
    assertEquals(event.source, deserialized.source)
    assertEquals(event.arguments, deserialized.arguments)
    assertEquals(event.metadata, deserialized.metadata)
  }

  @Test
  fun `toJson and fromJson roundtrip for handled exception event`() {
    val event = SdkHandledExceptionEvent(
      timestamp = 1234567890L,
      applicationId = "com.example.app",
      exceptionClass = "java.lang.NullPointerException",
      exceptionMessage = "Object reference is null",
      stackTrace = "at com.example.MyClass.method(MyClass.kt:42)",
      customMessage = "Custom context message",
      currentScreen = "/home",
      appVersion = "1.0.0",
      deviceInfo = SdkDeviceInfo(
        model = "Pixel 6",
        manufacturer = "Google",
        osVersion = "13",
        sdkInt = 33,
      ),
    )

    val json = SdkEventSerializer.toJson(event)
    val deserialized = SdkEventSerializer.fromJson(json)

    assertNotNull(deserialized)
    assertIs<SdkHandledExceptionEvent>(deserialized)
    assertEquals(event.timestamp, deserialized.timestamp)
    assertEquals(event.applicationId, deserialized.applicationId)
    assertEquals(event.exceptionClass, deserialized.exceptionClass)
    assertEquals(event.exceptionMessage, deserialized.exceptionMessage)
    assertEquals(event.stackTrace, deserialized.stackTrace)
    assertEquals(event.customMessage, deserialized.customMessage)
    assertEquals(event.currentScreen, deserialized.currentScreen)
    assertEquals(event.appVersion, deserialized.appVersion)
    assertEquals(event.deviceInfo, deserialized.deviceInfo)
  }

  @Test
  fun `toJson and fromJson roundtrip for notification action event`() {
    val event = SdkNotificationActionEvent(
      timestamp = 1234567890L,
      applicationId = "com.example.app",
      notificationId = "notif-123",
      actionId = "action-reply",
      actionLabel = "Reply",
    )

    val json = SdkEventSerializer.toJson(event)
    val deserialized = SdkEventSerializer.fromJson(json)

    assertNotNull(deserialized)
    assertIs<SdkNotificationActionEvent>(deserialized)
    assertEquals(event.timestamp, deserialized.timestamp)
    assertEquals(event.applicationId, deserialized.applicationId)
    assertEquals(event.notificationId, deserialized.notificationId)
    assertEquals(event.actionId, deserialized.actionId)
    assertEquals(event.actionLabel, deserialized.actionLabel)
  }

  @Test
  fun `toJson and fromJson roundtrip for recomposition snapshot event`() {
    val event = SdkRecompositionSnapshotEvent(
      timestamp = 1234567890L,
      applicationId = "com.example.app",
      snapshotJson = """{"composables": []}""",
    )

    val json = SdkEventSerializer.toJson(event)
    val deserialized = SdkEventSerializer.fromJson(json)

    assertNotNull(deserialized)
    assertIs<SdkRecompositionSnapshotEvent>(deserialized)
    assertEquals(event.timestamp, deserialized.timestamp)
    assertEquals(event.applicationId, deserialized.applicationId)
    assertEquals(event.snapshotJson, deserialized.snapshotJson)
  }

  @Test
  fun `fromJson returns null for invalid json`() {
    val result = SdkEventSerializer.fromJson("not valid json")
    assertNull(result)
  }

  @Test
  fun `fromJson returns null for empty string`() {
    val result = SdkEventSerializer.fromJson("")
    assertNull(result)
  }

  @Test
  fun `getEventType returns correct type for each event`() {
    assertEquals(
      SdkEventSerializer.EventTypes.NAVIGATION,
      SdkEventSerializer.getEventType(
        SdkNavigationEvent(
          timestamp = 0L,
          destination = "",
          source = NavigationSourceType.CUSTOM,
        ),
      ),
    )
    assertEquals(
      SdkEventSerializer.EventTypes.HANDLED_EXCEPTION,
      SdkEventSerializer.getEventType(
        SdkHandledExceptionEvent(
          timestamp = 0L,
          exceptionClass = "",
          exceptionMessage = null,
          stackTrace = "",
        ),
      ),
    )
    assertEquals(
      SdkEventSerializer.EventTypes.NOTIFICATION_ACTION,
      SdkEventSerializer.getEventType(
        SdkNotificationActionEvent(
          timestamp = 0L,
          notificationId = "",
          actionId = "",
          actionLabel = "",
        ),
      ),
    )
    assertEquals(
      SdkEventSerializer.EventTypes.RECOMPOSITION_SNAPSHOT,
      SdkEventSerializer.getEventType(
        SdkRecompositionSnapshotEvent(
          timestamp = 0L,
          snapshotJson = "",
        ),
      ),
    )
  }

  @Test
  fun `navigationEventFromJson returns event for valid navigation json`() {
    val event = SdkNavigationEvent(
      timestamp = 1234567890L,
      destination = "/home",
      source = NavigationSourceType.COMPOSE_NAVIGATION,
    )
    val json = SdkEventSerializer.toJson(event)

    val result = SdkEventSerializer.navigationEventFromJson(json)

    assertNotNull(result)
    assertEquals(event.destination, result.destination)
  }

  @Test
  fun `navigationEventFromJson returns null for non-navigation json`() {
    val event = SdkHandledExceptionEvent(
      timestamp = 0L,
      exceptionClass = "Exception",
      exceptionMessage = null,
      stackTrace = "",
    )
    val json = SdkEventSerializer.toJson(event)

    val result = SdkEventSerializer.navigationEventFromJson(json)

    assertNull(result)
  }

  @Test
  fun `handledExceptionEventFromJson returns event for valid exception json`() {
    val event = SdkHandledExceptionEvent(
      timestamp = 1234567890L,
      exceptionClass = "java.lang.Exception",
      exceptionMessage = "Test error",
      stackTrace = "at Test.method(Test.kt:1)",
    )
    val json = SdkEventSerializer.toJson(event)

    val result = SdkEventSerializer.handledExceptionEventFromJson(json)

    assertNotNull(result)
    assertEquals(event.exceptionClass, result.exceptionClass)
  }

  @Test
  fun `navigation event with null optional fields serializes correctly`() {
    val event = SdkNavigationEvent(
      timestamp = 1234567890L,
      applicationId = null,
      destination = "/home",
      source = NavigationSourceType.CUSTOM,
      arguments = null,
      metadata = null,
    )

    val json = SdkEventSerializer.toJson(event)
    val deserialized = SdkEventSerializer.fromJson(json)

    assertNotNull(deserialized)
    assertIs<SdkNavigationEvent>(deserialized)
    assertNull(deserialized.applicationId)
    assertNull(deserialized.arguments)
    assertNull(deserialized.metadata)
  }
}
