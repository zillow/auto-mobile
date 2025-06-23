package com.zillow.automobile.junit

import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith

/**
 * Example test class showing usage of AutoMobile JUnitRunner with annotation-based approach to test
 * device availability skipping
 */
@RunWith(AutoMobileRunner::class)
class ClockAppAutoMobileTest {

  @Test
  @AutoMobileTest(plan = "test-plans/launch-clock-app.yaml")
  fun `launch clock app using annotation`() {
    // Traditional annotation-based approach
    // AI assistance disabled for this test
  }

  @Test
  @AutoMobileTest(plan = "test-plans/set-alarm-in-clock-app.yaml")
  fun `set alarm in clock app using annotation`() {
    // Traditional annotation-based approach
    // AI assistance disabled for this test
  }

  // Commented out programmatic tests that use unimplemented AutoMobilePlan classes
  // These will be re-enabled once the AutoMobilePlan implementation is complete

  //  @Test
  //  fun `launch clock app using programmatic approach`() {
  //    // New programmatic approach allows for dynamic parameters
  //    val result = AutoMobilePlan("test-plans/launch-clock-app.yaml") {
  //      "app_name" to "Clock"
  //      "wait_time" to 3000
  //      "debug_mode" to true
  //    }.execute()
  //
  //    assertTrue("Clock app should launch successfully", result.success)
  //    assertTrue(
  //      "Should include successful launch confirmation",
  //      result.output.contains("Clock") || result.success
  //    )
  //  }
  //
  //  @Test
  //  fun `set alarm with dynamic time using programmatic approach`() {
  //    // Generate dynamic alarm time based on current time + 5 minutes
  //    val currentTime = System.currentTimeMillis()
  //    val alarmTime = currentTime + (5 * 60 * 1000) // 5 minutes from now
  //    val formattedTime = formatTimeForAlarm(alarmTime)
  //
  //    val result = AutoMobilePlan("test-plans/set-alarm-in-clock-app.yaml") {
  //      "alarm_time" to formattedTime
  //      "alarm_label" to "Test Alarm - ${System.currentTimeMillis()}"
  //      "sound_type" to "DEFAULT"
  //      "vibrate" to true
  //    }.execute()
  //
  //    assertTrue("Alarm should be set successfully", result.success)
  //    assertEquals(
  //      "Should use the specified alarm time", formattedTime,
  //      result.parametersUsed["alarm_time"]
  //    )
  //  }
  //
  //  @Test
  //  fun `test clock app with different device configurations`() {
  //    // Test with specific device and timeout settings
  //    val options = AutoMobilePlanExecutionOptions(
  //      timeoutMs = 60000L, // 1 minute timeout
  //      device = "auto", // Use any available device
  //      aiAssistance = true, // Enable AI assistance
  //      debugMode = false
  //    )
  //
  //    val result = AutoMobilePlan("test-plans/launch-clock-app.yaml") {
  //      "app_name" to "Clock"
  //      "verify_ui" to true
  //    }.execute(options)
  //
  //    assertTrue("Should launch successfully with custom options", result.success)
  //  }
  //
  //  @Test
  //  fun `test error handling for invalid alarm time`() {
  //    val result = AutoMobilePlan("test-plans/set-alarm-in-clock-app.yaml") {
  //      "alarm_time" to "INVALID_TIME"
  //      "alarm_label" to "Test Invalid"
  //    }.execute(AutoMobilePlanExecutionOptions(aiAssistance = false))
  //
  //    // This test demonstrates error handling - we expect it might fail
  //    // but we want to verify the error message is helpful
  //    if (!result.success) {
  //      assertTrue(
  //        "Should contain meaningful error message",
  //        result.errorMessage.isNotEmpty()
  //      )
  //    }
  //  }
  //
  //  // Helper method to format time for alarm setting
  //  private fun formatTimeForAlarm(timeMillis: Long): String {
  //    val hours = ((timeMillis / (1000 * 60 * 60)) % 24).toInt()
  //    val minutes = ((timeMillis / (1000 * 60)) % 60).toInt()
  //    return String.format("%02d:%02d", hours, minutes)
  //  }
  //
  //  @Test
  //  @AutoMobileTest(
  //    prompt = "Launch the clock app and create a new timer for 5 minutes, then start the timer"
  //  )
  //  fun `create timer from prompt`() {
  //    // This test will generate a YAML plan from the prompt using AI assistance
  //    // The generated plan will be saved as ClockAppAutoMobileTest_create timer from prompt.yaml
  //  }
  //
  //  @Test
  //  @AutoMobileTest(
  //    prompt = "Open the clock app, navigate to alarms, and verify that there are no active alarms
  // set",
  //    aiAssistance = true,
  //  )
  //  fun `verify no active alarms`() {
  //    // Another example of prompt-based test generation
  //    // Plan will be auto-generated and saved to test-plans/generated/
  //  }
}
