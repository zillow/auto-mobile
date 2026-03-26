package dev.jasonpearson.automobile.desktop.core.test

data class TestCase(
    val id: String,
    val name: String,
    val className: String,
    val packageName: String,
    val filePath: String, // Path to the test file for opening in editor
    val lastRunTime: Long?, // Epoch millis
    val lastRunStatus: TestStatus?,
    val runCount: Int, // For popularity sorting
    val screensVisited: List<String>, // Screen names for nav graph integration
    val avgDurationMs: Int,
    val flakinessScore: Float, // 0.0 = stable, 1.0 = always flaky
)

enum class TestStatus {
  Passed,
  Failed,
  Skipped,
  Running,
}

enum class TestPlatform {
  Android,
  iOS,
}

data class TestRun(
    val id: String,
    val testId: String,
    val testName: String,
    val status: TestStatus,
    val startTime: Long,
    val durationMs: Int,
    val steps: List<TestStep>,
    val screensVisited: List<String>,
    val errorMessage: String? = null,
    val deviceId: String,
    val deviceName: String,
    val platform: TestPlatform, // Platform this test ran on
    val videoPath: String? = null, // Path to screen recording video
    val snapshotPath: String? = null, // Path to app snapshot (platform-specific)
    val sampleSize: Int = 0, // Number of times this test has been run (from timing data)
)

data class TestStep(
    val id: String,
    val index: Int,
    val action: String, // "tap", "input", "swipe", "assert", etc.
    val target: String, // Element description
    val screenshotPath: String?,
    val screenName: String?,
    val durationMs: Int,
    val status: TestStatus,
    val errorMessage: String? = null,
)

data class RecordedAction(
    val timestamp: Long,
    val toolName: String,
    val parameters: Map<String, String>,
    val result: String?,
    val screenBefore: String?,
    val screenAfter: String?,
)

data class GradleModule(
    val name: String,
    val path: String, // e.g., ":app", ":feature:auth"
    val testSourcePath: String, // e.g., "src/androidTest/java"
)

data class ExportedPlan(
    val recordingId: String,
    val planName: String,
    val planContent: String,
    val stepCount: Int,
    val durationMs: Long,
)

// Mock data for development
object TestMockData {
  private const val BASE_TIME = 1705000000000L

  val modules =
      listOf(
          GradleModule("app", ":app", "src/androidTest/java"),
          GradleModule("feature-auth", ":feature:auth", "src/androidTest/java"),
          GradleModule("feature-chat", ":feature:chat", "src/androidTest/java"),
          GradleModule("feature-profile", ":feature:profile", "src/androidTest/java"),
          GradleModule("core-testing", ":core:testing", "src/main/java"),
      )

  val testCases =
      listOf(
          TestCase(
              id = "test1",
              name = "testLoginFlow",
              className = "LoginFlowTest",
              packageName = "com.chat.auth",
              filePath = "feature/auth/src/androidTest/java/com/chat/auth/LoginFlowTest.kt",
              lastRunTime = BASE_TIME + 3600_000,
              lastRunStatus = TestStatus.Passed,
              runCount = 47,
              screensVisited = listOf("Splash", "Login", "Home"),
              avgDurationMs = 4500,
              flakinessScore = 0.02f,
          ),
          TestCase(
              id = "test2",
              name = "testSignupValidation",
              className = "SignupTest",
              packageName = "com.chat.auth",
              filePath = "feature/auth/src/androidTest/java/com/chat/auth/SignupTest.kt",
              lastRunTime = BASE_TIME + 3500_000,
              lastRunStatus = TestStatus.Failed,
              runCount = 32,
              screensVisited = listOf("Splash", "Login", "Signup"),
              avgDurationMs = 3200,
              flakinessScore = 0.15f,
          ),
          TestCase(
              id = "test3",
              name = "testSendMessage",
              className = "ChatTest",
              packageName = "com.chat.main",
              filePath = "feature/chat/src/androidTest/java/com/chat/main/ChatTest.kt",
              lastRunTime = BASE_TIME + 3400_000,
              lastRunStatus = TestStatus.Passed,
              runCount = 28,
              screensVisited = listOf("Home", "ChatList", "Chat"),
              avgDurationMs = 6800,
              flakinessScore = 0.05f,
          ),
          TestCase(
              id = "test4",
              name = "testProfileEdit",
              className = "ProfileTest",
              packageName = "com.chat.user",
              filePath = "feature/profile/src/androidTest/java/com/chat/user/ProfileTest.kt",
              lastRunTime = BASE_TIME + 3300_000,
              lastRunStatus = TestStatus.Passed,
              runCount = 19,
              screensVisited = listOf("Home", "Profile", "EditProfile"),
              avgDurationMs = 3100,
              flakinessScore = 0.0f,
          ),
          TestCase(
              id = "test5",
              name = "testNavigationSmoke",
              className = "SmokeTest",
              packageName = "com.chat.app",
              filePath = "app/src/androidTest/java/com/chat/app/SmokeTest.kt",
              lastRunTime = BASE_TIME + 3200_000,
              lastRunStatus = TestStatus.Passed,
              runCount = 156,
              screensVisited = listOf("Splash", "Login", "Home", "ChatList", "Profile", "Settings"),
              avgDurationMs = 12400,
              flakinessScore = 0.08f,
          ),
      )

  val recentRuns =
      listOf(
          TestRun(
              id = "run1",
              testId = "test1",
              testName = "testLoginFlow",
              status = TestStatus.Passed,
              startTime = BASE_TIME + 3600_000,
              durationMs = 4320,
              steps =
                  listOf(
                      TestStep(
                          "s1",
                          0,
                          "launch",
                          "com.chat.app",
                          "screenshots/run1/step0_splash.png",
                          "Splash",
                          800,
                          TestStatus.Passed,
                      ),
                      TestStep(
                          "s2",
                          1,
                          "wait",
                          "Login screen",
                          "screenshots/run1/step1_login.png",
                          "Login",
                          1200,
                          TestStatus.Passed,
                      ),
                      TestStep(
                          "s3",
                          2,
                          "input",
                          "Email field",
                          "screenshots/run1/step2_email.png",
                          "Login",
                          450,
                          TestStatus.Passed,
                      ),
                      TestStep(
                          "s4",
                          3,
                          "input",
                          "Password field",
                          "screenshots/run1/step3_password.png",
                          "Login",
                          380,
                          TestStatus.Passed,
                      ),
                      TestStep(
                          "s5",
                          4,
                          "tap",
                          "Login button",
                          "screenshots/run1/step4_tap.png",
                          "Login",
                          290,
                          TestStatus.Passed,
                      ),
                      TestStep(
                          "s6",
                          5,
                          "assert",
                          "Home screen visible",
                          "screenshots/run1/step5_home.png",
                          "Home",
                          1200,
                          TestStatus.Passed,
                      ),
                  ),
              screensVisited = listOf("Splash", "Login", "Home"),
              deviceId = "pixel8",
              deviceName = "Pixel 8 API 35",
              platform = TestPlatform.Android,
              videoPath = "recordings/run1_video.mp4",
              snapshotPath = "snapshots/run1_snapshot.tar.gz",
          ),
          TestRun(
              id = "run2",
              testId = "test2",
              testName = "testSignupValidation",
              status = TestStatus.Failed,
              startTime = BASE_TIME + 3500_000,
              durationMs = 2890,
              steps =
                  listOf(
                      TestStep(
                          "s1",
                          0,
                          "launch",
                          "com.chat.app",
                          "screenshots/run2/step0_splash.png",
                          "Splash",
                          780,
                          TestStatus.Passed,
                      ),
                      TestStep(
                          "s2",
                          1,
                          "tap",
                          "Create Account",
                          "screenshots/run2/step1_login.png",
                          "Login",
                          320,
                          TestStatus.Passed,
                      ),
                      TestStep(
                          "s3",
                          2,
                          "input",
                          "Invalid email",
                          "screenshots/run2/step2_signup.png",
                          "Signup",
                          410,
                          TestStatus.Passed,
                      ),
                      TestStep(
                          "s4",
                          3,
                          "tap",
                          "Sign Up button",
                          "screenshots/run2/step3_tap.png",
                          "Signup",
                          280,
                          TestStatus.Passed,
                      ),
                      TestStep(
                          "s5",
                          4,
                          "assert",
                          "Error message visible",
                          "screenshots/run2/step4_error.png",
                          "Signup",
                          1100,
                          TestStatus.Failed,
                          "Expected error toast not found",
                      ),
                  ),
              screensVisited = listOf("Splash", "Login", "Signup"),
              errorMessage = "AssertionError: Expected error toast not found within 5000ms",
              deviceId = "pixel8",
              deviceName = "Pixel 8 API 35",
              platform = TestPlatform.Android,
              videoPath = "recordings/run2_video.mp4",
              snapshotPath = "snapshots/run2_snapshot.tar.gz",
          ),
          TestRun(
              id = "run3",
              testId = "test5",
              testName = "testNavigationSmoke",
              status = TestStatus.Passed,
              startTime = BASE_TIME + 3200_000,
              durationMs = 11980,
              steps =
                  listOf(
                      TestStep(
                          "s1",
                          0,
                          "launch",
                          "com.chat.app",
                          "screenshots/run3/step0_splash.png",
                          "Splash",
                          820,
                          TestStatus.Passed,
                      ),
                      TestStep(
                          "s2",
                          1,
                          "wait",
                          "Login screen",
                          "screenshots/run3/step1_login.png",
                          "Login",
                          1100,
                          TestStatus.Passed,
                      ),
                      TestStep(
                          "s3",
                          2,
                          "tap",
                          "Skip login",
                          "screenshots/run3/step2_skip.png",
                          "Login",
                          280,
                          TestStatus.Passed,
                      ),
                      TestStep(
                          "s4",
                          3,
                          "tap",
                          "Chats tab",
                          "screenshots/run3/step3_home.png",
                          "Home",
                          340,
                          TestStatus.Passed,
                      ),
                      TestStep(
                          "s5",
                          4,
                          "assert",
                          "ChatList visible",
                          "screenshots/run3/step4_chatlist.png",
                          "ChatList",
                          890,
                          TestStatus.Passed,
                      ),
                      TestStep(
                          "s6",
                          5,
                          "tap",
                          "Profile tab",
                          "screenshots/run3/step5_profile_tap.png",
                          "ChatList",
                          310,
                          TestStatus.Passed,
                      ),
                      TestStep(
                          "s7",
                          6,
                          "assert",
                          "Profile visible",
                          "screenshots/run3/step6_profile.png",
                          "Profile",
                          920,
                          TestStatus.Passed,
                      ),
                      TestStep(
                          "s8",
                          7,
                          "tap",
                          "Settings",
                          "screenshots/run3/step7_settings_tap.png",
                          "Profile",
                          290,
                          TestStatus.Passed,
                      ),
                      TestStep(
                          "s9",
                          8,
                          "assert",
                          "Settings visible",
                          "screenshots/run3/step8_settings.png",
                          "Settings",
                          880,
                          TestStatus.Passed,
                      ),
                  ),
              screensVisited = listOf("Splash", "Login", "Home", "ChatList", "Profile", "Settings"),
              deviceId = "pixel7",
              deviceName = "Pixel 7 API 34",
              platform = TestPlatform.Android,
              videoPath = "recordings/run3_video.mp4",
              snapshotPath = null, // No snapshot for this test
          ),
      )
}
