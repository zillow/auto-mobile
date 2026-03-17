package dev.jasonpearson.automobile.sdk.os

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.Build
import dev.jasonpearson.automobile.protocol.SdkBroadcastEvent
import dev.jasonpearson.automobile.sdk.events.SdkEventBuffer

/**
 * Intercepts a curated set of system broadcasts and records them as [SdkBroadcastEvent].
 *
 * Only captures broadcast action, categories, and extra key names + type names
 * (not values) to avoid leaking sensitive data.
 */
object AutoMobileBroadcastInterceptor {

  /** Curated system broadcasts to intercept (avoids noise). */
  private val MONITORED_ACTIONS = listOf(
    Intent.ACTION_LOCALE_CHANGED,
    Intent.ACTION_TIMEZONE_CHANGED,
    Intent.ACTION_SCREEN_ON,
    Intent.ACTION_SCREEN_OFF,
    Intent.ACTION_USER_PRESENT,
    Intent.ACTION_PACKAGE_ADDED,
    Intent.ACTION_PACKAGE_REMOVED,
  )

  @Volatile private var buffer: SdkEventBuffer? = null
  @Volatile private var applicationId: String? = null
  private var receiver: BroadcastReceiver? = null

  fun initialize(context: Context, buffer: SdkEventBuffer) {
    this.buffer = buffer
    this.applicationId = context.packageName

    val broadcastReceiver = object : BroadcastReceiver() {
      override fun onReceive(ctx: Context?, intent: Intent?) {
        if (intent == null) return
        val action = intent.action ?: return

        val categories = intent.categories?.toList()
        val extraKeys = intent.extras?.keySet()?.associateWith { key ->
          intent.extras?.get(key)?.javaClass?.simpleName ?: "null"
        }

        buffer.add(
          SdkBroadcastEvent(
            timestamp = System.currentTimeMillis(),
            applicationId = applicationId,
            action = action,
            categories = categories,
            extraKeys = extraKeys,
          )
        )
      }
    }

    receiver = broadcastReceiver

    val filter = IntentFilter().apply {
      MONITORED_ACTIONS.forEach { addAction(it) }
      // Package events need data scheme
      addDataScheme("package")
    }

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      context.registerReceiver(broadcastReceiver, filter, Context.RECEIVER_EXPORTED)
    } else {
      @Suppress("UnspecifiedRegisterReceiverFlag")
      context.registerReceiver(broadcastReceiver, filter)
    }
  }

  fun shutdown(context: Context) {
    receiver?.let {
      try {
        context.unregisterReceiver(it)
      } catch (_: Exception) {}
    }
    receiver = null
    buffer = null
  }
}
