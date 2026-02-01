package dev.jasonpearson.automobile.sdk.anr

import android.app.ActivityManager
import android.app.ApplicationExitInfo
import android.content.Context
import android.content.Intent
import android.content.SharedPreferences
import android.content.pm.PackageManager
import android.os.Build
import android.util.Log
import androidx.annotation.RequiresApi
import dev.jasonpearson.automobile.protocol.SdkAnrEvent
import dev.jasonpearson.automobile.protocol.SdkDeviceInfo
import dev.jasonpearson.automobile.protocol.SdkEventSerializer

/**
 * SDK API for detecting ANRs (Application Not Responding) from previous sessions.
 *
 * Uses Android's ApplicationExitInfo API (Android 11+) to detect ANRs that occurred
 * in previous sessions and broadcasts them to the AutoMobile accessibility service.
 *
 * Unlike crash detection which happens in real-time, ANR detection happens on app
 * restart because ApplicationExitInfo only provides historical data about past exits.
 *
 * Usage:
 * ```kotlin
 * // Initialize via AutoMobileSDK.initialize() or directly
 * AutoMobileAnr.initialize(applicationContext)
 * ```
 *
 * When an ANR is detected from a previous session:
 * 1. ApplicationExitInfo is queried for REASON_ANR entries
 * 2. New ANRs (not previously reported) are broadcast to AccessibilityService
 * 3. The ANR PID is persisted to avoid duplicate reporting
 */
object AutoMobileAnr {
    private const val TAG = "AutoMobileAnr"

    /** Package name of the AutoMobile AccessibilityService that receives broadcasts */
    private const val ACCESSIBILITY_SERVICE_PACKAGE = "dev.jasonpearson.automobile.accessibilityservice"

    const val ACTION_ANR = "dev.jasonpearson.automobile.sdk.ANR"

    private const val PREFS_NAME = "automobile_anr_prefs"
    private const val KEY_LAST_REPORTED_TIMESTAMP = "last_reported_anr_timestamp"

    /** Maximum number of historical exit reasons to query */
    private const val MAX_EXIT_REASONS = 5

    private var context: Context? = null

    /**
     * Initialize ANR detection with application context.
     *
     * This will query ApplicationExitInfo for any ANRs that occurred in previous
     * sessions and broadcast them to the accessibility service.
     *
     * Does nothing on Android versions below 11 (API 30).
     *
     * @param context Application context (use applicationContext, not activity context)
     */
    fun initialize(context: Context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) {
            Log.d(TAG, "ANR detection requires Android 11+ (API 30)")
            return
        }

        this.context = context.applicationContext
        Log.d(TAG, "AutoMobileAnr initialized, checking for previous ANRs...")
        checkForPreviousAnrs()
    }

    /**
     * Check if ANR detection is available on this device.
     */
    fun isAvailable(): Boolean = Build.VERSION.SDK_INT >= Build.VERSION_CODES.R

    @RequiresApi(Build.VERSION_CODES.R)
    private fun checkForPreviousAnrs() {
        val ctx = context ?: return

        try {
            val am = ctx.getSystemService(Context.ACTIVITY_SERVICE) as? ActivityManager
            if (am == null) {
                Log.w(TAG, "ActivityManager not available")
                return
            }

            // Get exit reasons for our own package (null = current package)
            val exitInfos = am.getHistoricalProcessExitReasons(null, 0, MAX_EXIT_REASONS)
            Log.d(TAG, "Found ${exitInfos.size} historical exit reasons")

            val lastReportedTimestamp = getLastReportedTimestamp(ctx)
            Log.d(TAG, "Last reported ANR timestamp: $lastReportedTimestamp")
            var newestReportedTimestamp = lastReportedTimestamp
            var anrCount = 0

            for (exitInfo in exitInfos) {
                Log.d(TAG, "Exit reason: ${exitInfo.reason} (ANR=${ApplicationExitInfo.REASON_ANR}), pid=${exitInfo.pid}, timestamp=${exitInfo.timestamp}")
                if (exitInfo.reason == ApplicationExitInfo.REASON_ANR) {
                    anrCount++
                    // Only report ANRs we haven't seen before
                    if (exitInfo.timestamp > lastReportedTimestamp) {
                        Log.d(TAG, "Detected NEW previous ANR: pid=${exitInfo.pid}, time=${exitInfo.timestamp}")
                        broadcastAnr(ctx, exitInfo)

                        if (exitInfo.timestamp > newestReportedTimestamp) {
                            newestReportedTimestamp = exitInfo.timestamp
                        }
                    } else {
                        Log.d(TAG, "Skipping already reported ANR: pid=${exitInfo.pid}, time=${exitInfo.timestamp}")
                    }
                }
            }

            Log.d(TAG, "Found $anrCount ANR(s) in exit history")

            // Update the last reported timestamp
            if (newestReportedTimestamp > lastReportedTimestamp) {
                setLastReportedTimestamp(ctx, newestReportedTimestamp)
                Log.d(TAG, "Updated last reported timestamp to $newestReportedTimestamp")
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error checking for previous ANRs", e)
        }
    }

    @RequiresApi(Build.VERSION_CODES.R)
    private fun broadcastAnr(context: Context, exitInfo: ApplicationExitInfo) {
        try {
            // Read the trace from the input stream
            val trace = try {
                exitInfo.traceInputStream?.bufferedReader()?.use { it.readText() }
            } catch (e: Exception) {
                Log.w(TAG, "Failed to read ANR trace", e)
                null
            }

            val event = SdkAnrEvent(
                timestamp = exitInfo.timestamp,
                applicationId = context.packageName,
                pid = exitInfo.pid,
                processName = exitInfo.processName,
                importance = getImportanceName(exitInfo.importance),
                trace = trace,
                reason = "Application Not Responding",
                appVersion = getAppVersion(context),
                deviceInfo = SdkDeviceInfo(
                    model = Build.MODEL,
                    manufacturer = Build.MANUFACTURER,
                    osVersion = Build.VERSION.RELEASE,
                    sdkInt = Build.VERSION.SDK_INT,
                ),
            )

            val intent = Intent(ACTION_ANR).apply {
                // Scope broadcast to only the accessibility service
                setPackage(ACCESSIBILITY_SERVICE_PACKAGE)

                // Type-safe serialized event
                putExtra(SdkEventSerializer.EXTRA_SDK_EVENT_JSON, SdkEventSerializer.toJson(event))
                putExtra(SdkEventSerializer.EXTRA_SDK_EVENT_TYPE, SdkEventSerializer.EventTypes.ANR)
            }

            context.sendBroadcast(intent)
            Log.i(TAG, "Broadcasted ANR: pid=${exitInfo.pid}, process=${exitInfo.processName}")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to broadcast ANR", e)
        }
    }

    private fun getImportanceName(importance: Int): String = when (importance) {
        ActivityManager.RunningAppProcessInfo.IMPORTANCE_FOREGROUND -> "FOREGROUND"
        ActivityManager.RunningAppProcessInfo.IMPORTANCE_FOREGROUND_SERVICE -> "FOREGROUND_SERVICE"
        ActivityManager.RunningAppProcessInfo.IMPORTANCE_TOP_SLEEPING -> "TOP_SLEEPING"
        ActivityManager.RunningAppProcessInfo.IMPORTANCE_VISIBLE -> "VISIBLE"
        ActivityManager.RunningAppProcessInfo.IMPORTANCE_PERCEPTIBLE -> "PERCEPTIBLE"
        ActivityManager.RunningAppProcessInfo.IMPORTANCE_PERCEPTIBLE_PRE_26 -> "PERCEPTIBLE_PRE_26"
        ActivityManager.RunningAppProcessInfo.IMPORTANCE_CANT_SAVE_STATE -> "CANT_SAVE_STATE"
        ActivityManager.RunningAppProcessInfo.IMPORTANCE_SERVICE -> "SERVICE"
        ActivityManager.RunningAppProcessInfo.IMPORTANCE_CACHED -> "CACHED"
        ActivityManager.RunningAppProcessInfo.IMPORTANCE_GONE -> "GONE"
        else -> "UNKNOWN"
    }

    private fun getAppVersion(context: Context): String? {
        return try {
            val packageInfo = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                context.packageManager.getPackageInfo(
                    context.packageName,
                    PackageManager.PackageInfoFlags.of(0),
                )
            } else {
                @Suppress("DEPRECATION")
                context.packageManager.getPackageInfo(context.packageName, 0)
            }
            packageInfo.versionName
        } catch (e: Exception) {
            Log.w(TAG, "Failed to get app version", e)
            null
        }
    }

    private fun getPrefs(context: Context): SharedPreferences {
        return context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    }

    private fun getLastReportedTimestamp(context: Context): Long {
        return getPrefs(context).getLong(KEY_LAST_REPORTED_TIMESTAMP, 0L)
    }

    private fun setLastReportedTimestamp(context: Context, timestamp: Long) {
        getPrefs(context).edit().putLong(KEY_LAST_REPORTED_TIMESTAMP, timestamp).apply()
    }
}
