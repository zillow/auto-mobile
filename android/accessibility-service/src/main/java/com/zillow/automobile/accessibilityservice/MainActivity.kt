package com.zillow.automobile.accessibilityservice

import android.app.Activity
import android.content.Intent
import android.os.Bundle
import android.provider.Settings
import android.util.Log
import android.view.accessibility.AccessibilityManager
import android.widget.Button
import android.widget.TextView
import androidx.core.content.ContextCompat

/**
 * Main activity for the AutoMobile Accessibility Service app. Provides information about the
 * service and allows users to enable it.
 */
class MainActivity : Activity() {

  companion object {
    private const val TAG = "MainActivity"
  }

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    Log.i(TAG, "onCreate")

    // Create a simple layout programmatically
    createLayout()

    // Check service status
    checkAccessibilityServiceStatus()
  }

  override fun onResume() {
    super.onResume()
    Log.i(TAG, "onResume")
    // Refresh status when returning to the activity
    checkAccessibilityServiceStatus()
  }

  private fun createLayout() {
    Log.i(TAG, "createLayout")
    // Create a vertical layout with text and buttons
    val layout =
        android.widget.LinearLayout(this).apply {
          orientation = android.widget.LinearLayout.VERTICAL
          setPadding(32, 32, 32, 32)
        }

    // Title
    val titleText =
        TextView(this).apply {
          text = "AutoMobile Accessibility Service"
          textSize = 20f
          setTypeface(null, android.graphics.Typeface.BOLD)
          setPadding(0, 0, 0, 24)
        }
    layout.addView(titleText)

    // Description
    val descriptionText =
        TextView(this).apply {
          text =
              """
                This service provides view hierarchy extraction capabilities for automated testing.

                To use this service:
                1. Enable the accessibility service in Settings
                2. Grant necessary permissions
                3. The service will be available for AutoMobile testing
            """
                  .trimIndent()
          setPadding(0, 0, 0, 24)
        }
    layout.addView(descriptionText)

    // Status text
    val statusText =
        TextView(this).apply {
          id = android.R.id.text1 // Use this ID for reference
          textSize = 16f
          setPadding(0, 0, 0, 16)
        }
    layout.addView(statusText)

    // Open Settings button
    val openSettingsButton =
        Button(this).apply {
          text = "Open Accessibility Settings"
          setOnClickListener { openAccessibilitySettings() }
        }
    layout.addView(openSettingsButton)

    // Test service button
    val testServiceButton =
        Button(this).apply {
          text = "Test Service"
          setOnClickListener { testAccessibilityService() }
          layoutParams =
              android.widget.LinearLayout.LayoutParams(
                      android.widget.LinearLayout.LayoutParams.MATCH_PARENT,
                      android.widget.LinearLayout.LayoutParams.WRAP_CONTENT)
                  .apply { topMargin = 16 }
        }
    layout.addView(testServiceButton)

    setContentView(layout)
  }

  private fun checkAccessibilityServiceStatus() {
    Log.i(TAG, "checkAccessibilityServiceStatus")
    val statusText = findViewById<TextView>(android.R.id.text1)
    val isServiceEnabled = isAccessibilityServiceEnabled()

    if (isServiceEnabled) {
      statusText.text = "✅ Accessibility Service is ENABLED"
      statusText.setTextColor(ContextCompat.getColor(this, android.R.color.holo_green_dark))
    } else {
      statusText.text = "❌ Accessibility Service is DISABLED"
      statusText.setTextColor(ContextCompat.getColor(this, android.R.color.holo_red_dark))
    }

    Log.i(TAG, "Accessibility service enabled: $isServiceEnabled")
  }

  private fun isAccessibilityServiceEnabled(): Boolean {
    Log.i(TAG, "isAccessibilityServiceEnabled")
    return try {
      val accessibilityManager = getSystemService(ACCESSIBILITY_SERVICE) as AccessibilityManager
      val enabledServices =
          Settings.Secure.getString(contentResolver, Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES)

      val serviceName = "$packageName/${AutoMobileAccessibilityService::class.java.canonicalName}"
      enabledServices?.contains(serviceName) == true
    } catch (e: Exception) {
      Log.e(TAG, "Error checking accessibility service status", e)
      false
    }
  }

  private fun openAccessibilitySettings() {
    Log.i(TAG, "openAccessibilitySettings")
    try {
      val intent = Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS)
      startActivity(intent)
      Log.i(TAG, "Opened accessibility settings")
    } catch (e: Exception) {
      Log.e(TAG, "Error opening accessibility settings", e)
    }
  }

  private fun testAccessibilityService() {
    Log.i(TAG, "testAccessibilityService")
    Log.i(TAG, "Testing accessibility service...")

    // Create a simple test by sending a broadcast
    val client = AccessibilityServiceClient(this)

    if (client.isAccessibilityServiceRunning()) {
      Log.i(TAG, "Accessibility service appears to be running")

      // You could add more sophisticated testing here
      // For example, try to extract view hierarchy

    } else {
      Log.w(TAG, "Accessibility service may not be running")
    }
  }
}
