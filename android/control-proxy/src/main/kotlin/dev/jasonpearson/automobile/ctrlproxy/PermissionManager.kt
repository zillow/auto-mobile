package dev.jasonpearson.automobile.ctrlproxy

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import android.util.Log

class PermissionManager(private val context: Context) {

  companion object {
    private const val TAG = "PermissionManager"
    const val PERMISSION_DRAW_OVERLAY = "draw_overlay"
  }

  data class PermissionState(
      val permission: String,
      val granted: Boolean,
      val requestLaunched: Boolean,
      val canRequest: Boolean,
      val requiresSettings: Boolean,
      val error: String?,
      val instructions: String?,
      val adbCommand: String?,
  )

  fun canDrawOverlays(): Boolean {
    return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
      Settings.canDrawOverlays(context)
    } else {
      true
    }
  }

  fun getPermissionState(permission: String?, requestPermission: Boolean = true): PermissionState {
    return when (permission) {
      PERMISSION_DRAW_OVERLAY -> getDrawOverlayState(requestPermission)
      null ->
          PermissionState(
              permission = "unknown",
              granted = false,
              requestLaunched = false,
              canRequest = false,
              requiresSettings = false,
              error = "Permission name is required",
              instructions = null,
              adbCommand = null,
          )
      else ->
          PermissionState(
              permission = permission,
              granted = false,
              requestLaunched = false,
              canRequest = false,
              requiresSettings = false,
              error = "Unknown permission: $permission",
              instructions = null,
              adbCommand = null,
          )
    }
  }

  fun requestDrawOverlayPermission(): Boolean {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) {
      return false
    }

    return try {
      val intent =
          Intent(
              Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
              Uri.parse("package:${context.packageName}"),
          )
      intent.flags = Intent.FLAG_ACTIVITY_NEW_TASK
      context.startActivity(intent)
      true
    } catch (e: Exception) {
      Log.w(TAG, "Unable to launch overlay permission settings", e)
      false
    }
  }

  private fun getDrawOverlayState(requestPermission: Boolean): PermissionState {
    val granted = canDrawOverlays()
    val requiresSettings = Build.VERSION.SDK_INT >= Build.VERSION_CODES.M
    val canRequest = requiresSettings && canResolveOverlaySettings()

    var requestLaunched = false
    var error: String? = null
    var instructions: String? = null

    if (!granted) {
      instructions =
          "Enable Display over other apps for AutoMobile Accessibility Service in system settings."
      error = "SYSTEM_ALERT_WINDOW permission not granted."

      if (requestPermission && canRequest) {
        requestLaunched = requestDrawOverlayPermission()
        if (!requestLaunched) {
          error = "SYSTEM_ALERT_WINDOW permission not granted; unable to launch overlay settings."
        }
      }
    }

    val adbCommand =
        if (!granted) {
          "adb shell appops set ${context.packageName} SYSTEM_ALERT_WINDOW allow"
        } else {
          null
        }

    return PermissionState(
        permission = PERMISSION_DRAW_OVERLAY,
        granted = granted,
        requestLaunched = requestLaunched,
        canRequest = canRequest,
        requiresSettings = requiresSettings,
        error = error,
        instructions = instructions,
        adbCommand = adbCommand,
    )
  }

  private fun canResolveOverlaySettings(): Boolean {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) {
      return false
    }

    val intent =
        Intent(
            Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
            Uri.parse("package:${context.packageName}"),
        )
    return intent.resolveActivity(context.packageManager) != null
  }
}
