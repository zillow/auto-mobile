package dev.jasonpearson.automobile.sdk

import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.ExperimentalComposeRuntimeApi
import androidx.compose.runtime.InternalComposeApi
import androidx.compose.runtime.RecomposeScope
import androidx.compose.runtime.Recomposer
import androidx.compose.runtime.currentCompositionContext
import androidx.compose.runtime.tooling.CompositionObserver
import androidx.compose.runtime.tooling.CompositionObserverHandle
import androidx.compose.runtime.tooling.CompositionRegistrationObserver
import androidx.compose.runtime.tooling.ObservableComposition
import androidx.compose.runtime.tooling.observe
import java.util.concurrent.ConcurrentHashMap

/**
 * Enables the Compose Observable API for recomposition cause tracking. Call once near the root of
 * your composition.
 */
@OptIn(ExperimentalComposeRuntimeApi::class, InternalComposeApi::class)
@Composable
fun EnableComposeObservableApi() {
  val recomposer = currentCompositionContext as? Recomposer ?: return

  DisposableEffect(recomposer) {
    val handleMap = ConcurrentHashMap<ObservableComposition, CompositionObserverHandle>()

    val observer =
        object : CompositionObserver {
          override fun onBeginComposition(composition: ObservableComposition) = Unit

          override fun onScopeEnter(scope: RecomposeScope) = Unit

          override fun onReadInScope(scope: RecomposeScope, value: Any) = Unit

          override fun onScopeExit(scope: RecomposeScope) = Unit

          override fun onEndComposition(composition: ObservableComposition) = Unit

          override fun onScopeInvalidated(scope: RecomposeScope, value: Any?) {
            ObservableRecompositionBridge.recordInvalidation(scope, value)
          }

          override fun onScopeDisposed(scope: RecomposeScope) {
            ObservableRecompositionBridge.clearScope(scope)
          }
        }

    val registrationObserver =
        object : CompositionRegistrationObserver {
          override fun onCompositionRegistered(composition: ObservableComposition) {
            handleMap[composition] = composition.setObserver(observer)
          }

          override fun onCompositionUnregistered(composition: ObservableComposition) {
            handleMap.remove(composition)?.dispose()
          }
        }

    val registrationHandle = recomposer.observe(registrationObserver)

    onDispose {
      registrationHandle.dispose()
      handleMap.values.forEach { it.dispose() }
      handleMap.clear()
    }
  }
}

internal object ObservableRecompositionBridge {
  private val scopeToId = ConcurrentHashMap<RecomposeScope, String>()
  private val scopeToCause = ConcurrentHashMap<RecomposeScope, String>()

  fun registerScope(id: String, scope: RecomposeScope) {
    if (!RecompositionTracker.isEnabled()) return
    scopeToId[scope] = id
  }

  fun consumeLikelyCause(scope: RecomposeScope): String? {
    return scopeToCause.remove(scope)
  }

  fun recordInvalidation(scope: RecomposeScope, value: Any?) {
    if (!RecompositionTracker.isEnabled()) return
    val cause = inferCause(value)
    if (cause != null) {
      scopeToCause[scope] = cause
    }
  }

  fun clearScope(scope: RecomposeScope) {
    scopeToId.remove(scope)
    scopeToCause.remove(scope)
  }

  private fun inferCause(value: Any?): String? {
    if (value == null) return "unknown"
    return when (value) {
      is kotlin.Function<*> -> "unstable_lambda"
      is Collection<*> -> "collection_change"
      is Map<*, *> -> "collection_change"
      else -> {
        val typeName = value::class.qualifiedName ?: return "unknown"
        when {
          typeName.startsWith("androidx.compose.runtime") -> "state_read"
          else -> "unknown"
        }
      }
    }
  }
}
