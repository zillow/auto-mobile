package com.zillow.automobile.slides.components

import android.webkit.WebView
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
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
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.viewinterop.AndroidView
import kotlinx.coroutines.delay

/**
 * Code sample slide component with syntax highlighting via WebView and Prism.js.
 * Full-screen display with high contrast colors optimized for presentations.
 * Uses cached local assets for faster loading and supports dark/light themes.
 */
@Composable
fun CodeSampleSlideItem(
  code: String,
  language: String,
  title: String? = null, // Kept for API compatibility but not used
  highlight: String? = null,
  isDarkMode: Boolean = false,
  modifier: Modifier = Modifier
) {
  val context = LocalContext.current
  var showLoading by remember { mutableStateOf(true) }

  val backgroundColor = if (isDarkMode) Color(0xFF1E1E1E) else Color.White
  val textColor = if (isDarkMode) Color(0xFFF8F8F2) else Color.Black

  // Hide loading overlay after 1 second
  LaunchedEffect(Unit) {
    delay(1000)
    showLoading = false
  }

  Box(
    modifier = modifier
      .fillMaxSize()
      .background(backgroundColor)
  ) {
    // WebView with syntax highlighting
    AndroidView(
      factory = { context ->
        WebView(context).apply {
          settings.javaScriptEnabled = true
          settings.loadWithOverviewMode = true
          settings.useWideViewPort = true
          settings.setSupportZoom(false)

          val htmlContent = createHighlightedCodeHtml(
            code = code,
            language = language,
            highlight = highlight,
            isDarkMode = isDarkMode
          )

          loadDataWithBaseURL(
            "file:///android_asset/",
            htmlContent,
            "text/html",
            "UTF-8",
            null
          )
        }
      },
      modifier = Modifier.fillMaxSize()
    )

    // Loading overlay
    if (showLoading) {
      Box(
        modifier = Modifier
          .fillMaxSize()
          .background(backgroundColor)
      ) {
        CircularProgressIndicator(
          modifier = Modifier.align(Alignment.Center)
        )
      }
    }
  }
}

/**
 * Creates HTML content with Prism.js syntax highlighting.
 */
private fun createHighlightedCodeHtml(
  code: String,
  language: String,
  isDarkMode: Boolean,
  highlight: String? = null
): String {
  val themeFile = if (isDarkMode) "prism-dark.css" else "prism-light.css"

  // Process highlighting if provided
  val processedCode = if (highlight != null) {
    processCodeWithHighlighting(code, highlight, isDarkMode)
  } else {
    code.replace("<", "&lt;").replace(">", "&gt;")
  }

  return """
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <link href="file:///android_asset/$themeFile" rel="stylesheet" />
            <style>
                body {
                    margin: 0;
                    padding: 0;
                    background-color: ${if (isDarkMode) "#1E1E1E" else "#FFFFFF"};
                    color: ${if (isDarkMode) "#F8F8F2" else "#000000"};
                    font-family: 'Courier New', monospace;
                    font-size: 18px;
                    line-height: 1.6;
                }
                pre {
                    margin: 0;
                    padding: 1em;
                    background-color: transparent !important;
                    overflow: visible;
                }
                code {
                    background-color: transparent !important;
                    padding: 0;
                }
                .dimmed-line {
                    opacity: 0.3;
                }
                .highlighted-line {
                    opacity: 1.0;
                    font-weight: bold;
                }
            </style>
        </head>
        <body>
            <pre><code class="language-$language">$processedCode</code></pre>
            <script src="file:///android_asset/prism.min.js"></script>
            <script src="file:///android_asset/prism-kotlin.min.js"></script>
            <script src="file:///android_asset/prism-java.min.js"></script>
            <script src="file:///android_asset/prism-javascript.min.js"></script>
            <script src="file:///android_asset/prism-yaml.min.js"></script>
        </body>
        </html>
    """.trimIndent()
}

/**
 * Processes code to apply highlighting by wrapping lines in spans with appropriate CSS classes.
 */
internal fun processCodeWithHighlighting(
  code: String,
  highlight: String,
  isDarkMode: Boolean
): String {
  val codeLines = code.lines()
  val highlightLines = highlight.lines().map { it.trim() }.filter { it.isNotEmpty() }

  return codeLines.joinToString("\n") { line ->
    val escapedLine = line.replace("<", "&lt;").replace(">", "&gt;")
    val isHighlighted = highlightLines.any { highlightLine ->
      line.trim().contains(highlightLine.trim(), ignoreCase = false)
    }

    if (isHighlighted) {
      "<span class=\"highlighted-line\">$escapedLine</span>"
    } else {
      "<span class=\"dimmed-line\">$escapedLine</span>"
    }
  }
}

@Preview(showBackground = true, name = "Light Mode")
@Composable
fun CodeSampleSlideItemPreview() {
  MaterialTheme {
    CodeSampleSlideItem(
      code = """
                @Test
                fun testLoginFlow() {
                    // Launch the app
                    tapOn(text = "Login")

                    // Enter credentials
                    inputText("user@example.com")
                    tapOn(text = "Next")
                    inputText("password123")

                    // Submit login
                    tapOn(text = "Sign In")

                    // Verify success
                    assertVisible(text = "Welcome")
                }
            """.trimIndent(),
      language = "kotlin",
      isDarkMode = false
    )
  }
}

@Preview(showBackground = true, name = "Dark Mode")
@Composable
fun CodeSampleSlideItemDarkPreview() {
  MaterialTheme {
    CodeSampleSlideItem(
      code = """
                @Test
                fun testLoginFlow() {
                    // Launch the app
                    tapOn(text = "Login")

                    // Enter credentials
                    inputText("user@example.com")
                    tapOn(text = "Next")
                    inputText("password123")

                    // Submit login
                    tapOn(text = "Sign In")

                    // Verify success
                    assertVisible(text = "Welcome")
                }
            """.trimIndent(),
      language = "kotlin",
      isDarkMode = true
    )
  }
}

@Preview(showBackground = true, name = "Highlighted Code")
@Composable
fun CodeSampleSlideItemHighlightPreview() {
  MaterialTheme {
    CodeSampleSlideItem(
      code = """
                keepClearAreas: restricted=[], unrestricted=[]
                mPrepareSyncSeqId=0

                mGlobalConfiguration={1.0 310mcc260mnc [en_US] ldltr sw448dp w997dp h448dp 360dpi nrml long hdr widecg land finger -keyb/v/h -nav/h winConfig={ mBounds=Rect(0, 0 - 2244, 1008) mAppBounds=Rect(0, 0 - 2244, 1008) mMaxBounds=Rect(0, 0 - 2244, 1008) mDisplayRotation=ROTATION_90 mWindowingMode=fullscreen mActivityType=undefined mAlwaysOnTop=undefined mRotation=ROTATION_90} s.6257 fontWeightAdjustment=0}
                mHasPermanentDpad=false
                mTopFocusedDisplayId=0
                imeLayeringTarget in display# 0 Window{ea58714 u0 com.zillow.automobile.playground/com.zillow.automobile.playground.MainActivity}
                imeInputTarget in display# 0 Window{ea58714 u0 com.zillow.automobile.playground/com.zillow.automobile.playground.MainActivity}
                imeControlTarget in display# 0 Window{ea58714 u0 com.zillow.automobile.playground/com.zillow.automobile.playground.MainActivity}
                Minimum task size of display#0 220  mBlurEnabled=true
                mLastDisplayFreezeDuration=0 due to new-config
                mDisableSecureWindows=false
                mHighResSnapshotScale=0.8
                mSnapshotEnabled=true
                SnapshotCache Task
            """.trimIndent(),
      language = "shell",
      highlight = """
                imeLayeringTarget in display# 0 Window{ea58714 u0 com.zillow.automobile.playground/com.zillow.automobile.playground.MainActivity}
                imeInputTarget in display# 0 Window{ea58714 u0 com.zillow.automobile.playground/com.zillow.automobile.playground.MainActivity}
                imeControlTarget in display# 0 Window{ea58714 u0 com.zillow.automobile.playground/com.zillow.automobile.playground.MainActivity}
            """.trimIndent(),
      isDarkMode = true
    )
  }
}
