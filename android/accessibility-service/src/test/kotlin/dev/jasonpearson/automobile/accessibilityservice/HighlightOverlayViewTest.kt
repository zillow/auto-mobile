package dev.jasonpearson.automobile.accessibilityservice

import android.graphics.Rect
import android.graphics.RectF
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment

@RunWith(RobolectricTestRunner::class)
class HighlightOverlayViewTest {

  private lateinit var highlightView: HighlightOverlayView

  @Before
  fun setUp() {
    highlightView = HighlightOverlayView(RuntimeEnvironment.getApplication())
  }

  @Test
  fun `stroke width converts dp to px`() {
    highlightView.resources.displayMetrics.density = 2f

    val strokeWidthPx = highlightView.resolveStrokeWidthPx(8f)

    assertEquals(16f, strokeWidthPx, 0.01f)
  }

  @Test
  fun `calculate dirty rect expands bounds by stroke`() {
    val bounds = RectF(10f, 20f, 110f, 220f)

    val dirtyRect = highlightView.calculateDirtyRect(bounds, strokeWidthPx = 16f)

    assertEquals(Rect(2, 12, 118, 228), dirtyRect)
  }

  @Test
  fun `circle radius uses min bounds`() {
    val bounds = RectF(0f, 0f, 100f, 50f)

    val radius = highlightView.resolveCircleRadius(bounds)

    assertEquals(25f, radius, 0.01f)
  }

  @Test
  fun `dash pattern converts from dp`() {
    highlightView.resources.displayMetrics.density = 2f

    val patternPx = highlightView.resolveDashPatternPx(floatArrayOf(4f, 2f))

    assertArrayEquals(floatArrayOf(8f, 4f), patternPx, 0.01f)
  }

  @Test
  fun `dash pattern rejects odd lengths`() {
    highlightView.resources.displayMetrics.density = 2f

    val patternPx = highlightView.resolveDashPatternPx(floatArrayOf(4f, 2f, 1f))

    assertEquals(null, patternPx)
  }
}
