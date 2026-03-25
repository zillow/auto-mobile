# UI Tests

AutoMobile will be able to record and playback sessions via IDE integrations.

## Recording a Test

See the design docs for [Android](../design-docs/plat/android/ide-plugin/test-recording.md) & [iOS](../design-docs/plat/ios/ide-plugin/test-recording.md). For the moment this is still WIP.

## Example Test

```yaml
steps:
  - tool: launchApp
    appId: com.example.app

  - tool: assertVisible
    text: "Login"

  - tool: tapOn
    action: tap
    text: "Login"

  - tool: inputText
    text: "user@example.com"

  - tool: assertVisible
    text: "Welcome"
```

```kotlin

@RunWith(AutoMobileRunner::class)
class ClockAppTest {

  @Test
  fun `Given we have a Clock app we should be able to set an alarm`() {
    val result = AutoMobilePlan("test-plans/clock-set-alarm.yaml").execute()

    assertTrue(result.success)
  }
}
```

```swift
import XCTest
@testable import XCTestRunner

final class RemindersTests: AutoMobileTestCase {
    func testLaunchRemindersPlan() throws {
        let result = try executePlan("launch-reminders-app.yaml")
    }
}
```

## Running a Test

AutoMobile supports Android with [JUnitRunner](../design-docs/plat/android/junit-runner/index.md) and iOS with [XCTestRunner](../design-docs/plat/ios/xctestrunner/index.md). We avoid conventional UI test harnesses like Android's connectedAndroidTest and iOS's XCUITest in favor of proxying all device setup and interaction via AutoMobile. Therefore you can think of AutoMobile's tests as closer to UI snapshot tests that can run as JVM or XCTest unit tests.

This approach allows AutoMobile to manage device pooling, support multi-client tests, and automatically optimize test selection based on timing data.

## Related

- [JUnitRunner](../design-docs/plat/android/junit-runner/index.md) - Test framework details
- [IDE Plugin](../design-docs/plat/android/ide-plugin/overview.md) - Recording and debugging
