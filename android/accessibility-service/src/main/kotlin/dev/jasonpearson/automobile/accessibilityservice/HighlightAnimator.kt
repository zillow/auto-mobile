package dev.jasonpearson.automobile.accessibilityservice

import android.animation.Animator
import android.animation.AnimatorListenerAdapter
import android.animation.TimeInterpolator
import android.animation.ValueAnimator
import android.view.animation.AccelerateDecelerateInterpolator
import androidx.annotation.VisibleForTesting

internal class HighlightAnimator(
    private val onAlphaUpdate: (String, Float) -> Unit,
    private val onDrawProgressUpdate: (String, Float) -> Unit,
    private val onAnimationComplete: (String) -> Unit,
    private val onAnimationActiveChanged: (Boolean) -> Unit,
    private val fadeInDurationMs: Long = DEFAULT_FADE_IN_DURATION_MS,
    private val fadeOutDurationMs: Long = DEFAULT_FADE_OUT_DURATION_MS,
    private val displayDurationMs: Long = DEFAULT_DISPLAY_DURATION_MS,
    private val interpolator: TimeInterpolator = DEFAULT_INTERPOLATOR,
) {
  companion object {
    const val DEFAULT_FADE_IN_DURATION_MS = 1000L
    const val DEFAULT_DISPLAY_DURATION_MS = 2000L
    const val DEFAULT_FADE_OUT_DURATION_MS = 3000L
    private val DEFAULT_INTERPOLATOR: TimeInterpolator = AccelerateDecelerateInterpolator()
  }

  private val activeAnimations = mutableMapOf<String, ValueAnimator>()
  private var animationsActive = false

  fun startFadeOut(highlightId: String) {
    cancelInternal(highlightId, updateState = false)

    // Total animation: fade-in (1s) + display (2s) + fade-out (3s) = 6s
    val totalDuration = fadeInDurationMs + displayDurationMs + fadeOutDurationMs
    val fadeInEnd = fadeInDurationMs.toFloat() / totalDuration
    val displayEnd = (fadeInDurationMs + displayDurationMs).toFloat() / totalDuration

    val animator =
        ValueAnimator.ofFloat(0f, 1f).apply {
          duration = totalDuration
          interpolator = this@HighlightAnimator.interpolator
          addUpdateListener { animatorUpdate ->
            if (activeAnimations[highlightId] !== this) {
              return@addUpdateListener
            }
            val progress = animatorUpdate.animatedValue as? Float ?: return@addUpdateListener

            when {
              // Fade-in phase: alpha and draw progress both go 0->1
              progress <= fadeInEnd -> {
                val phase = progress / fadeInEnd
                onAlphaUpdate(highlightId, phase.coerceIn(0f, 1f))
                onDrawProgressUpdate(highlightId, phase.coerceIn(0f, 1f))
              }
              // Display phase: stay at full alpha and full draw
              progress <= displayEnd -> {
                onAlphaUpdate(highlightId, 1f)
                onDrawProgressUpdate(highlightId, 1f)
              }
              // Fade-out phase: alpha goes 1->0, draw stays at 1
              else -> {
                val phase = (progress - displayEnd) / (1f - displayEnd)
                onAlphaUpdate(highlightId, (1f - phase).coerceIn(0f, 1f))
                onDrawProgressUpdate(highlightId, 1f)
              }
            }
          }
        }

    animator.addListener(
        object : AnimatorListenerAdapter() {
          private var canceled = false

          override fun onAnimationCancel(animation: Animator) {
            canceled = true
          }

          override fun onAnimationEnd(animation: Animator) {
            val current = activeAnimations[highlightId]
            if (current === animator) {
              activeAnimations.remove(highlightId)
            }
            updateActiveState()
            if (!canceled && current === animator) {
              onAnimationComplete(highlightId)
            }
          }
        }
    )

    activeAnimations[highlightId] = animator
    updateActiveState()
    animator.start()
  }

  fun cancel(highlightId: String) {
    cancelInternal(highlightId, updateState = true)
  }

  fun cancelAll() {
    if (activeAnimations.isEmpty()) {
      return
    }

    val animations = activeAnimations.values.toList()
    activeAnimations.clear()
    animations.forEach { it.cancel() }
    updateActiveState()
  }

  fun isAnimating(): Boolean = activeAnimations.isNotEmpty()

  @VisibleForTesting
  internal fun getAnimatorForTest(highlightId: String): ValueAnimator? =
      activeAnimations[highlightId]

  private fun cancelInternal(highlightId: String, updateState: Boolean) {
    val animator = activeAnimations.remove(highlightId) ?: return
    animator.cancel()
    if (updateState) {
      updateActiveState()
    }
  }

  private fun updateActiveState() {
    val active = activeAnimations.isNotEmpty()
    if (active == animationsActive) {
      return
    }
    animationsActive = active
    onAnimationActiveChanged(active)
  }
}
