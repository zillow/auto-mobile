package com.zillow.automobile.slides.examples

import com.zillow.automobile.slides.model.SlideContent

/**
 * Example usage of the new CodeSample highlighting feature. This demonstrates how to highlight
 * specific lines in code samples for presentations.
 */
object HighlightingExample {

  /** Example 1: Highlighting specific lines in Android log output */
  fun createWindowManagerLogSlide(): SlideContent.CodeSample {
    return SlideContent.CodeSample(
        code =
            """
        keepClearAreas: restricted=[], unrestricted=[]
        mPrepareSyncSeqId=0

        mGlobalConfiguration={1.0 310mcc260mnc [en_US] ldltr sw448dp w997dp h448dp 360dpi nrml long hdr widecg land finger -keyb/v/h -nav/h winConfig={ mBounds=Rect(0, 0 - 2244, 1008) mAppBounds=Rect(0, 0 - 2244, 1008) mMaxBounds=Rect(0, 0 - 2244, 1008) mDisplayRotation=ROTATION_90 mWindowingMode=fullscreen mActivityType=undefined mAlwaysOnTop=undefined mRotation=ROTATION_90} s.6257 fontWeightAdjustment=0}
        mHasPermanentDpad=false
        mTopFocusedDisplayId=0
        imeLayeringTarget in display# 0 Window{ea58714 u0 com.zillow.automobile.playground/com.zillow.automobile.playground.MainActivity}
        imeInputTarget in display# 0 Window{ea58714 u0 com.zillow.automobile.playground/com.zillow.automobile.playground.MainActivity}
        imeControlTarget in display# 0 Window{ea58714 u0 com.zillow.automobile.playground/com.zillow.automobile.playground.MainActivity}
        Minimum task size of display#0 220  mBlurEnabled=true
        mLastDisplayFreezeDuration=0 due to new-config
        mDisableSecureWindows=false
        mHighResSnapshotScale=0.8
        mSnapshotEnabled=true
        SnapshotCache Task
      """
                .trimIndent(),
        language = "shell",
        title = "Window Manager Debug Output",
        highlight =
            """
        imeLayeringTarget in display# 0 Window{ea58714 u0 com.zillow.automobile.playground/com.zillow.automobile.playground.MainActivity}
        imeInputTarget in display# 0 Window{ea58714 u0 com.zillow.automobile.playground/com.zillow.automobile.playground.MainActivity}
        imeControlTarget in display# 0 Window{ea58714 u0 com.zillow.automobile.playground/com.zillow.automobile.playground.MainActivity}
      """
                .trimIndent())
  }

  /** Example 2: Highlighting key test methods in Kotlin code */
  fun createTestCodeSlide(): SlideContent.CodeSample {
    return SlideContent.CodeSample(
        code =
            """
        @Test
        fun testLoginFlow() {
            // Launch the app
            tapOn(text = "Login")

            // Enter credentials
            inputText("user@example.com")
            tapOn(text = "Next")
            inputText("password123")

            // Submit login
            tapOn(text = "Sign In")

            // Verify success
            assertVisible(text = "Welcome")
        }

        @Test
        fun testLogoutFlow() {
            // Navigate to settings
            tapOn(text = "Settings")

            // Tap logout
            tapOn(text = "Logout")

            // Confirm logout
            tapOn(text = "Confirm")

            // Verify back to login screen
            assertVisible(text = "Login")
        }
      """
                .trimIndent(),
        language = "kotlin",
        title = "AutoMobile Test Examples",
        highlight =
            """
        tapOn(text = "Login")
        inputText("user@example.com")
        tapOn(text = "Sign In")
        assertVisible(text = "Welcome")
      """
                .trimIndent())
  }

  /** Example 3: Highlighting configuration changes in YAML */
  fun createConfigurationSlide(): SlideContent.CodeSample {
    return SlideContent.CodeSample(
        code =
            """
        # AutoMobile Test Plan
        name: "User Login Flow"
        version: "1.0"

        steps:
          - action: "tap"
            selector:
              text: "Login"
            description: "Tap the login button"

          - action: "inputText"
            text: "user@example.com"
            description: "Enter email address"

          - action: "tap"
            selector:
              text: "Next"
            description: "Proceed to password"

          - action: "inputText"
            text: "password123"
            description: "Enter password"

          - action: "tap"
            selector:
              text: "Sign In"
            description: "Submit credentials"

          - action: "assertVisible"
            selector:
              text: "Welcome"
            description: "Verify successful login"
      """
                .trimIndent(),
        language = "yaml",
        title = "AutoMobile Test Plan Configuration",
        highlight =
            """
        action: "tap"
        action: "inputText"
        action: "assertVisible"
      """
                .trimIndent())
  }

  /** Example 4: Highlighting specific API calls in JSON response */
  fun createApiResponseSlide(): SlideContent.CodeSample {
    return SlideContent.CodeSample(
        code =
            """
        {
          "status": "success",
          "data": {
            "user": {
              "id": 12345,
              "name": "John Doe",
              "email": "john.doe@example.com",
              "preferences": {
                "theme": "dark",
                "notifications": true,
                "language": "en"
              }
            },
            "session": {
              "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
              "expires": "2024-12-31T23:59:59Z",
              "refresh_token": "rt_abc123def456"
            }
          },
          "timestamp": "2024-01-15T10:30:00Z",
          "request_id": "req_789xyz"
        }
      """
                .trimIndent(),
        language = "json",
        title = "API Response Structure",
        highlight =
            """
        "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
        "expires": "2024-12-31T23:59:59Z"
        "refresh_token": "rt_abc123def456"
      """
                .trimIndent())
  }

  /** Get all highlighting examples as a list of slides */
  fun getAllExamples(): List<SlideContent> {
    return listOf(
        createWindowManagerLogSlide(),
        createTestCodeSlide(),
        createConfigurationSlide(),
        createApiResponseSlide())
  }
}
