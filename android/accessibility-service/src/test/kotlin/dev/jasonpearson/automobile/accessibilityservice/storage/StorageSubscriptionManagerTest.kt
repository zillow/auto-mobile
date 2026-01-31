package dev.jasonpearson.automobile.accessibilityservice.storage

import android.content.ContentResolver
import android.content.Context
import android.net.Uri
import android.os.Bundle
import io.mockk.every
import io.mockk.mockk
import io.mockk.verify
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class StorageSubscriptionManagerTest {

  private lateinit var context: Context
  private lateinit var contentResolver: ContentResolver
  private lateinit var manager: StorageSubscriptionManager

  @Before
  fun setUp() {
    contentResolver = mockk(relaxed = true)
    context = mockk(relaxed = true)
    every { context.contentResolver } returns contentResolver
    manager = StorageSubscriptionManager(context)
  }

  // ================= SDK Availability Tests =================

  @Test
  fun `checkSdkAvailability returns failure when SDK not installed`() {
    every { contentResolver.call(any<Uri>(), any(), any(), any()) } returns null

    val result = manager.checkSdkAvailability("com.example.app")

    assertTrue(result.isFailure)
    assertTrue(result.exceptionOrNull() is StorageError.SdkNotInstalled)
  }

  @Test
  fun `checkSdkAvailability returns failure when inspection disabled`() {
    val bundle =
        Bundle().apply {
          putBoolean("success", false)
          putString("errorType", "DISABLED")
          putString("error", "Inspection is disabled")
        }
    every { contentResolver.call(any<Uri>(), eq("checkAvailability"), any(), any()) } returns bundle

    val result = manager.checkSdkAvailability("com.example.app")

    assertTrue(result.isFailure)
    assertTrue(result.exceptionOrNull() is StorageError.InspectionDisabled)
  }

  @Test
  fun `checkSdkAvailability returns success with version info`() {
    val bundle =
        Bundle().apply {
          putBoolean("success", true)
          // Response uses kotlinx.serialization sealed class format with type discriminator
          putString("result", """{"type":"availability","available":true,"version":1}""")
        }
    every { contentResolver.call(any<Uri>(), eq("checkAvailability"), any(), any()) } returns bundle

    val result = manager.checkSdkAvailability("com.example.app")

    assertTrue(result.isSuccess)
    val info = result.getOrNull()!!
    assertTrue(info.available)
    assertEquals(1, info.version)
  }

  // ================= List Preference Files Tests =================

  @Test
  fun `listPreferenceFiles returns files on success`() {
    val bundle =
        Bundle().apply {
          putBoolean("success", true)
          // Response uses kotlinx.serialization sealed class format with type discriminator
          putString(
              "result",
              """{"type":"files","files":[{"name":"auth","path":"/data/auth.xml","entryCount":5},{"name":"settings","path":"/data/settings.xml","entryCount":3}]}""",
          )
        }
    every { contentResolver.call(any<Uri>(), eq("listFiles"), any(), any()) } returns bundle

    val result = manager.listPreferenceFiles("com.example.app")

    assertTrue(result.isSuccess)
    val files = result.getOrNull()!!
    assertEquals(2, files.size)
    assertEquals("auth", files[0].name)
    assertEquals(5, files[0].entryCount)
    assertEquals("settings", files[1].name)
    assertEquals(3, files[1].entryCount)
  }

  @Test
  fun `listPreferenceFiles returns failure when SDK not installed`() {
    every { contentResolver.call(any<Uri>(), eq("listFiles"), any(), any()) } returns null

    val result = manager.listPreferenceFiles("com.example.app")

    assertTrue(result.isFailure)
    assertTrue(result.exceptionOrNull() is StorageError.SdkNotInstalled)
  }

  // ================= Get Preferences Tests =================

  @Test
  fun `getPreferences returns entries on success`() {
    val bundle =
        Bundle().apply {
          putBoolean("success", true)
          // Response uses kotlinx.serialization sealed class format with type discriminator
          putString(
              "result",
              """{"type":"preferences","entries":[{"key":"username","value":"john","type":"STRING"},{"key":"count","value":"42","type":"INT"}]}""",
          )
        }
    every { contentResolver.call(any<Uri>(), eq("getPreferences"), any(), any()) } returns bundle

    val result = manager.getPreferences("com.example.app", "auth")

    assertTrue(result.isSuccess)
    val entries = result.getOrNull()!!
    assertEquals(2, entries.size)
    assertEquals("username", entries[0].key)
    assertEquals("john", entries[0].value)
    assertEquals("STRING", entries[0].type)
    assertEquals("count", entries[1].key)
    assertEquals("42", entries[1].value)
    assertEquals("INT", entries[1].type)
  }

  @Test
  fun `getPreferences returns failure for missing file`() {
    val bundle =
        Bundle().apply {
          putBoolean("success", false)
          putString("errorType", "FileNotFound")
          putString("error", "File not found")
        }
    every { contentResolver.call(any<Uri>(), eq("getPreferences"), any(), any()) } returns bundle

    val result = manager.getPreferences("com.example.app", "nonexistent")

    assertTrue(result.isFailure)
    assertTrue(result.exceptionOrNull() is StorageError.FileNotFound)
  }

  // ================= Subscribe Tests =================

  @Test
  fun `subscribe returns subscription on success`() {
    val bundle =
        Bundle().apply {
          putBoolean("success", true)
          putString("result", """{"fileName":"auth","subscribed":true}""")
        }
    every { contentResolver.call(any<Uri>(), eq("subscribeToFile"), any(), any()) } returns bundle

    val result = manager.subscribe("com.example.app", "auth")

    assertTrue(result.isSuccess)
    val subscription = result.getOrNull()!!
    assertEquals("com.example.app", subscription.packageName)
    assertEquals("auth", subscription.fileName)
    assertEquals("com.example.app:auth", subscription.subscriptionId)
  }

  @Test
  fun `subscribe returns same subscription when already subscribed`() {
    val bundle =
        Bundle().apply {
          putBoolean("success", true)
          putString("result", """{"fileName":"auth","subscribed":true}""")
        }
    every { contentResolver.call(any<Uri>(), eq("subscribeToFile"), any(), any()) } returns bundle

    // Subscribe twice
    val result1 = manager.subscribe("com.example.app", "auth")
    val result2 = manager.subscribe("com.example.app", "auth")

    assertTrue(result1.isSuccess)
    assertTrue(result2.isSuccess)
    assertEquals(result1.getOrNull()?.subscriptionId, result2.getOrNull()?.subscriptionId)

    // Should only call SDK once since second subscribe reuses existing
    verify(exactly = 1) { contentResolver.call(any<Uri>(), eq("subscribeToFile"), any(), any()) }
  }

  @Test
  fun `subscribe registers ContentObserver`() {
    val bundle =
        Bundle().apply {
          putBoolean("success", true)
          putString("result", """{"fileName":"auth","subscribed":true}""")
        }
    every { contentResolver.call(any<Uri>(), eq("subscribeToFile"), any(), any()) } returns bundle

    manager.subscribe("com.example.app", "auth")

    verify {
      contentResolver.registerContentObserver(
          match { it.toString().contains("com.example.app.automobile.sharedprefs") },
          any(),
          any(),
      )
    }
  }

  // ================= Unsubscribe Tests =================

  @Test
  fun `unsubscribe returns true when subscribed`() {
    val subscribeBundle =
        Bundle().apply {
          putBoolean("success", true)
          putString("result", """{"fileName":"auth","subscribed":true}""")
        }
    every { contentResolver.call(any<Uri>(), eq("subscribeToFile"), any(), any()) } returns
        subscribeBundle
    every { contentResolver.call(any<Uri>(), eq("unsubscribeFromFile"), any(), any()) } returns
        Bundle()

    manager.subscribe("com.example.app", "auth")
    val result = manager.unsubscribe("com.example.app", "auth")

    assertTrue(result)
  }

  @Test
  fun `unsubscribe returns false when not subscribed`() {
    val result = manager.unsubscribe("com.example.app", "nonexistent")

    assertFalse(result)
  }

  @Test
  fun `unsubscribe unregisters ContentObserver when no more subscriptions for package`() {
    val subscribeBundle =
        Bundle().apply {
          putBoolean("success", true)
          putString("result", """{"subscribed":true}""")
        }
    every { contentResolver.call(any<Uri>(), eq("subscribeToFile"), any(), any()) } returns
        subscribeBundle
    every { contentResolver.call(any<Uri>(), eq("unsubscribeFromFile"), any(), any()) } returns
        Bundle()

    manager.subscribe("com.example.app", "auth")
    manager.unsubscribe("com.example.app", "auth")

    verify { contentResolver.unregisterContentObserver(any()) }
  }

  // ================= Active Subscriptions Tests =================

  @Test
  fun `getActiveSubscriptions returns empty list initially`() {
    val subscriptions = manager.getActiveSubscriptions()

    assertTrue(subscriptions.isEmpty())
  }

  @Test
  fun `getActiveSubscriptions returns all active subscriptions`() {
    val bundle =
        Bundle().apply {
          putBoolean("success", true)
          putString("result", """{"subscribed":true}""")
        }
    every { contentResolver.call(any<Uri>(), eq("subscribeToFile"), any(), any()) } returns bundle

    manager.subscribe("com.example.app1", "auth")
    manager.subscribe("com.example.app2", "settings")

    val subscriptions = manager.getActiveSubscriptions()

    assertEquals(2, subscriptions.size)
    assertTrue(subscriptions.any { it.subscriptionId == "com.example.app1:auth" })
    assertTrue(subscriptions.any { it.subscriptionId == "com.example.app2:settings" })
  }

  // ================= Destroy Tests =================

  @Test
  fun `destroy clears all subscriptions`() {
    val subscribeBundle =
        Bundle().apply {
          putBoolean("success", true)
          putString("result", """{"subscribed":true}""")
        }
    every { contentResolver.call(any<Uri>(), eq("subscribeToFile"), any(), any()) } returns
        subscribeBundle
    every { contentResolver.call(any<Uri>(), eq("unsubscribeFromFile"), any(), any()) } returns
        Bundle()

    manager.subscribe("com.example.app", "auth")
    manager.subscribe("com.example.app", "settings")

    manager.destroy()

    assertTrue(manager.getActiveSubscriptions().isEmpty())
  }
}
