package dev.jasonpearson.automobile.sdk.biometrics

/**
 * Represents the result that [AutoMobileBiometrics.overrideResult] will inject into the next
 * biometric authentication attempt.
 *
 * Used by test code or the AutoMobile MCP server to control biometric outcomes deterministically.
 */
sealed class BiometricResult {

    /** Override: authentication succeeds. */
    object Success : BiometricResult()

    /** Override: authentication is rejected (non-matching biometric). */
    object Failure : BiometricResult()

    /** Override: authentication is cancelled by the user. */
    object Cancel : BiometricResult()

    /**
     * Override: authentication encounters a hard error.
     *
     * @param errorCode One of the `BiometricPrompt.ERROR_*` constants, e.g.
     *   `BiometricPrompt.ERROR_LOCKOUT` (7) or `BiometricPrompt.ERROR_HW_UNAVAILABLE` (1).
     * @param errorMessage Human-readable error description (optional; defaults to empty string).
     */
    data class Error(
        val errorCode: Int,
        val errorMessage: String = "",
    ) : BiometricResult()
}
