package dev.jasonpearson.automobile.sdk.crashes

import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.util.Log
import dev.jasonpearson.automobile.protocol.SdkCrashEvent
import dev.jasonpearson.automobile.protocol.SdkDeviceInfo
import dev.jasonpearson.automobile.protocol.SdkEventSerializer
import java.io.PrintWriter
import java.io.StringWriter

/**
 * SDK API for detecting and reporting unhandled crashes.
 *
 * Similar to Firebase Crashlytics or Bugsnag, this installs an UncaughtExceptionHandler
 * that broadcasts crash information to the accessibility service before the app terminates.
 *
 * Usage:
 * ```kotlin
 * // Initialize via AutoMobileSDK.initialize() or directly
 * AutoMobileCrashes.initialize(applicationContext)
 * ```
 *
 * When a crash occurs:
 * 1. The UncaughtExceptionHandler captures the exception
 * 2. Crash info is broadcast to the AutoMobile accessibility service
 * 3. The original handler is called (to preserve default crash behavior)
 */
object AutoMobileCrashes {
    private const val TAG = "AutoMobileCrashes"

    /** Package name of the AutoMobile AccessibilityService that receives broadcasts */
    private const val ACCESSIBILITY_SERVICE_PACKAGE = "dev.jasonpearson.automobile.accessibilityservice"

    const val ACTION_CRASH = "dev.jasonpearson.automobile.sdk.CRASH"
    const val EXTRA_TIMESTAMP = "timestamp"
    const val EXTRA_EXCEPTION_CLASS = "exception_class"
    const val EXTRA_EXCEPTION_MESSAGE = "exception_message"
    const val EXTRA_STACK_TRACE = "stack_trace"
    const val EXTRA_THREAD_NAME = "thread_name"
    const val EXTRA_CURRENT_SCREEN = "current_screen"
    const val EXTRA_PACKAGE_NAME = "package_name"
    const val EXTRA_APP_VERSION = "app_version"
    const val EXTRA_DEVICE_MODEL = "device_model"
    const val EXTRA_DEVICE_MANUFACTURER = "device_manufacturer"
    const val EXTRA_OS_VERSION = "os_version"
    const val EXTRA_SDK_INT = "sdk_int"

    private var context: Context? = null
    private var originalHandler: Thread.UncaughtExceptionHandler? = null
    private var isInstalled = false

    /** Provider for current screen name - set by navigation tracking */
    var currentScreenProvider: (() -> String?)? = null

    /**
     * Initialize crash detection with application context.
     *
     * This installs an UncaughtExceptionHandler that will:
     * 1. Broadcast crash info to the accessibility service
     * 2. Call the original handler (preserving default behavior)
     *
     * @param context Application context (use applicationContext, not activity context)
     */
    fun initialize(context: Context) {
        if (isInstalled) {
            Log.d(TAG, "AutoMobileCrashes already initialized")
            return
        }

        this.context = context.applicationContext

        // Save the original handler
        originalHandler = Thread.getDefaultUncaughtExceptionHandler()

        // Install our handler
        Thread.setDefaultUncaughtExceptionHandler(AutoMobileExceptionHandler())
        isInstalled = true

        Log.d(TAG, "AutoMobileCrashes initialized - crash detection enabled")
    }

    /**
     * Check if crash detection is initialized.
     */
    fun isInitialized(): Boolean = isInstalled

    private class AutoMobileExceptionHandler : Thread.UncaughtExceptionHandler {
        override fun uncaughtException(thread: Thread, throwable: Throwable) {
            try {
                // Broadcast the crash before the app terminates
                broadcastCrash(thread, throwable)
            } catch (e: Exception) {
                Log.e(TAG, "Failed to broadcast crash", e)
            }

            // Call the original handler to preserve default crash behavior
            // This ensures the app terminates normally and system crash dialogs appear
            originalHandler?.uncaughtException(thread, throwable)
        }
    }

    private fun broadcastCrash(thread: Thread, throwable: Throwable) {
        val ctx = context ?: run {
            Log.w(TAG, "Context not available, cannot broadcast crash")
            return
        }

        try {
            val timestamp = System.currentTimeMillis()
            val stackTrace = StringWriter().also { throwable.printStackTrace(PrintWriter(it)) }.toString()
            val currentScreen = currentScreenProvider?.invoke()
            val appVersion = getAppVersion(ctx)

            // Create protocol event for type-safe serialization
            val sdkEvent = SdkCrashEvent(
                timestamp = timestamp,
                applicationId = ctx.packageName,
                exceptionClass = throwable.javaClass.name,
                exceptionMessage = throwable.message,
                stackTrace = stackTrace,
                threadName = thread.name,
                currentScreen = currentScreen,
                appVersion = appVersion,
                deviceInfo = SdkDeviceInfo(
                    model = Build.MODEL,
                    manufacturer = Build.MANUFACTURER,
                    osVersion = Build.VERSION.RELEASE,
                    sdkInt = Build.VERSION.SDK_INT,
                ),
            )

            val intent = Intent(ACTION_CRASH).apply {
                // Scope broadcast to only the accessibility service to prevent data leakage
                setPackage(ACCESSIBILITY_SERVICE_PACKAGE)

                // Type-safe serialized event (new protocol)
                putExtra(SdkEventSerializer.EXTRA_SDK_EVENT_JSON, SdkEventSerializer.toJson(sdkEvent))
                putExtra(SdkEventSerializer.EXTRA_SDK_EVENT_TYPE, SdkEventSerializer.EventTypes.CRASH)

                // Legacy extras for backward compatibility
                putExtra(EXTRA_TIMESTAMP, timestamp)
                putExtra(EXTRA_EXCEPTION_CLASS, throwable.javaClass.name)
                putExtra(EXTRA_EXCEPTION_MESSAGE, throwable.message)
                putExtra(EXTRA_STACK_TRACE, stackTrace)
                putExtra(EXTRA_THREAD_NAME, thread.name)
                putExtra(EXTRA_CURRENT_SCREEN, currentScreen)
                putExtra(EXTRA_PACKAGE_NAME, ctx.packageName)
                putExtra(EXTRA_APP_VERSION, appVersion)
                putExtra(EXTRA_DEVICE_MODEL, Build.MODEL)
                putExtra(EXTRA_DEVICE_MANUFACTURER, Build.MANUFACTURER)
                putExtra(EXTRA_OS_VERSION, Build.VERSION.RELEASE)
                putExtra(EXTRA_SDK_INT, Build.VERSION.SDK_INT)
            }

            ctx.sendBroadcast(intent)
            Log.i(TAG, "Broadcasted crash: ${throwable.javaClass.name} on thread ${thread.name}")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to broadcast crash", e)
        }
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
}
