package dev.jasonpearson.automobile.ctrlproxy

import android.view.View
import android.view.ViewGroup
import android.view.WindowManager
import io.mockk.CapturingSlot
import io.mockk.Runs
import io.mockk.every
import io.mockk.just
import io.mockk.mockk
import io.mockk.slot
import io.mockk.verify
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment

@RunWith(RobolectricTestRunner::class)
class OverlayManagerTest {

  private lateinit var windowManager: WindowManager
  private lateinit var viewSlot: CapturingSlot<View>
  private lateinit var paramsSlot: CapturingSlot<ViewGroup.LayoutParams>

  @Before
  fun setUp() {
    windowManager = mockk(relaxed = true)
    viewSlot = slot()
    paramsSlot = slot()
    every { windowManager.addView(capture(viewSlot), capture(paramsSlot)) } just Runs
    every { windowManager.removeViewImmediate(any()) } just Runs
  }

  private fun createOverlayManager(canDrawOverlays: Boolean): OverlayManager {
    return OverlayManager(
        RuntimeEnvironment.getApplication(),
        windowManager = windowManager,
        canDrawOverlays = { canDrawOverlays },
    )
  }

  @Test
  fun `show uses application overlay when permission granted`() {
    val overlayManager = createOverlayManager(canDrawOverlays = true)
    overlayManager.show()

    verify(exactly = 1) { windowManager.addView(any(), any()) }
    assertTrue(overlayManager.isOverlayAddedForTest())
    assertTrue(overlayManager.isOverlayVisibleForTest())

    val layoutParams = paramsSlot.captured as WindowManager.LayoutParams
    assertEquals(WindowManager.LayoutParams.MATCH_PARENT, layoutParams.width)
    assertEquals(WindowManager.LayoutParams.MATCH_PARENT, layoutParams.height)
    assertEquals(WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY, layoutParams.type)
    assertTrue(
        layoutParams.flags and WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE != 0,
    )
    assertTrue(
        layoutParams.flags and WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE != 0,
    )
  }

  @Test
  fun `show falls back to accessibility overlay when permission denied`() {
    val overlayManager = createOverlayManager(canDrawOverlays = false)
    overlayManager.show()

    val layoutParams = paramsSlot.captured as WindowManager.LayoutParams
    assertEquals(WindowManager.LayoutParams.TYPE_ACCESSIBILITY_OVERLAY, layoutParams.type)
  }

  @Test
  fun `show is idempotent and hide keeps overlay attached`() {
    val overlayManager = createOverlayManager(canDrawOverlays = true)
    overlayManager.show()
    val overlayView = viewSlot.captured

    overlayManager.show()
    verify(exactly = 1) { windowManager.addView(any(), any()) }
    assertEquals(View.VISIBLE, overlayView.visibility)

    overlayManager.hide()
    verify(exactly = 0) { windowManager.removeViewImmediate(any()) }
    assertEquals(View.GONE, overlayView.visibility)
    assertTrue(overlayManager.isOverlayAddedForTest())
    assertFalse(overlayManager.isOverlayVisibleForTest())
  }

  @Test
  fun `destroy removes overlay and clears state`() {
    val overlayManager = createOverlayManager(canDrawOverlays = true)
    overlayManager.show()
    val overlayView = viewSlot.captured

    overlayManager.destroy()

    verify(exactly = 1) { windowManager.removeViewImmediate(overlayView) }
    assertFalse(overlayManager.isOverlayAddedForTest())
    assertFalse(overlayManager.isOverlayVisibleForTest())
    assertNull(overlayManager.getOverlayViewForTest())
  }
}
