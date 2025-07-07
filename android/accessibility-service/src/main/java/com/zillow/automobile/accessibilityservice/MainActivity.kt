package com.zillow.automobile.accessibilityservice

import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.provider.Settings
import android.util.Log
import android.view.accessibility.AccessibilityManager
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

/**
 * Main activity for the AutoMobile Accessibility Service app. Provides information about the
 * service and allows users to enable it.
 */
class MainActivity : ComponentActivity() {

  companion object {
    private const val TAG = "MainActivity"
  }

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    Log.i(TAG, "onCreate")

    enableEdgeToEdge()

    setContent {
      AutoMobileAccessibilityServiceTheme {
        Surface(modifier = Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
          AccessibilityServiceScreen()
        }
      }
    }
  }
}

@Composable
fun AccessibilityServiceScreen() {
  val context = LocalContext.current
  var isServiceEnabled by remember { mutableStateOf(false) }

  LaunchedEffect(Unit) { isServiceEnabled = checkAccessibilityServiceStatus(context) }

  Column(
      modifier = Modifier.fillMaxSize().statusBarsPadding().navigationBarsPadding().padding(32.dp),
      verticalArrangement = Arrangement.spacedBy(24.dp),
      horizontalAlignment = Alignment.CenterHorizontally) {
        // Title
        Text(
            text = "AutoMobile Accessibility Service",
            fontSize = 20.sp,
            fontWeight = FontWeight.Bold,
            textAlign = TextAlign.Center)

        // Description
        Text(
            text =
                """
        This service provides view hierarchy extraction capabilities for automated testing.

        To use this service:
        1. Enable the accessibility service in Settings
        2. Grant necessary permissions
        3. The service will be available for AutoMobile testing
      """
                    .trimIndent(),
            textAlign = TextAlign.Start,
            modifier = Modifier.fillMaxWidth())

        // Status
        ServiceStatusDisplay(isServiceEnabled = isServiceEnabled)

        // Open Settings button
        Button(
            onClick = { openAccessibilitySettings(context) }, modifier = Modifier.fillMaxWidth()) {
              Text("Open Accessibility Settings")
            }
      }
}

@Composable
fun ServiceStatusDisplay(isServiceEnabled: Boolean) {
  val statusText =
      if (isServiceEnabled) {
        "✅ Accessibility Service is ENABLED"
      } else {
        "❌ Accessibility Service is DISABLED"
      }

  val statusColor =
      if (isServiceEnabled) {
        Color(0xFF4CAF50) // Green
      } else {
        Color(0xFFE53935) // Red
      }

  Text(
      text = statusText,
      color = statusColor,
      fontSize = 16.sp,
      fontWeight = FontWeight.Medium,
      textAlign = TextAlign.Center)
}

@Composable
fun AutoMobileAccessibilityServiceTheme(content: @Composable () -> Unit) {
  MaterialTheme(content = content)
}

private fun checkAccessibilityServiceStatus(context: android.content.Context): Boolean {
  Log.i("MainActivity", "checkAccessibilityServiceStatus")
  return try {
    val accessibilityManager =
        context.getSystemService(Context.ACCESSIBILITY_SERVICE) as AccessibilityManager
    val enabledServices =
        Settings.Secure.getString(
            context.contentResolver, Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES)

    val serviceName =
        "${context.packageName}/${AutoMobileAccessibilityService::class.java.canonicalName}"
    enabledServices?.contains(serviceName) == true
  } catch (e: Exception) {
    Log.e("MainActivity", "Error checking accessibility service status", e)
    false
  }
}

private fun openAccessibilitySettings(context: android.content.Context) {
  Log.i("MainActivity", "openAccessibilitySettings")
  try {
    val intent = Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS)
    context.startActivity(intent)
    Log.i("MainActivity", "Opened accessibility settings")
  } catch (e: Exception) {
    Log.e("MainActivity", "Error opening accessibility settings", e)
  }
}

// Compose Previews
@Preview(showBackground = true)
@Composable
fun AccessibilityServiceScreenPreview() {
  AutoMobileAccessibilityServiceTheme {
    Surface(modifier = Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
      AccessibilityServiceScreen()
    }
  }
}

@Preview(showBackground = true)
@Composable
fun ServiceStatusEnabledPreview() {
  AutoMobileAccessibilityServiceTheme { ServiceStatusDisplay(isServiceEnabled = true) }
}

@Preview(showBackground = true)
@Composable
fun ServiceStatusDisabledPreview() {
  AutoMobileAccessibilityServiceTheme { ServiceStatusDisplay(isServiceEnabled = false) }
}
