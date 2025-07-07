package com.zillow.automobile.accessibilityservice

import android.accessibilityservice.AccessibilityService
import android.content.Context
import android.util.Log
import android.view.accessibility.AccessibilityEvent
import com.zillow.automobile.accessibilityservice.models.ViewHierarchy
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json

/**
 * Main AutoMobile Accessibility Service that provides view hierarchy extraction capabilities for
 * automated testing and UI interaction.
 */
class AutoMobileAccessibilityService : AccessibilityService() {

  companion object {
    private const val TAG = "AutoMobileAccessibilityService"

    // File name for app-scoped storage
    private const val HIERARCHY_FILE_NAME = "latest_hierarchy.json"
  }

  private val serviceScope = CoroutineScope(Dispatchers.IO + SupervisorJob())
  private val viewHierarchyExtractor = ViewHierarchyExtractor()
  private val json = Json { prettyPrint = true }

  override fun onServiceConnected() {
    super.onServiceConnected()

    try {
      Log.i(TAG, "AutoMobile Accessibility Service connected successfully")
    } catch (e: Exception) {
      Log.e(TAG, "Error during service connection", e)
      // Service will continue running even if some initialization fails
    }
  }

  override fun onDestroy() {
    super.onDestroy()
    Log.i(TAG, "AutoMobile Accessibility Service destroyed")
    serviceScope.cancel()
  }

  override fun onAccessibilityEvent(event: AccessibilityEvent?) {
    if (event == null) return

    try {
      // Log accessibility events for debugging
      Log.d(TAG, "Accessibility event: ${event.eventType}, package: ${event.packageName}")

      // Extract and store view hierarchy when content or window changes
      if (event.eventType == AccessibilityEvent.TYPE_WINDOW_CONTENT_CHANGED ||
          event.eventType == AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED) {
        serviceScope.launch { extractAndStoreHierarchy() }
      }
    } catch (e: Exception) {
      Log.e(TAG, "Error handling accessibility event", e)
      // Don't let event handling crash the service
    }
  }

  override fun onInterrupt() {
    Log.w(TAG, "Accessibility service interrupted")
  }

  /** Extracts and stores view hierarchy, automatically writing to disk */
  private fun extractAndStoreHierarchy() {
    try {
      val rootNode = rootInActiveWindow
      if (rootNode == null) {
        Log.w(TAG, "No root node available for extraction")
        return
      }

      val hierarchy = viewHierarchyExtractor.extractFromActiveWindow(rootNode)
      if (hierarchy == null) {
        Log.w(TAG, "Failed to extract hierarchy")
        return
      }

      // Automatically write to disk
      writeHierarchyToFile(hierarchy)

      Log.d(TAG, "View hierarchy extracted and written to disk")
    } catch (e: Exception) {
      Log.e(TAG, "Error extracting and storing hierarchy", e)
    }
  }

  /** Writes the hierarchy to a file for synchronous access */
  private fun writeHierarchyToFile(hierarchy: ViewHierarchy) {
    try {
      val jsonString = json.encodeToString(hierarchy)
      openFileOutput(HIERARCHY_FILE_NAME, Context.MODE_PRIVATE).use { output ->
        output.write(jsonString.toByteArray())
        output.flush()
      }
    } catch (e: Exception) {
      Log.e(TAG, "Error writing hierarchy to file", e)
    }
  }
}
