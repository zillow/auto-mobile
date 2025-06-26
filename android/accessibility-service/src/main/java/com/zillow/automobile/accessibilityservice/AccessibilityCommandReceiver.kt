package com.zillow.automobile.accessibilityservice

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log

/**
 * Broadcast receiver for handling accessibility commands from ADB and external apps. This receiver
 * forwards commands to the running accessibility service.
 */
class AccessibilityCommandReceiver : BroadcastReceiver() {

  companion object {
    private const val TAG = "AccessibilityCommandReceiver"

    // Actions that this receiver handles
    private const val ACTION_GET_LATEST_HIERARCHY = "com.zillow.automobile.GET_LATEST_HIERARCHY"
    private const val ACTION_GET_HIERARCHY_SYNC = "com.zillow.automobile.GET_HIERARCHY_SYNC"

    // Internal action to communicate with the service
    private const val INTERNAL_ACTION_PREFIX = "com.zillow.automobile.internal."
  }

  override fun onReceive(context: Context?, intent: Intent?) {
    if (context == null || intent == null) return

    Log.d(TAG, "Received broadcast: ${intent.action}")

    when (intent.action) {
      ACTION_GET_LATEST_HIERARCHY -> {
        Log.i(TAG, "Forwarding GET_LATEST_HIERARCHY to accessibility service")
        forwardToService(context, intent)
      }

      ACTION_GET_HIERARCHY_SYNC -> {
        Log.i(TAG, "Forwarding GET_HIERARCHY_SYNC to accessibility service")
        forwardToService(context, intent)
      }

      else -> {
        Log.w(TAG, "Unknown action: ${intent.action}")
      }
    }
  }

  /** Forwards the command to the accessibility service using an internal broadcast */
  private fun forwardToService(context: Context, originalIntent: Intent) {
    try {
      val internalAction =
          when (originalIntent.action) {
            ACTION_GET_LATEST_HIERARCHY -> INTERNAL_ACTION_PREFIX + "GET_LATEST_HIERARCHY"
            ACTION_GET_HIERARCHY_SYNC -> INTERNAL_ACTION_PREFIX + "GET_HIERARCHY_SYNC"
            else -> return
          }

      val internalIntent =
          Intent(internalAction).apply {
            // Copy all extras from the original intent
            originalIntent.extras?.let { putExtras(it) }
            setPackage(context.packageName)
          }

      context.sendBroadcast(internalIntent)
      Log.d(TAG, "Forwarded command to accessibility service with action: $internalAction")
    } catch (e: Exception) {
      Log.e(TAG, "Error forwarding command to accessibility service", e)
    }
  }
}
