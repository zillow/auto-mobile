package dev.jasonpearson.automobile.accessibilityservice

import android.graphics.RectF
import android.os.Looper
import android.view.View
import android.view.WindowManager
import io.mockk.Runs
import io.mockk.every
import io.mockk.just
import io.mockk.mockk
import io.mockk.verify
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.Shadows.shadowOf

@RunWith(RobolectricTestRunner::class)
class OverlayDrawerIntegrationTest {

  private lateinit var windowManager: WindowManager
  private lateinit var highlightView: HighlightOverlayView
  private lateinit var overlayDrawer: OverlayDrawer

  @Before
  fun setUp() {
    val context = RuntimeEnvironment.getApplication()
    windowManager = mockk(relaxed = true)
    every { windowManager.addView(any(), any()) } just Runs
    every { windowManager.removeViewImmediate(any()) } just Runs

    overlayDrawer = OverlayDrawer(context, windowManager = windowManager, canDrawOverlays = { true })
    highlightView = overlayDrawer.getHighlightViewForTest()
  }

  @Test
  fun `addHighlight shows overlay and tracks highlights`() {
    val shape = HighlightShape(ShapeType.BOX, RectF(0f, 0f, 100f, 100f), HighlightStyle())

    overlayDrawer.addHighlight("first", shape)
    shadowOf(Looper.getMainLooper()).idle()

    verify(exactly = 1) { windowManager.addView(any(), any()) }
    assertEquals(View.VISIBLE, highlightView.visibility)
    assertNotNull(highlightView.getHighlightForTest("first"))

    overlayDrawer.addHighlight("second", shape.copy(bounds = RectF(10f, 10f, 50f, 50f)))
    shadowOf(Looper.getMainLooper()).idle()

    verify(exactly = 1) { windowManager.addView(any(), any()) }
    assertNotNull(highlightView.getHighlightForTest("second"))
  }

  @Test
  fun `removeHighlight hides overlay when last highlight removed`() {
    val shape = HighlightShape(ShapeType.BOX, RectF(0f, 0f, 100f, 100f), HighlightStyle())

    overlayDrawer.addHighlight("first", shape)
    shadowOf(Looper.getMainLooper()).idle()

    overlayDrawer.removeHighlight("first")
    shadowOf(Looper.getMainLooper()).idle()

    assertEquals(View.GONE, highlightView.visibility)
    assertNull(highlightView.getHighlightForTest("first"))
  }

  @Test
  fun `updateHighlight replaces stored shape`() {
    val shape = HighlightShape(ShapeType.BOX, RectF(0f, 0f, 100f, 100f), HighlightStyle())
    val updated = shape.copy(bounds = RectF(20f, 20f, 80f, 80f))

    overlayDrawer.addHighlight("first", shape)
    shadowOf(Looper.getMainLooper()).idle()

    overlayDrawer.updateHighlight("first", updated)
    shadowOf(Looper.getMainLooper()).idle()

    val stored = highlightView.getHighlightForTest("first")
    assertNotNull(stored)
    assertEquals(updated.bounds, stored?.bounds)
  }
}
