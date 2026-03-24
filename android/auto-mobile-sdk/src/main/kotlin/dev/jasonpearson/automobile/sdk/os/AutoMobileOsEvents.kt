package dev.jasonpearson.automobile.sdk.os

import android.app.Activity
import android.app.Application
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.net.NetworkRequest
import android.os.BatteryManager
import android.os.Build
import android.os.Bundle
import androidx.annotation.RequiresPermission
import androidx.lifecycle.DefaultLifecycleObserver
import androidx.lifecycle.LifecycleOwner
import androidx.lifecycle.ProcessLifecycleOwner
import dev.jasonpearson.automobile.protocol.SdkLifecycleEvent
import dev.jasonpearson.automobile.sdk.events.SdkEventBuffer

/**
 * Registers low-overhead OS event listeners and posts [SdkLifecycleEvent] to the buffer.
 *
 * Monitors:
 * - Foreground/background transitions via [ProcessLifecycleOwner]
 * - Connectivity changes via [ConnectivityManager.NetworkCallback]
 * - Battery changes via [BroadcastReceiver]
 * - Screen on/off via [BroadcastReceiver]
 */
object AutoMobileOsEvents {

  @Volatile private var buffer: SdkEventBuffer? = null
  @Volatile private var applicationId: String? = null
  private var connectivityCallback: ConnectivityManager.NetworkCallback? = null
  private var batteryReceiver: BroadcastReceiver? = null
  private var screenReceiver: BroadcastReceiver? = null
  private var lifecycleObserver: DefaultLifecycleObserver? = null
  private var activityCallbacks: Application.ActivityLifecycleCallbacks? = null
  @Volatile private var lastBatteryPct: String? = null
  @Volatile private var lastBatteryCharging: Boolean? = null

  @RequiresPermission(android.Manifest.permission.ACCESS_NETWORK_STATE)
  fun initialize(context: Context, buffer: SdkEventBuffer) {
    this.buffer = buffer
    this.applicationId = context.packageName
    registerLifecycleObserver()
    registerActivityCallbacks(context)
    registerConnectivityCallback(context)
    registerBatteryReceiver(context)
    registerScreenReceiver(context)
  }

  fun shutdown(context: Context) {
    unregisterActivityCallbacks(context)
    unregisterConnectivityCallback(context)
    unregisterBatteryReceiver(context)
    unregisterScreenReceiver(context)
    unregisterLifecycleObserver()
    buffer = null
  }

  private fun postEvent(kind: String, details: Map<String, String>? = null) {
    buffer?.add(
      SdkLifecycleEvent(
        timestamp = System.currentTimeMillis(),
        applicationId = applicationId,
        kind = kind,
        details = details,
      )
    )
  }

  // ---- Foreground/Background ----

  private fun registerLifecycleObserver() {
    val observer = object : DefaultLifecycleObserver {
      override fun onStart(owner: LifecycleOwner) {
        postEvent("foreground")
      }

      override fun onStop(owner: LifecycleOwner) {
        postEvent("background")
      }
    }
    lifecycleObserver = observer
    ProcessLifecycleOwner.get().lifecycle.addObserver(observer)
  }

  private fun unregisterLifecycleObserver() {
    lifecycleObserver?.let {
      ProcessLifecycleOwner.get().lifecycle.removeObserver(it)
    }
    lifecycleObserver = null
  }

  // ---- Activity Lifecycle ----

  private fun registerActivityCallbacks(context: Context) {
    val app = context.applicationContext as? Application ?: return
    val callbacks = object : Application.ActivityLifecycleCallbacks {
      private fun activityName(activity: Activity): String =
        activity.javaClass.simpleName

      override fun onActivityCreated(activity: Activity, savedInstanceState: Bundle?) {
        postEvent("activity_created", mapOf("activity" to activityName(activity)))
      }

      override fun onActivityStarted(activity: Activity) {
        postEvent("activity_started", mapOf("activity" to activityName(activity)))
      }

      override fun onActivityResumed(activity: Activity) {
        postEvent("activity_resumed", mapOf("activity" to activityName(activity)))
      }

      override fun onActivityPaused(activity: Activity) {
        postEvent("activity_paused", mapOf("activity" to activityName(activity)))
      }

      override fun onActivityStopped(activity: Activity) {
        postEvent("activity_stopped", mapOf("activity" to activityName(activity)))
      }

      override fun onActivityDestroyed(activity: Activity) {
        postEvent("activity_destroyed", mapOf("activity" to activityName(activity)))
      }

      override fun onActivitySaveInstanceState(activity: Activity, outState: Bundle) {
        // Not tracked — too noisy and low signal
      }
    }
    activityCallbacks = callbacks
    app.registerActivityLifecycleCallbacks(callbacks)
  }

  private fun unregisterActivityCallbacks(context: Context) {
    val app = context.applicationContext as? Application
    activityCallbacks?.let { cb ->
      app?.unregisterActivityLifecycleCallbacks(cb)
    }
    activityCallbacks = null
  }

  // ---- Connectivity ----

  @RequiresPermission(android.Manifest.permission.ACCESS_NETWORK_STATE)
  private fun registerConnectivityCallback(context: Context) {
    val cm = context.getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager ?: return
    val callback = object : ConnectivityManager.NetworkCallback() {
      override fun onAvailable(network: Network) {
        val caps = cm.getNetworkCapabilities(network)
        val transport = when {
          caps?.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) == true -> "wifi"
          caps?.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR) == true -> "cellular"
          caps?.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET) == true -> "ethernet"
          else -> "other"
        }
        postEvent("connectivity_change", mapOf("connected" to "true", "transport" to transport))
      }

      override fun onLost(network: Network) {
        postEvent("connectivity_change", mapOf("connected" to "false"))
      }
    }
    connectivityCallback = callback
    val request = NetworkRequest.Builder().build()
    cm.registerNetworkCallback(request, callback)
  }

  private fun unregisterConnectivityCallback(context: Context) {
    val cm = context.getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager
    connectivityCallback?.let { cb ->
      try {
        cm?.unregisterNetworkCallback(cb)
      } catch (_: Exception) {}
    }
    connectivityCallback = null
  }

  // ---- Battery ----

  private fun registerBatteryReceiver(context: Context) {
    val receiver = object : BroadcastReceiver() {
      override fun onReceive(ctx: Context?, intent: Intent?) {
        if (intent?.action != Intent.ACTION_BATTERY_CHANGED) return
        val level = intent.getIntExtra(BatteryManager.EXTRA_LEVEL, -1)
        val scale = intent.getIntExtra(BatteryManager.EXTRA_SCALE, -1)
        val pct = if (level >= 0 && scale > 0) ((level.toFloat() / scale) * 100).toInt().toString() else "unknown"
        val plugged = intent.getIntExtra(BatteryManager.EXTRA_PLUGGED, 0)
        val charging = plugged != 0
        // Only post when level or charging state actually changes
        if (pct == lastBatteryPct && charging == lastBatteryCharging) return
        lastBatteryPct = pct
        lastBatteryCharging = charging
        postEvent("battery_change", mapOf("level" to pct, "charging" to charging.toString()))
      }
    }
    batteryReceiver = receiver
    val filter = IntentFilter(Intent.ACTION_BATTERY_CHANGED)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      context.registerReceiver(receiver, filter, Context.RECEIVER_NOT_EXPORTED)
    } else {
      context.registerReceiver(receiver, filter)
    }
  }

  private fun unregisterBatteryReceiver(context: Context) {
    batteryReceiver?.let {
      try {
        context.unregisterReceiver(it)
      } catch (_: Exception) {}
    }
    batteryReceiver = null
  }

  // ---- Screen ----

  private fun registerScreenReceiver(context: Context) {
    val receiver = object : BroadcastReceiver() {
      override fun onReceive(ctx: Context?, intent: Intent?) {
        when (intent?.action) {
          Intent.ACTION_SCREEN_ON -> postEvent("screen_on")
          Intent.ACTION_SCREEN_OFF -> postEvent("screen_off")
        }
      }
    }
    screenReceiver = receiver
    val filter = IntentFilter().apply {
      addAction(Intent.ACTION_SCREEN_ON)
      addAction(Intent.ACTION_SCREEN_OFF)
    }
    context.registerReceiver(receiver, filter)
  }

  private fun unregisterScreenReceiver(context: Context) {
    screenReceiver?.let {
      try {
        context.unregisterReceiver(it)
      } catch (_: Exception) {}
    }
    screenReceiver = null
  }
}
