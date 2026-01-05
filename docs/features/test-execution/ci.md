# Test Execution - CI

Since AutoMobile is a tool designed to automate mobile interactions one of the big early use cases is running it on CI.

## Run plans on CI with no agent capabilities

1. Install AutoMobile: `bun install -g @kaeawc/auto-mobile@latest`
2. Ensure one or more Android emulators are running and detectable by `adb devices`
3. Run test plans: `auto-mobile --cli executePlan --platform android --planContent "$(cat my-plan.yaml)"`

TODO: bash script for parallel test execution & clearing app data between tests.

## Run plans on CI with agentic healing, parallelism, and reporting

1. Add [AutoMobile's JUnitRunner](junitrunner.md) to your Android app & libraries.
2. Read [provider guides](../../mcp-clients/index.md) and set the relevant environment variables or system properties
   for the JUnitRunner AI agent
3. Ensure one or more Android emulators are running and detectable by `adb devices` before unit tests are run
4. Run unit tests via `(cd android && ./gradlew testDebugUnitTest)`

## Implementation references

- [`src/server/planTools.ts#L9-L44`](https://github.com/kaeawc/auto-mobile/blob/main/src/server/planTools.ts#L9-L44) for `executePlan` required arguments.
- [`android/junit-runner/src/main/kotlin/dev/jasonpearson/automobile/junit/AutoMobileRunner.kt#L23-L120`](https://github.com/kaeawc/auto-mobile/blob/main/android/junit-runner/src/main/kotlin/dev/jasonpearson/automobile/junit/AutoMobileRunner.kt#L23-L120) for runner behavior and daemon usage.
