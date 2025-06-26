package com.zillow.automobile.accessibilityservice

import android.content.Context
import android.content.Intent
import android.util.Log
import com.zillow.automobile.accessibilityservice.models.UIElementInfo
import com.zillow.automobile.accessibilityservice.models.ViewHierarchy
import java.io.File
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json

/**
 * Client class for communicating with the AutoMobile Accessibility Service via broadcast intents
 * and file-based communication.
 */
class AccessibilityServiceClient(private val context: Context) {

  companion object {
    private const val TAG = "AccessibilityServiceClient"
    private const val ACTION_EXTRACT_HIERARCHY = "com.zillow.automobile.EXTRACT_HIERARCHY"
    private const val ACTION_FIND_ELEMENT = "com.zillow.automobile.FIND_ELEMENT"
    private const val ACTION_GET_CLICKABLE_ELEMENTS = "com.zillow.automobile.GET_CLICKABLE_ELEMENTS"
    private const val EXTRA_OUTPUT_PATH = "output_path"
    private const val EXTRA_SEARCH_TEXT = "search_text"
    private const val EXTRA_RESOURCE_ID = "resource_id"
    private const val EXTRA_CASE_SENSITIVE = "case_sensitive"
    private const val DEFAULT_TIMEOUT_MS = 10000L
  }

  private val json = Json { ignoreUnknownKeys = true }

  /** Extracts the current view hierarchy */
  suspend fun extractViewHierarchy(
      outputPath: String = "/sdcard/view_hierarchy.json"
  ): ViewHierarchy? {
    return withContext(Dispatchers.IO) {
      try {
        // Send command to accessibility service
        val intent =
            Intent(ACTION_EXTRACT_HIERARCHY).apply { putExtra(EXTRA_OUTPUT_PATH, outputPath) }
        context.sendBroadcast(intent)

        // Wait for result and read from file
        waitForFile(outputPath)?.let { content -> json.decodeFromString<ViewHierarchy>(content) }
      } catch (e: Exception) {
        Log.e(TAG, "Error extracting view hierarchy", e)
        null
      }
    }
  }

  /** Finds an element by text */
  suspend fun findElementByText(
      text: String,
      caseSensitive: Boolean = false,
      outputPath: String = "/sdcard/find_element_result.json"
  ): ElementSearchResult? {
    return withContext(Dispatchers.IO) {
      try {
        val intent =
            Intent(ACTION_FIND_ELEMENT).apply {
              putExtra(EXTRA_SEARCH_TEXT, text)
              putExtra(EXTRA_CASE_SENSITIVE, caseSensitive)
              putExtra(EXTRA_OUTPUT_PATH, outputPath)
            }
        context.sendBroadcast(intent)

        waitForFile(outputPath)?.let { content ->
          json.decodeFromString<ElementSearchResult>(content)
        }
      } catch (e: Exception) {
        Log.e(TAG, "Error finding element by text", e)
        null
      }
    }
  }

  /** Finds an element by resource ID */
  suspend fun findElementByResourceId(
      resourceId: String,
      outputPath: String = "/sdcard/find_element_result.json"
  ): ElementSearchResult? {
    return withContext(Dispatchers.IO) {
      try {
        val intent =
            Intent(ACTION_FIND_ELEMENT).apply {
              putExtra(EXTRA_RESOURCE_ID, resourceId)
              putExtra(EXTRA_OUTPUT_PATH, outputPath)
            }
        context.sendBroadcast(intent)

        waitForFile(outputPath)?.let { content ->
          json.decodeFromString<ElementSearchResult>(content)
        }
      } catch (e: Exception) {
        Log.e(TAG, "Error finding element by resource ID", e)
        null
      }
    }
  }

  /** Gets all clickable and scrollable elements */
  suspend fun getInteractiveElements(
      outputPath: String = "/sdcard/interactive_elements.json"
  ): InteractiveElementsResult? {
    return withContext(Dispatchers.IO) {
      try {
        val intent =
            Intent(ACTION_GET_CLICKABLE_ELEMENTS).apply { putExtra(EXTRA_OUTPUT_PATH, outputPath) }
        context.sendBroadcast(intent)

        waitForFile(outputPath)?.let { content ->
          json.decodeFromString<InteractiveElementsResult>(content)
        }
      } catch (e: Exception) {
        Log.e(TAG, "Error getting interactive elements", e)
        null
      }
    }
  }

  /** Waits for a file to be written and returns its content */
  private suspend fun waitForFile(filePath: String, timeoutMs: Long = DEFAULT_TIMEOUT_MS): String? {
    val file = File(filePath)
    val startTime = System.currentTimeMillis()

    // Delete existing file first
    if (file.exists()) {
      file.delete()
    }

    while (System.currentTimeMillis() - startTime < timeoutMs) {
      if (file.exists() && file.length() > 0) {
        try {
          val content = file.readText()
          if (content.isNotBlank()) {
            Log.d(TAG, "Successfully read file: $filePath")
            return content
          }
        } catch (e: Exception) {
          Log.w(TAG, "Error reading file, retrying...", e)
        }
      }
      delay(100) // Wait 100ms before checking again
    }

    Log.w(TAG, "Timeout waiting for file: $filePath")
    return null
  }

  /** Checks if the accessibility service is likely running */
  fun isAccessibilityServiceRunning(): Boolean {
    // This is a basic check - in a real implementation, you might want to
    // send a test broadcast and wait for a response
    return try {
      val testPath = "/sdcard/accessibility_test.json"
      val intent = Intent(ACTION_EXTRACT_HIERARCHY).apply { putExtra(EXTRA_OUTPUT_PATH, testPath) }
      context.sendBroadcast(intent)
      true
    } catch (e: Exception) {
      Log.e(TAG, "Error checking accessibility service status", e)
      false
    }
  }
}

/** Result data classes for service responses */
@kotlinx.serialization.Serializable
data class ElementSearchResult(
    val found: Boolean,
    val element: UIElementInfo? = null,
    val searchText: String? = null,
    val resourceId: String? = null,
    val caseSensitive: Boolean = false,
    val success: Boolean = true,
    val error: String? = null
)

@kotlinx.serialization.Serializable
data class InteractiveElementsResult(
    val clickableElements: List<UIElementInfo> = emptyList(),
    val scrollableElements: List<UIElementInfo> = emptyList(),
    val clickableCount: Int = 0,
    val scrollableCount: Int = 0,
    val success: Boolean = true,
    val error: String? = null
)
