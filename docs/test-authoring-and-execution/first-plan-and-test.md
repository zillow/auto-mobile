# AutoMobile Plans - Authoring First Test

This guide walks through creating your first AutoMobile test using automatic export and JUnit runner execution.

## Prerequisites

- AutoMobile MCP server installed and configured
- Android device or emulator connected and accessible via ADB
- Target app installed on the device

## Step 1: Enable Source Mapping & Test Authoring

This is what will allow AutoMobile to recognize what source code you're testing from the view hierarchy. Add
environment variables to your AutoMobile MCP configuration like so:

```json
{
  "androidProjectPath": "/absolute/path/to/your/android/project/root",
  "androidAppId": "com.example.app",
  "mode": "testAuthoring"
}
```

## Step 2: Explore your app via AutoMobile

Give AutoMobile a goal to perform. It can be simple or complex.

Example Prompt:

Open the My Example App, complete Login with credentials
testuser@example.com
password123

## Step 3: Force Close the App

Once you've completed your interaction sequence, force close the app. AutoMobile will then automatically write the plan
and test in the relevant module of the tested UI. You can also tell AutoMobile to close the app as part of its prompt.

## Step 4: Run the authored test

Right-click on the test created in Android Studio and run.

## Next Steps

- Explore [plan syntax](syntax.md) for more complex interactions
- Learn about [execution options](execution.md) for different environments
- Review [export options](export-plan.md) for CI/CD integration

Your first AutoMobile test is now ready to run! The automatic export and JUnit runner integration makes it easy to go
from manual interaction to automated test execution.
