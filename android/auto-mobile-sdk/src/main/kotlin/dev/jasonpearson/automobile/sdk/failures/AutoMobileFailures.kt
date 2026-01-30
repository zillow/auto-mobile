package dev.jasonpearson.automobile.sdk.failures

import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.util.Log
import dev.jasonpearson.automobile.protocol.SdkDeviceInfo
import dev.jasonpearson.automobile.protocol.SdkEventSerializer
import dev.jasonpearson.automobile.protocol.SdkHandledExceptionEvent
import java.io.PrintWriter
import java.io.StringWriter
import java.util.concurrent.CopyOnWriteArrayList

/**
 * SDK API for reporting handled (non-fatal) exceptions.
 *
 * Handled exceptions are caught and recovered from by the app, but are still worth tracking
 * for debugging and monitoring purposes. They will appear in the Failures dashboard alongside
 * crashes and ANRs.
 *
 * Usage:
 * ```kotlin
 * // Initialize via AutoMobileSDK.initialize() or directly
 * AutoMobileFailures.initialize(applicationContext)
 *
 * // Report a handled exception
 * try {
 *     riskyOperation()
 * } catch (e: Exception) {
 *     handleError(e)
 *     AutoMobileFailures.recordHandledException(e, "Failed during risky operation")
 * }
 * ```
 */
object AutoMobileFailures {
    private const val TAG = "AutoMobileFailures"
    private const val MAX_EVENTS = 100

    /** Package name of the AutoMobile AccessibilityService that receives broadcasts */
    private const val ACCESSIBILITY_SERVICE_PACKAGE = "dev.jasonpearson.automobile.accessibilityservice"

    const val ACTION_HANDLED_EXCEPTION = "dev.jasonpearson.automobile.sdk.HANDLED_EXCEPTION"
    const val EXTRA_TIMESTAMP = "timestamp"
    const val EXTRA_EXCEPTION_CLASS = "exception_class"
    const val EXTRA_EXCEPTION_MESSAGE = "exception_message"
    const val EXTRA_STACK_TRACE = "stack_trace"
    const val EXTRA_CUSTOM_MESSAGE = "custom_message"
    const val EXTRA_CURRENT_SCREEN = "current_screen"
    const val EXTRA_PACKAGE_NAME = "package_name"
    const val EXTRA_APP_VERSION = "app_version"
    const val EXTRA_DEVICE_MODEL = "device_model"
    const val EXTRA_DEVICE_MANUFACTURER = "device_manufacturer"
    const val EXTRA_OS_VERSION = "os_version"
    const val EXTRA_SDK_INT = "sdk_int"

    private var context: Context? = null
    private val recentEvents = CopyOnWriteArrayList<HandledExceptionEvent>()

    /**
     * Initialize the failures API with application context.
     *
     * @param context Application context (use applicationContext, not activity context)
     */
    fun initialize(context: Context) {
        this.context = context.applicationContext
    }

    /**
     * Report a handled (non-fatal) exception.
     *
     * This method is thread-safe and can be called from any thread.
     *
     * @param throwable The exception that was caught and handled
     * @param message Optional additional context message
     */
    fun recordHandledException(
        throwable: Throwable,
        message: String? = null,
    ) {
        recordHandledException(throwable, message, null)
    }

    /**
     * Report a handled exception with screen context.
     *
     * This method is thread-safe and can be called from any thread.
     *
     * @param throwable The exception that was caught and handled
     * @param message Optional additional context message
     * @param currentScreen Optional current screen name (for additional context)
     */
    fun recordHandledException(
        throwable: Throwable,
        message: String? = null,
        currentScreen: String? = null,
    ) {
        val ctx = context
        if (ctx == null) {
            Log.w(
                TAG,
                "AutoMobileFailures not initialized; call AutoMobileSDK.initialize() or " +
                    "AutoMobileFailures.initialize().",
            )
            return
        }

        try {
            val event = createEvent(ctx, throwable, message, currentScreen)
            storeEvent(event)
            broadcastEvent(ctx, event)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to record handled exception", e)
        }
    }

    /**
     * Get recent handled exceptions stored in memory.
     *
     * @return List of recent events (up to [MAX_EVENTS])
     */
    fun getRecentEvents(): List<HandledExceptionEvent> = recentEvents.toList()

    /**
     * Clear all stored events from memory.
     */
    fun clearEvents() {
        recentEvents.clear()
    }

    /**
     * Get the current event count.
     */
    fun getEventCount(): Int = recentEvents.size

    private fun createEvent(
        context: Context,
        throwable: Throwable,
        customMessage: String?,
        currentScreen: String?,
    ): HandledExceptionEvent {
        val stackTrace = StringWriter().also { throwable.printStackTrace(PrintWriter(it)) }.toString()

        return HandledExceptionEvent(
            timestamp = System.currentTimeMillis(),
            exceptionClass = throwable.javaClass.name,
            exceptionMessage = throwable.message,
            stackTrace = stackTrace,
            customMessage = customMessage,
            currentScreen = currentScreen,
            packageName = context.packageName,
            appVersion = getAppVersion(context),
            deviceInfo =
                DeviceInfo(
                    model = Build.MODEL,
                    manufacturer = Build.MANUFACTURER,
                    osVersion = Build.VERSION.RELEASE,
                    sdkInt = Build.VERSION.SDK_INT,
                ),
        )
    }

    private fun storeEvent(event: HandledExceptionEvent) {
        recentEvents.add(event)

        // Trim to max size if needed (remove oldest events)
        while (recentEvents.size > MAX_EVENTS) {
            recentEvents.removeAt(0)
        }
    }

    private fun broadcastEvent(
        context: Context,
        event: HandledExceptionEvent,
    ) {
        try {
            // Create protocol event for type-safe serialization
            val sdkEvent = SdkHandledExceptionEvent(
                timestamp = event.timestamp,
                applicationId = event.packageName,
                exceptionClass = event.exceptionClass,
                exceptionMessage = event.exceptionMessage,
                stackTrace = event.stackTrace,
                customMessage = event.customMessage,
                currentScreen = event.currentScreen,
                appVersion = event.appVersion,
                deviceInfo = SdkDeviceInfo(
                    model = event.deviceInfo.model,
                    manufacturer = event.deviceInfo.manufacturer,
                    osVersion = event.deviceInfo.osVersion,
                    sdkInt = event.deviceInfo.sdkInt,
                ),
            )

            val intent =
                Intent(ACTION_HANDLED_EXCEPTION).apply {
                    // Scope broadcast to only the accessibility service to prevent data leakage
                    // and spoofing from other installed apps
                    setPackage(ACCESSIBILITY_SERVICE_PACKAGE)

                    // Type-safe serialized event (new protocol)
                    putExtra(SdkEventSerializer.EXTRA_SDK_EVENT_JSON, SdkEventSerializer.toJson(sdkEvent))
                    putExtra(SdkEventSerializer.EXTRA_SDK_EVENT_TYPE, SdkEventSerializer.EventTypes.HANDLED_EXCEPTION)

                    // Legacy extras for backward compatibility with older AccessibilityService versions
                    putExtra(EXTRA_TIMESTAMP, event.timestamp)
                    putExtra(EXTRA_EXCEPTION_CLASS, event.exceptionClass)
                    putExtra(EXTRA_EXCEPTION_MESSAGE, event.exceptionMessage)
                    putExtra(EXTRA_STACK_TRACE, event.stackTrace)
                    putExtra(EXTRA_CUSTOM_MESSAGE, event.customMessage)
                    putExtra(EXTRA_CURRENT_SCREEN, event.currentScreen)
                    putExtra(EXTRA_PACKAGE_NAME, event.packageName)
                    putExtra(EXTRA_APP_VERSION, event.appVersion)
                    putExtra(EXTRA_DEVICE_MODEL, event.deviceInfo.model)
                    putExtra(EXTRA_DEVICE_MANUFACTURER, event.deviceInfo.manufacturer)
                    putExtra(EXTRA_OS_VERSION, event.deviceInfo.osVersion)
                    putExtra(EXTRA_SDK_INT, event.deviceInfo.sdkInt)
                }
            context.sendBroadcast(intent)
            Log.d(TAG, "Broadcasted handled exception: ${event.exceptionClass}")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to broadcast handled exception", e)
        }
    }

    private fun getAppVersion(context: Context): String? {
        return try {
            val packageInfo =
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
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
