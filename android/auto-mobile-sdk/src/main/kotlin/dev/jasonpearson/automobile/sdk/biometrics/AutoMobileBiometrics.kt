package dev.jasonpearson.automobile.sdk.biometrics

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.Build
import android.util.Log
import androidx.annotation.VisibleForTesting
import java.util.concurrent.atomic.AtomicReference

/**
 * SDK hook for deterministic biometric testing.
 *
 * Allows test code or the AutoMobile MCP server to inject a known [BiometricResult] so that
 * `BiometricPrompt` flows are testable without requiring actual fingerprint/face hardware
 * interaction.
 *
 * **Dependency configuration:** This class lives in `src/main/` so the SDK can be published as
 * a single artifact. Apps should declare it as `debugImplementation` to prevent it from shipping
 * in release builds. Using `implementation` instead will include the broadcast receiver in
 * production APKs.
 *
 * ## App integration
 *
 * 1. Initialize (called automatically by `AutoMobileSDK.initialize`):
 *    ```kotlin
 *    AutoMobileBiometrics.initialize(applicationContext)
 *    ```
 *
 * 2. Call [consumeOverride] inside every branch of your `BiometricPrompt.AuthenticationCallback`
 *    **before** delegating to your real handler. If an override is active it is returned and
 *    cleared atomically; otherwise `null` is returned and you handle the real system result.
 *
 *    ```kotlin
 *    val prompt = BiometricPrompt(
 *        activity,
 *        executor,
 *        object : BiometricPrompt.AuthenticationCallback() {
 *            override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) {
 *                when (val override = AutoMobileBiometrics.consumeOverride()) {
 *                    is BiometricResult.Failure -> handleFailure()
 *                    is BiometricResult.Cancel  -> handleCancel()
 *                    is BiometricResult.Error   -> handleError(override.errorCode, override.errorMessage)
 *                    is BiometricResult.Success, null -> handleSuccess()
 *                }
 *            }
 *            override fun onAuthenticationFailed() {
 *                when (val override = AutoMobileBiometrics.consumeOverride()) {
 *                    is BiometricResult.Success -> handleSuccess()
 *                    is BiometricResult.Error   -> handleError(override.errorCode, override.errorMessage)
 *                    is BiometricResult.Cancel  -> handleCancel()
 *                    is BiometricResult.Failure, null -> handleFailure()
 *                }
 *            }
 *            override fun onAuthenticationError(errorCode: Int, errString: CharSequence) {
 *                when (val override = AutoMobileBiometrics.consumeOverride()) {
 *                    is BiometricResult.Success -> handleSuccess()
 *                    is BiometricResult.Failure -> handleFailure()
 *                    is BiometricResult.Cancel  -> handleCancel()
 *                    is BiometricResult.Error, null -> handleError(errorCode, errString.toString())
 *                }
 *            }
 *        }
 *    )
 *    ```
 *
 * 3. In test `@Before` setup, call [clearOverride] to prevent stale overrides from a previous
 *    test from affecting the current one.
 *
 * ## How MCP-triggered overrides work
 *
 * The AutoMobile MCP `biometricAuth` tool broadcasts an override intent via ADB and then
 * triggers the biometric callback using `adb emu finger touch` (emulator). The broadcast is
 * received here and stored. When [consumeOverride] is called inside the app's callback the stored
 * result is returned and the override is cleared.
 */
object AutoMobileBiometrics {

    private const val TAG = "AutoMobileBiometrics"

    /** Broadcast action sent by the AutoMobile MCP server to set a biometric override. */
    const val ACTION_BIOMETRIC_OVERRIDE = "dev.jasonpearson.automobile.sdk.BIOMETRIC_OVERRIDE"

    /** String extra: one of "SUCCESS", "FAILURE", "CANCEL", "ERROR". */
    const val EXTRA_RESULT = "result"

    /** Int extra: `BiometricPrompt.ERROR_*` constant; only used when [EXTRA_RESULT] is "ERROR". */
    const val EXTRA_ERROR_CODE = "errorCode"

    /** Long extra: override lifetime in milliseconds (default 5000). */
    const val EXTRA_TTL_MS = "ttlMs"

    private data class PendingOverride(
        val result: BiometricResult,
        val expiryMs: Long,
    )

    private val pendingOverride = AtomicReference<PendingOverride?>(null)
    private var context: Context? = null
    private var receiverRegistered = false

    /**
     * Initialize with application context. Required to receive MCP broadcast overrides.
     * Called automatically by `AutoMobileSDK.initialize`.
     *
     * @param context Application context (use `applicationContext`, not activity context).
     */
    fun initialize(context: Context) {
        this.context = context.applicationContext
        registerReceiver()
    }

    /**
     * Store a biometric override that will be returned by the next [consumeOverride] call.
     *
     * The override expires after [ttlMs] milliseconds to prevent stale values from leaking
     * across test cases. Call [clearOverride] in `@Before` test setup to guarantee a clean state.
     *
     * Any previously stored override is replaced.
     *
     * @param result The result to inject into the next authentication attempt.
     * @param ttlMs Override lifetime in milliseconds (default: 5000).
     */
    fun overrideResult(result: BiometricResult, ttlMs: Long = 5000L) {
        val expiryMs = System.currentTimeMillis() + ttlMs
        pendingOverride.set(PendingOverride(result, expiryMs))
        Log.d(TAG, "Biometric override set: $result (expires in ${ttlMs}ms)")
    }

    /**
     * Clear any stored override.
     *
     * Call this in `@Before` test setup so that stale overrides from a previous test cannot
     * affect the current one.
     */
    fun clearOverride() {
        pendingOverride.set(null)
        Log.d(TAG, "Biometric override cleared")
    }

    /**
     * Consume and return the stored override, or `null` if no override is active or it has expired.
     *
     * This method is atomic: the override is cleared when it is consumed, so it applies to only
     * one authentication attempt.
     *
     * Call this inside **every** branch of your `BiometricPrompt.AuthenticationCallback` before
     * delegating to your real authentication handler. See the class-level documentation for the
     * recommended integration pattern.
     *
     * @return The stored [BiometricResult], or `null` if no override is active.
     */
    fun consumeOverride(): BiometricResult? {
        val override = pendingOverride.get() ?: return null
        if (System.currentTimeMillis() > override.expiryMs) {
            pendingOverride.set(null)
            Log.d(TAG, "Biometric override expired, discarding")
            return null
        }
        return if (pendingOverride.compareAndSet(override, null)) {
            Log.d(TAG, "Biometric override consumed: ${override.result}")
            override.result
        } else {
            null
        }
    }

    @Synchronized
    private fun registerReceiver() {
        if (receiverRegistered) return
        val ctx = context ?: return
        try {
            val filter = IntentFilter(ACTION_BIOMETRIC_OVERRIDE)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                ctx.registerReceiver(broadcastReceiver, filter, Context.RECEIVER_EXPORTED)
            } else {
                @Suppress("UnspecifiedRegisterReceiverFlag")
                ctx.registerReceiver(broadcastReceiver, filter)
            }
            receiverRegistered = true
            Log.d(TAG, "Biometric override broadcast receiver registered")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to register biometric override receiver", e)
        }
    }

    /**
     * Process an incoming biometric override broadcast intent.
     *
     * Visible for testing: allows unit tests to invoke the receiver logic directly
     * without going through Android's broadcast delivery mechanism.
     */
    @VisibleForTesting
    internal fun handleBroadcastIntent(intent: Intent) {
        val resultStr = intent.getStringExtra(EXTRA_RESULT) ?: run {
            Log.w(TAG, "Biometric override broadcast missing '$EXTRA_RESULT' extra")
            return
        }
        val ttlMs = intent.getLongExtra(EXTRA_TTL_MS, 5000L)

        val result: BiometricResult = when (resultStr.uppercase()) {
            "SUCCESS" -> BiometricResult.Success
            "FAILURE" -> BiometricResult.Failure
            "CANCEL" -> BiometricResult.Cancel
            "ERROR" -> {
                val errorCode = if (intent.hasExtra(EXTRA_ERROR_CODE)) {
                    intent.getIntExtra(EXTRA_ERROR_CODE, -1)
                } else {
                    Log.w(TAG, "Biometric ERROR override broadcast missing '$EXTRA_ERROR_CODE' extra; " +
                        "app will receive Error(-1) which is not a valid BiometricPrompt.ERROR_* constant (valid values start at 1)")
                    -1
                }
                BiometricResult.Error(errorCode)
            }
            else -> {
                Log.w(TAG, "Unknown biometric override result: '$resultStr'")
                return
            }
        }

        overrideResult(result, ttlMs)
    }

    private val broadcastReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) {
            handleBroadcastIntent(intent)
        }
    }
}
