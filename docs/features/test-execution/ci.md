# Test Execution - CI

Since AutoMobile is a tool designed to automate mobile interactions one of the big early use cases is running it on CI.

## Run plans on CI with no agent capabilities

1. Install AutoMobile: `npm install -g auto-mobile@latest`
2. Ensure one or more Android emulators are running and detectable by `adb devices`
3. Run test plans: `auto-mobile --cli executePlan --planContent "$(cat my-plan.yaml)"`

TODO: bash script for parallel test execution & clearing app data between tests.

## Run plans on CI with agentic healing, parallelism, and reporting

1. Add [AutoMobile's JUnitRunner](junitrunner.md) to your Android app & libraries.
2. Read ([provider guides](../../mcp-clients/overview.md) setup relevant environment variables 
3. Ensure one or more Android emulators are running and detectable by `adb devices` before unit tests are run
4. Run unit tests via `./gradlew testUnitTestDebug`
