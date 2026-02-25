package dev.jasonpearson.automobile.sdk.biometrics

import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class AutoMobileBiometricsTest {

    @Before
    fun setup() {
        AutoMobileBiometrics.clearOverride()
    }

    @After
    fun tearDown() {
        AutoMobileBiometrics.clearOverride()
    }

    // -------------------------------------------------------------------------
    // consumeOverride – basic result types
    // -------------------------------------------------------------------------

    @Test
    fun `consumeOverride returns null when no override is set`() {
        assertNull(AutoMobileBiometrics.consumeOverride())
    }

    @Test
    fun `consumeOverride returns Success after overrideResult Success`() {
        AutoMobileBiometrics.overrideResult(BiometricResult.Success)
        assertEquals(BiometricResult.Success, AutoMobileBiometrics.consumeOverride())
    }

    @Test
    fun `consumeOverride returns Failure after overrideResult Failure`() {
        AutoMobileBiometrics.overrideResult(BiometricResult.Failure)
        assertEquals(BiometricResult.Failure, AutoMobileBiometrics.consumeOverride())
    }

    @Test
    fun `consumeOverride returns Cancel after overrideResult Cancel`() {
        AutoMobileBiometrics.overrideResult(BiometricResult.Cancel)
        assertEquals(BiometricResult.Cancel, AutoMobileBiometrics.consumeOverride())
    }

    @Test
    fun `consumeOverride returns Error with errorCode after overrideResult Error`() {
        AutoMobileBiometrics.overrideResult(BiometricResult.Error(errorCode = 7))
        val consumed = AutoMobileBiometrics.consumeOverride()
        assertNotNull(consumed)
        assertTrue(consumed is BiometricResult.Error)
        assertEquals(7, (consumed as BiometricResult.Error).errorCode)
    }

    @Test
    fun `consumeOverride returns Error with errorCode and errorMessage`() {
        AutoMobileBiometrics.overrideResult(BiometricResult.Error(errorCode = 5, errorMessage = "Lockout"))
        val consumed = AutoMobileBiometrics.consumeOverride()
        assertNotNull(consumed)
        val error = consumed as BiometricResult.Error
        assertEquals(5, error.errorCode)
        assertEquals("Lockout", error.errorMessage)
    }

    // -------------------------------------------------------------------------
    // Single-use / atomicity
    // -------------------------------------------------------------------------

    @Test
    fun `consumeOverride clears override after first call`() {
        AutoMobileBiometrics.overrideResult(BiometricResult.Success)
        AutoMobileBiometrics.consumeOverride()
        assertNull(AutoMobileBiometrics.consumeOverride())
    }

    @Test
    fun `clearOverride removes a pending override`() {
        AutoMobileBiometrics.overrideResult(BiometricResult.Success)
        AutoMobileBiometrics.clearOverride()
        assertNull(AutoMobileBiometrics.consumeOverride())
    }

    @Test
    fun `overrideResult replaces an existing override`() {
        AutoMobileBiometrics.overrideResult(BiometricResult.Success)
        AutoMobileBiometrics.overrideResult(BiometricResult.Failure)
        assertEquals(BiometricResult.Failure, AutoMobileBiometrics.consumeOverride())
    }

    // -------------------------------------------------------------------------
    // TTL expiry
    // -------------------------------------------------------------------------

    @Test
    fun `consumeOverride returns null when override has already expired`() {
        // Negative TTL → expiryMs is in the past immediately
        AutoMobileBiometrics.overrideResult(BiometricResult.Success, ttlMs = -1L)
        assertNull(AutoMobileBiometrics.consumeOverride())
    }

    @Test
    fun `consumeOverride returns result when override has not expired`() {
        AutoMobileBiometrics.overrideResult(BiometricResult.Failure, ttlMs = 60_000L)
        assertEquals(BiometricResult.Failure, AutoMobileBiometrics.consumeOverride())
    }

    // -------------------------------------------------------------------------
    // BiometricResult model
    // -------------------------------------------------------------------------

    @Test
    fun `Error has default empty errorMessage`() {
        val error = BiometricResult.Error(errorCode = 1)
        assertEquals("", error.errorMessage)
    }

    @Test
    fun `Error equality is based on errorCode and errorMessage`() {
        assertEquals(BiometricResult.Error(7, "Lockout"), BiometricResult.Error(7, "Lockout"))
        assertTrue(BiometricResult.Error(7) != BiometricResult.Error(5))
    }

    // -------------------------------------------------------------------------
    // Constants
    // -------------------------------------------------------------------------

    @Test
    fun `ACTION_BIOMETRIC_OVERRIDE has expected value`() {
        assertEquals(
            "dev.jasonpearson.automobile.sdk.BIOMETRIC_OVERRIDE",
            AutoMobileBiometrics.ACTION_BIOMETRIC_OVERRIDE,
        )
    }

    @Test
    fun `extra key constants have expected values`() {
        assertEquals("result", AutoMobileBiometrics.EXTRA_RESULT)
        assertEquals("errorCode", AutoMobileBiometrics.EXTRA_ERROR_CODE)
        assertEquals("ttlMs", AutoMobileBiometrics.EXTRA_TTL_MS)
    }
}
