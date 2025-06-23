package com.zillow.automobile.slides.components

import android.util.Log
import android.view.GestureDetector
import android.view.MotionEvent
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import com.zillow.automobile.design.system.theme.PromoBlue
import com.zillow.automobile.design.system.theme.PromoOrange
import kotlinx.coroutines.delay

/**
 * Mermaid diagram slide component that renders interactive diagrams using Mermaid.js. Supports
 * dark/light theming with design system colors and optional title/caption text.
 */
@Composable
fun MermaidDiagramSlideItem(
    mermaidCode: String,
    title: String? = null,
    caption: String? = null,
    isDarkMode: Boolean = false,
    modifier: Modifier = Modifier
) {

  val TAG = "MermaidDiagramSlideItem"
  val context = LocalContext.current
  var showLoading by remember { mutableStateOf(true) }
  var zoomLevel by remember { mutableFloatStateOf(1f) }
  var contentWidth by remember { mutableFloatStateOf(0f) }

  val backgroundColor = if (isDarkMode) Color(0xFF1E1E1E) else Color.White
  val textColor = if (isDarkMode) Color(0xFFF8F8F2) else Color.Black

  // Calculate opacity based on zoom level - fade out when zooming in
  val contentOpacity by
      animateFloatAsState(
          targetValue =
              when {
                zoomLevel <= 1.2f -> 1f
                zoomLevel >= 2f -> 0f
                else -> 1f - ((zoomLevel - 1.2f) / 0.8f) // Linear fade between 1.2x and 2x zoom
              },
          animationSpec = tween(durationMillis = 300),
          label = "contentOpacity")

  // Hide loading overlay after 1 second
  LaunchedEffect(Unit) {
    delay(1000)
    showLoading = false
  }

  Column(
      modifier = modifier.fillMaxSize().background(backgroundColor).padding(16.dp),
      horizontalAlignment = Alignment.CenterHorizontally) {
        // Optional title
        title?.let {
          Text(
              text = it,
              style = MaterialTheme.typography.headlineMedium,
              color = textColor,
              modifier = Modifier.padding(bottom = 16.dp).alpha(contentOpacity))
        }

        // Mermaid diagram
        Box(modifier = Modifier.weight(1f).fillMaxWidth()) {
          AndroidView(
              factory = { context ->
                WebView(context).apply {
                  settings.javaScriptEnabled = true
                  settings.loadWithOverviewMode = true
                  settings.useWideViewPort = true
                  settings.setSupportZoom(true)
                  settings.builtInZoomControls = true
                  settings.displayZoomControls = false

                  // Enhanced zoom gesture support
                  settings.allowFileAccess = true
                  settings.allowContentAccess = true
                  settings.domStorageEnabled = true

                  // Set background color to prevent white flashing
                  setBackgroundColor(backgroundColor.toArgb())

                  // Add JavaScript interface for zoom tracking
                  addJavascriptInterface(
                      object {
                        @android.webkit.JavascriptInterface
                        fun onZoomChanged(scale: Float) {
                          // Post to main thread since this is called from JavaScript thread
                          post {
                            zoomLevel = scale
                            Log.i(TAG, "AutoMobile: JS Zoom level: $scale")
                          }
                        }
                      },
                      "Android")

                  // Custom WebViewClient to track zoom changes
                  webViewClient =
                      object : WebViewClient() {
                        override fun onScaleChanged(
                            view: WebView?,
                            oldScale: Float,
                            newScale: Float
                        ) {
                          super.onScaleChanged(view, oldScale, newScale)
                          zoomLevel = newScale
                          Log.i(TAG, "AutoMobile: Zoom changed from $oldScale to $newScale")
                        }

                        override fun onPageFinished(view: WebView?, url: String?) {
                          super.onPageFinished(view, url)

                          // Get content dimensions via JavaScript
                          view?.postDelayed(
                              {
                                // Get the content width
                                view.evaluateJavascript(
                                    "(function() { return JSON.stringify({width: document.body.scrollWidth, height: document.body.scrollHeight}); })();") {
                                        result ->
                                      try {
                                        val cleanResult = result?.replace("\"", "") ?: ""
                                        if (cleanResult.isNotEmpty() && cleanResult != "null") {
                                          // Parse the JSON-like string to get dimensions
                                          val contentData =
                                              cleanResult.substringAfter("{").substringBefore("}")
                                          val widthStr =
                                              contentData
                                                  .substringAfter("width:")
                                                  .substringBefore(",")
                                          val parsedContentWidth = widthStr.toFloatOrNull() ?: 0f

                                          contentWidth = parsedContentWidth
                                        }
                                      } catch (e: Exception) {
                                        Log.i(
                                            TAG,
                                            "AutoMobile: Error parsing content dimensions: ${e.message}")
                                      }
                                    }
                              },
                              1000) // Slightly longer delay to ensure Mermaid rendering is complete

                          // Auto-zoom to fit or 2.5x when page loads
                          view?.postDelayed(
                              {
                                // Get content dimensions via JavaScript
                                view.evaluateJavascript(
                                    "(function() { return JSON.stringify({width: document.body.scrollWidth, height: document.body.scrollHeight}); })();") {
                                        result ->
                                      try {
                                        val cleanResult = result?.replace("\"", "") ?: ""
                                        if (cleanResult.isNotEmpty() && cleanResult != "null") {
                                          // Parse the JSON-like string to get dimensions
                                          val contentData =
                                              cleanResult.substringAfter("{").substringBefore("}")
                                          val widthStr =
                                              contentData
                                                  .substringAfter("width:")
                                                  .substringBefore(",")
                                          Log.i(TAG, "widthStr: ${widthStr}")
                                          val contentWidth = widthStr.toFloatOrNull() ?: 0f
                                          Log.i(TAG, "contentWidth: ${contentWidth}")
                                          val viewWidth = view.width.toFloat()
                                          Log.i(TAG, "viewWidth: ${viewWidth}")

                                          if (contentWidth > 0 && viewWidth > 0) {
                                            // Calculate scale to fit content with some padding
                                            val scaleToFit = (viewWidth * 0.9f) / contentWidth

                                            // Choose between fit-to-window or 2.5x zoom
                                            val targetZoom =
                                                if (scaleToFit > 1f && scaleToFit < 2.5f) {
                                                  scaleToFit // Use fit-to-window if it's reasonable
                                                } else {
                                                  2.5f // Otherwise use 2.5x zoom
                                                }

                                            // Apply the zoom
                                            view.zoomBy(targetZoom)
                                            zoomLevel = targetZoom

                                            // Pan to top center after zoom
                                            view.postDelayed(
                                                {
                                                  // Use JavaScript to get the actual rendered
                                                  // dimensions after zoom
                                                  view.evaluateJavascript(
                                                      "(function() { return JSON.stringify({width: document.body.scrollWidth, height: document.body.scrollHeight}); })();") {
                                                          dimensionResult ->
                                                        try {
                                                          val cleanDimResult =
                                                              dimensionResult?.replace("\"", "")
                                                                  ?: ""
                                                          if (cleanDimResult.isNotEmpty() &&
                                                              cleanDimResult != "null") {
                                                            val dimData =
                                                                cleanDimResult
                                                                    .substringAfter("{")
                                                                    .substringBefore("}")
                                                            val actualWidthStr =
                                                                dimData
                                                                    .substringAfter("width:")
                                                                    .substringBefore(",")
                                                            val actualContentWidth =
                                                                actualWidthStr.toFloatOrNull() ?: 0f
                                                            val viewWidth = view.width.toFloat()

                                                            // Calculate horizontal scroll to center
                                                            // the content
                                                            val scrollX =
                                                                if (actualContentWidth >
                                                                    viewWidth) {
                                                                  ((actualContentWidth -
                                                                          viewWidth) / 2)
                                                                      .toInt()
                                                                } else {
                                                                  0 // Content fits in view, no
                                                                  // horizontal scroll needed
                                                                }

                                                            val scrollY = 0 // Top of the content

                                                            Log.i(
                                                                TAG,
                                                                "view.scrollTo(scrollX, scrollY) (${scrollX}, ${scrollY})")
                                                            view.scrollTo(scrollX, scrollY)
                                                            Log.i(
                                                                TAG,
                                                                "AutoMobile: Panned to top center ($scrollX, $scrollY) - content: $actualContentWidth, view: $viewWidth")
                                                          } else {
                                                            // Fallback: try to center using initial
                                                            // calculation
                                                            val scaledContentWidth =
                                                                (contentWidth * targetZoom).toInt()
                                                            val viewWidth = view.width
                                                            val scrollX =
                                                                maxOf(
                                                                    0,
                                                                    (scaledContentWidth -
                                                                        viewWidth) / 2)
                                                            Log.i(
                                                                TAG,
                                                                "view.scrollTo(scrollX, 0) (${scrollX}, 0)")
                                                            view.scrollTo(scrollX, 0)
                                                            Log.i(
                                                                TAG,
                                                                "AutoMobile: Panned to top center (calc fallback) ($scrollX, 0)")
                                                          }
                                                        } catch (e: Exception) {
                                                          // Last resort: try basic centering
                                                          val scaledContentWidth =
                                                              (contentWidth * targetZoom).toInt()
                                                          val viewWidth = view.width
                                                          val scrollX =
                                                              maxOf(
                                                                  0,
                                                                  (scaledContentWidth - viewWidth) /
                                                                      2)
                                                          Log.i(
                                                              TAG,
                                                              "view.scrollTo(scrollX, 0) (${scrollX}, 0)")
                                                          view.scrollTo(scrollX, 0)
                                                          Log.i(
                                                              TAG,
                                                              "AutoMobile: Panned to top center (error fallback) ($scrollX, 0): ${e.message}")
                                                        }
                                                      }
                                                },
                                                200) // Small delay after zoom to ensure it's
                                            // applied

                                            Log.i(
                                                TAG,
                                                "AutoMobile: Auto-zoomed to $targetZoom (scaleToFit: $scaleToFit)")
                                          } else {
                                            // Fallback to 2.5x
                                            view.zoomBy(2.5f)
                                            zoomLevel = 2.5f

                                            // Pan to top center after zoom
                                            view.postDelayed(
                                                {
                                                  Log.i(
                                                      TAG,
                                                      "view.scrollTo(scrollX, 0) (${scrollX}, 0)")
                                                  view.scrollTo(scrollX, 0)

                                                  val scrollX =
                                                      maxOf(0, (view.width * 0.75).toInt())
                                                  Log.i(
                                                      TAG,
                                                      "view.scrollTo(view.width / 2, 0) ($scrollX 0)")
                                                  view.scrollTo(scrollX, 0)
                                                  Log.i(
                                                      TAG,
                                                      "AutoMobile: Panned to top center (fallback) ($scrollX, 0)")
                                                },
                                                200)

                                            Log.i(
                                                TAG,
                                                "AutoMobile: Auto-zoomed to 2.5x (dimensions fallback)")
                                          }
                                        } else {
                                          // Fallback to 2.5x if JavaScript fails
                                          view.zoomBy(2.5f)
                                          zoomLevel = 2.5f

                                          // Pan to top center after zoom
                                          view.postDelayed(
                                              {
                                                Log.i(
                                                    TAG,
                                                    "view.scrollTo(view.width / 2, 0) (${view.width / 2} 0)")
                                                view.scrollTo(view.width / 2, 0)
                                                Log.i(
                                                    TAG,
                                                    "AutoMobile: Panned to top center (JS fallback")
                                              },
                                              200)

                                          Log.i(
                                              TAG, "AutoMobile: Auto-zoomed to 2.5x (JS fallback)")
                                        }
                                      } catch (e: Exception) {
                                        // Fallback to 2.5x if parsing fails
                                        view.zoomBy(2.5f)
                                        zoomLevel = 2.5f

                                        // Pan to top center after zoom
                                        view.postDelayed(
                                            {
                                              val scaledContentWidth = (contentWidth * 2.5f).toInt()
                                              val viewWidth = view.width
                                              val scrollX =
                                                  maxOf(0, (scaledContentWidth - viewWidth) / 2)
                                              Log.i(
                                                  TAG, "view.scrollTo(scrollX, 0) (${scrollX}, 0)")
                                              view.scrollTo(scrollX, 0)
                                              Log.i(
                                                  TAG,
                                                  "AutoMobile: Panned to top center (error fallback) ($scrollX, 0): ${e.message}")
                                            },
                                            200)

                                        Log.i(
                                            TAG,
                                            "AutoMobile: Auto-zoomed to 2.5x (error fallback): ${e.message}")
                                      }
                                    }
                              },
                              1000) // Slightly longer delay to ensure Mermaid rendering is complete

                          // Inject JavaScript to monitor zoom changes more reliably
                          view?.evaluateJavascript(
                              """
                  (function() {
                    let lastScale = 1;
                    function checkZoom() {
                      const currentScale = window.outerWidth / window.innerWidth;
                      if (Math.abs(currentScale - lastScale) > 0.1) {
                        lastScale = currentScale;
                        Android.onZoomChanged(currentScale);
                      }
                    }
                    setInterval(checkZoom, 100);
                  })();
                """,
                              null)
                        }
                      }

                  // Double tap to zoom gesture detector
                  val gestureDetector =
                      GestureDetector(
                          context,
                          object : GestureDetector.SimpleOnGestureListener() {
                            override fun onDoubleTap(e: MotionEvent): Boolean {
                              val currentZoom = zoomLevel
                              val targetZoom =
                                  if (currentZoom > 1.5f) {
                                    1f // Zoom out to fit
                                  } else {
                                    2.5f // Zoom in
                                  }

                              // Use zoomBy for smooth transition
                              val zoomFactor = targetZoom / currentZoom
                              zoomBy(zoomFactor)

                              // Update zoom level immediately for responsive UI
                              zoomLevel = targetZoom
                              Log.i(
                                  TAG,
                                  "AutoMobile: Double tap zoom from $currentZoom to $targetZoom")

                              return true
                            }
                          })

                  // Set touch listener for double tap detection
                  setOnTouchListener { view, event ->
                    gestureDetector.onTouchEvent(event)
                    false // Let WebView handle other touch events normally
                  }

                  val htmlContent =
                      createMermaidDiagramHtml(
                          mermaidCode = mermaidCode,
                          isDarkMode = isDarkMode,
                          backgroundColor = backgroundColor,
                          textColor = textColor)

                  loadDataWithBaseURL(
                      "https://cdn.jsdelivr.net/", htmlContent, "text/html", "UTF-8", null)
                }
              },
              modifier = Modifier.fillMaxSize())

          // Loading overlay
          if (showLoading) {
            Box(modifier = Modifier.fillMaxSize().background(backgroundColor)) {
              CircularProgressIndicator(modifier = Modifier.align(Alignment.Center))
            }
          }
        }

        // Optional caption
        caption?.let {
          Text(
              text = it,
              style = MaterialTheme.typography.bodyMedium,
              color = textColor,
              modifier = Modifier.padding(top = 16.dp).alpha(contentOpacity))
        }
      }
}

/** Creates HTML content with Mermaid.js diagram rendering using design system colors. */
private fun createMermaidDiagramHtml(
    mermaidCode: String,
    isDarkMode: Boolean,
    backgroundColor: Color,
    textColor: Color
): String {
  val bgColorHex = String.format("#%06X", 0xFFFFFF and backgroundColor.toArgb())
  val textColorHex = String.format("#%06X", 0xFFFFFF and textColor.toArgb())

  // Design system colors
  val orangeHex = String.format("#%06X", 0xFFFFFF and PromoOrange.toArgb())
  val blueHex = String.format("#%06X", 0xFFFFFF and PromoBlue.toArgb())

  // Mermaid theme configuration
  val theme = if (isDarkMode) "dark" else "default"

  return """
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <script src="https://cdn.jsdelivr.net/npm/mermaid@10.6.1/dist/mermaid.min.js"></script>
            <style>
                body {
                    margin: 0;
                    padding: 20px;
                    background-color: $bgColorHex;
                    color: $textColorHex;
                    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    min-height: 100vh;
                }
                .mermaid {
                    max-width: 100%;
                    max-height: 100%;
                }
                .mermaid svg {
                    max-width: 100% !important;
                    height: auto !important;
                }
            </style>
        </head>
        <body>
            <div class="mermaid">
                ${mermaidCode.trim()}
            </div>
            <script>
                mermaid.initialize({
                    startOnLoad: true,
                    theme: '$theme',
                    themeVariables: {
                        primaryColor: '$orangeHex',
                        primaryTextColor: '$textColorHex',
                        primaryBorderColor: '$orangeHex',
                        lineColor: '$textColorHex',
                        secondaryColor: '$blueHex',
                        tertiaryColor: '$bgColorHex',
                        background: '$bgColorHex',
                        mainBkg: '$orangeHex',
                        secondaryBkg: '$blueHex',
                        tertiaryBkg: '${if (isDarkMode) "#3c3c3c" else "#fafafa"}',
                        cScale0: '$orangeHex',
                        cScale1: '$blueHex',
                        cScale2: '${if (isDarkMode) "#cf6679" else "#e1bee7"}'
                    },
                    flowchart: {
                        useMaxWidth: true,
                        htmlLabels: true
                    },
                    sequence: {
                        useMaxWidth: true
                    },
                    gantt: {
                        useMaxWidth: true
                    }
                });
            </script>
        </body>
        </html>
    """
      .trimIndent()
}

@Preview(showBackground = true, name = "Flowchart Light")
@Composable
fun MermaidDiagramSlideItemFlowchartPreview() {
  MaterialTheme {
    MermaidDiagramSlideItem(
        title = "AutoMobile Test Flow",
        mermaidCode =
            """
        flowchart TD
            A[Start Test] --> B{Launch App}
            B -->|Success| C[Execute Actions]
            B -->|Fail| D[Report Error]
            C --> E[Verify Results]
            E -->|Pass| F[Test Complete]
            E -->|Fail| G[Capture Screenshot]
            G --> H[Report Failure]
      """
                .trimIndent(),
        caption = "Automated test execution workflow",
        isDarkMode = false)
  }
}

@Preview(showBackground = true, name = "Sequence Dark")
@Composable
fun MermaidDiagramSlideItemSequencePreview() {
  MaterialTheme {
    MermaidDiagramSlideItem(
        title = "Test Interaction Sequence",
        mermaidCode =
            """
        sequenceDiagram
            participant T as Test
            participant A as App
            participant U as UI Element
            participant S as System

            T->>A: Launch App
            A->>U: Render UI
            T->>U: Tap Button
            U->>S: Trigger Action
            S-->>A: Update State
            A->>U: Update Display
            T->>U: Assert Visible
            U-->>T: Verification Result
      """
                .trimIndent(),
        caption = "How AutoMobile interacts with app components",
        isDarkMode = true)
  }
}
