package dev.jasonpearson.automobile.sdk.failures

/**
 * Device information captured at the time of the exception.
 */
data class DeviceInfo(
    val model: String,
    val manufacturer: String,
    val osVersion: String,
    val sdkInt: Int,
)

/**
 * Represents a handled (non-fatal) exception that was caught and reported by the app.
 *
 * This event is broadcasted to the AccessibilityService which forwards it to the MCP server
 * for recording in the failures database.
 */
data class HandledExceptionEvent(
    /** Unix timestamp when the exception was recorded */
    val timestamp: Long,
    /** Fully qualified class name of the exception (e.g., "java.lang.NullPointerException") */
    val exceptionClass: String,
    /** Exception message, if any */
    val exceptionMessage: String?,
    /** Full stack trace as a string */
    val stackTrace: String,
    /** Optional custom message provided by the developer */
    val customMessage: String?,
    /** Current screen/destination at the time of the exception */
    val currentScreen: String?,
    /** Application package name */
    val packageName: String,
    /** Application version name, if available */
    val appVersion: String?,
    /** Device information */
    val deviceInfo: DeviceInfo,
)
