package dev.jasonpearson.automobile.sdk.notifications

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log
import dev.jasonpearson.automobile.sdk.AutoMobileNotifications

class AutoMobileNotificationActionReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent?) {
    if (intent?.action != AutoMobileNotifications.ACTION_NOTIFICATION_ACTION) {
      return
    }

    val actionId = intent.getStringExtra(AutoMobileNotifications.EXTRA_ACTION_ID)
    val notificationId = intent.getIntExtra(AutoMobileNotifications.EXTRA_NOTIFICATION_ID, -1)
    Log.d(TAG, "Notification action tapped: $actionId (notificationId=$notificationId)")
  }

  companion object {
    private const val TAG = "AutoMobileNotifAction"
  }
}
