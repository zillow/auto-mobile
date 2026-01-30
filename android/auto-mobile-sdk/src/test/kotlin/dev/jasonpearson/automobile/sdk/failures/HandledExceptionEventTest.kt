package dev.jasonpearson.automobile.sdk.failures

import org.junit.Assert.*
import org.junit.Test

class HandledExceptionEventTest {

    @Test
    fun `DeviceInfo should have correct properties`() {
        val deviceInfo = DeviceInfo(
            model = "Pixel 6",
            manufacturer = "Google",
            osVersion = "14",
            sdkInt = 34,
        )

        assertEquals("Pixel 6", deviceInfo.model)
        assertEquals("Google", deviceInfo.manufacturer)
        assertEquals("14", deviceInfo.osVersion)
        assertEquals(34, deviceInfo.sdkInt)
    }

    @Test
    fun `DeviceInfo should support equality`() {
        val info1 = DeviceInfo(
            model = "Pixel 6",
            manufacturer = "Google",
            osVersion = "14",
            sdkInt = 34,
        )

        val info2 = DeviceInfo(
            model = "Pixel 6",
            manufacturer = "Google",
            osVersion = "14",
            sdkInt = 34,
        )

        assertEquals(info1, info2)
        assertEquals(info1.hashCode(), info2.hashCode())
    }

    @Test
    fun `DeviceInfo should support copy`() {
        val original = DeviceInfo(
            model = "Pixel 6",
            manufacturer = "Google",
            osVersion = "14",
            sdkInt = 34,
        )

        val copied = original.copy(model = "Pixel 7")

        assertEquals("Pixel 7", copied.model)
        assertEquals(original.manufacturer, copied.manufacturer)
        assertEquals(original.osVersion, copied.osVersion)
        assertEquals(original.sdkInt, copied.sdkInt)
    }

    @Test
    fun `HandledExceptionEvent should have correct properties`() {
        val deviceInfo = DeviceInfo(
            model = "Pixel 6",
            manufacturer = "Google",
            osVersion = "14",
            sdkInt = 34,
        )

        val event = HandledExceptionEvent(
            timestamp = 1234567890L,
            exceptionClass = "java.lang.NullPointerException",
            exceptionMessage = "Cannot invoke method on null",
            stackTrace = "at com.example.MyClass.myMethod(MyClass.kt:42)",
            customMessage = "Error in user flow",
            currentScreen = "HomeScreen",
            packageName = "com.example.app",
            appVersion = "1.0.0",
            deviceInfo = deviceInfo,
        )

        assertEquals(1234567890L, event.timestamp)
        assertEquals("java.lang.NullPointerException", event.exceptionClass)
        assertEquals("Cannot invoke method on null", event.exceptionMessage)
        assertEquals("at com.example.MyClass.myMethod(MyClass.kt:42)", event.stackTrace)
        assertEquals("Error in user flow", event.customMessage)
        assertEquals("HomeScreen", event.currentScreen)
        assertEquals("com.example.app", event.packageName)
        assertEquals("1.0.0", event.appVersion)
        assertEquals(deviceInfo, event.deviceInfo)
    }

    @Test
    fun `HandledExceptionEvent should support nullable fields`() {
        val deviceInfo = DeviceInfo(
            model = "Pixel 6",
            manufacturer = "Google",
            osVersion = "14",
            sdkInt = 34,
        )

        val event = HandledExceptionEvent(
            timestamp = 1234567890L,
            exceptionClass = "java.lang.RuntimeException",
            exceptionMessage = null,
            stackTrace = "at com.example.Test(Test.kt:1)",
            customMessage = null,
            currentScreen = null,
            packageName = "com.example.app",
            appVersion = null,
            deviceInfo = deviceInfo,
        )

        assertNull(event.exceptionMessage)
        assertNull(event.customMessage)
        assertNull(event.currentScreen)
        assertNull(event.appVersion)
    }

    @Test
    fun `HandledExceptionEvent should support equality`() {
        val deviceInfo = DeviceInfo(
            model = "Pixel 6",
            manufacturer = "Google",
            osVersion = "14",
            sdkInt = 34,
        )

        val event1 = HandledExceptionEvent(
            timestamp = 1234567890L,
            exceptionClass = "java.lang.NullPointerException",
            exceptionMessage = "Test message",
            stackTrace = "stack trace",
            customMessage = "custom",
            currentScreen = "Screen",
            packageName = "com.example.app",
            appVersion = "1.0.0",
            deviceInfo = deviceInfo,
        )

        val event2 = HandledExceptionEvent(
            timestamp = 1234567890L,
            exceptionClass = "java.lang.NullPointerException",
            exceptionMessage = "Test message",
            stackTrace = "stack trace",
            customMessage = "custom",
            currentScreen = "Screen",
            packageName = "com.example.app",
            appVersion = "1.0.0",
            deviceInfo = deviceInfo,
        )

        assertEquals(event1, event2)
        assertEquals(event1.hashCode(), event2.hashCode())
    }

    @Test
    fun `HandledExceptionEvent should support copy`() {
        val deviceInfo = DeviceInfo(
            model = "Pixel 6",
            manufacturer = "Google",
            osVersion = "14",
            sdkInt = 34,
        )

        val original = HandledExceptionEvent(
            timestamp = 1234567890L,
            exceptionClass = "java.lang.NullPointerException",
            exceptionMessage = "Test message",
            stackTrace = "stack trace",
            customMessage = "custom",
            currentScreen = "Screen1",
            packageName = "com.example.app",
            appVersion = "1.0.0",
            deviceInfo = deviceInfo,
        )

        val copied = original.copy(currentScreen = "Screen2")

        assertEquals("Screen2", copied.currentScreen)
        assertEquals(original.timestamp, copied.timestamp)
        assertEquals(original.exceptionClass, copied.exceptionClass)
    }
}
