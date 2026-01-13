package dev.jasonpearson.automobile.accessibilityservice

import android.view.animation.AccelerateDecelerateInterpolator
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class HighlightAnimatorTest {

  @Test
  fun `startFadeOut configures duration and interpolator`() {
    val animator =
        HighlightAnimator(
            onAlphaUpdate = { _, _ -> },
            onAnimationComplete = {},
            onAnimationActiveChanged = {},
        )

    animator.startFadeOut("highlight")

    val valueAnimator = animator.getAnimatorForTest("highlight")
    assertNotNull(valueAnimator)
    assertEquals(HighlightAnimator.DEFAULT_FADE_DURATION_MS, valueAnimator!!.duration)
    assertTrue(valueAnimator.interpolator is AccelerateDecelerateInterpolator)
  }

  @Test
  fun `startFadeOut updates alpha and completes`() {
    val updates = mutableListOf<Float>()
    val completions = mutableListOf<String>()
    val activity = mutableListOf<Boolean>()
    val animator =
        HighlightAnimator(
            onAlphaUpdate = { _, alpha -> updates.add(alpha) },
            onAnimationComplete = { id -> completions.add(id) },
            onAnimationActiveChanged = { active -> activity.add(active) },
        )

    animator.startFadeOut("highlight")

    val valueAnimator = animator.getAnimatorForTest("highlight")
    assertNotNull(valueAnimator)
    valueAnimator!!.setCurrentPlayTime(HighlightAnimator.DEFAULT_FADE_DURATION_MS / 2)
    valueAnimator.setCurrentPlayTime(HighlightAnimator.DEFAULT_FADE_DURATION_MS)
    valueAnimator.end()

    assertTrue(updates.isNotEmpty())
    assertTrue(updates.last() <= 0.01f)
    assertEquals(listOf("highlight"), completions)
    assertTrue(activity.first())
    assertTrue(!activity.last())
  }

  @Test
  fun `cancel prevents completion`() {
    val completions = mutableListOf<String>()
    val activity = mutableListOf<Boolean>()
    val animator =
        HighlightAnimator(
            onAlphaUpdate = { _, _ -> },
            onAnimationComplete = { id -> completions.add(id) },
            onAnimationActiveChanged = { active -> activity.add(active) },
        )

    animator.startFadeOut("highlight")
    animator.cancel("highlight")

    assertTrue(completions.isEmpty())
    assertTrue(activity.isNotEmpty())
    assertTrue(!activity.last())
  }
}
