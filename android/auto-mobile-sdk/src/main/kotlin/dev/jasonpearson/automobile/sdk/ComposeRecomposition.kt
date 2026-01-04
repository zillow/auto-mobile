package dev.jasonpearson.automobile.sdk

import androidx.compose.runtime.Composable
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.currentRecomposeScope
import androidx.compose.ui.composed
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.SemanticsPropertyKey
import androidx.compose.ui.semantics.SemanticsPropertyReceiver
import androidx.compose.ui.semantics.semantics

private val AutoMobileRecompositionIdKey = SemanticsPropertyKey<String>("auto-mobile-recomposition-id")

var SemanticsPropertyReceiver.autoMobileRecompositionId by AutoMobileRecompositionIdKey

/**
 * Marks a composable with a stable recomposition id for accessibility extraction.
 */
fun Modifier.autoMobileRecompositionId(id: String): Modifier {
    return semantics { autoMobileRecompositionId = id }
}

/**
 * Adds the recomposition id semantics and records recompositions while enabled.
 */
fun Modifier.autoMobileRecomposition(
    id: String,
    composableName: String? = null,
    resourceId: String? = null,
    testTag: String? = null,
    parentChain: List<String>? = null,
    stableAnnotated: Boolean? = null,
    rememberedCount: Int? = null,
    likelyCause: String? = null
): Modifier = composed {
    val scope = currentRecomposeScope
    SideEffect {
        ObservableRecompositionBridge.registerScope(id, scope)
        val resolvedCause = likelyCause ?: ObservableRecompositionBridge.consumeLikelyCause(scope)
        RecompositionTracker.recordRecomposition(
            id = id,
            composableName = composableName,
            resourceId = resourceId,
            testTag = testTag,
            parentChain = parentChain,
            stableAnnotated = stableAnnotated,
            rememberedCount = rememberedCount,
            likelyCause = resolvedCause
        )
    }

    semantics { autoMobileRecompositionId = id }
}

/**
 * Records a recomposition for the current composable.
 * Call this from within a composable you want to track.
 */
@Composable
fun TrackRecomposition(
    id: String,
    composableName: String? = null,
    resourceId: String? = null,
    testTag: String? = null,
    parentChain: List<String>? = null,
    stableAnnotated: Boolean? = null,
    rememberedCount: Int? = null,
    likelyCause: String? = null
) {
    val scope = currentRecomposeScope
    SideEffect {
        ObservableRecompositionBridge.registerScope(id, scope)
        val resolvedCause = likelyCause ?: ObservableRecompositionBridge.consumeLikelyCause(scope)
        RecompositionTracker.recordRecomposition(
            id = id,
            composableName = composableName,
            resourceId = resourceId,
            testTag = testTag,
            parentChain = parentChain,
            stableAnnotated = stableAnnotated,
            rememberedCount = rememberedCount,
            likelyCause = resolvedCause
        )
    }
}

/**
 * Records a recomposition and measures composition duration for the wrapped content.
 */
@Composable
fun TrackRecomposition(
    id: String,
    composableName: String? = null,
    resourceId: String? = null,
    testTag: String? = null,
    parentChain: List<String>? = null,
    stableAnnotated: Boolean? = null,
    rememberedCount: Int? = null,
    likelyCause: String? = null,
    content: @Composable () -> Unit
) {
    val scope = currentRecomposeScope
    val startTimeNs = System.nanoTime()
    content()
    SideEffect {
        val durationMs = (System.nanoTime() - startTimeNs).toDouble() / 1_000_000.0
        ObservableRecompositionBridge.registerScope(id, scope)
        val resolvedCause = likelyCause ?: ObservableRecompositionBridge.consumeLikelyCause(scope)
        RecompositionTracker.recordRecomposition(
            id = id,
            composableName = composableName,
            resourceId = resourceId,
            testTag = testTag,
            parentChain = parentChain,
            stableAnnotated = stableAnnotated,
            rememberedCount = rememberedCount,
            likelyCause = resolvedCause
        )
        RecompositionTracker.recordDuration(id, durationMs)
    }
}
