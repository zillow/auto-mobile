# Test Authoring

Steps to take whether you're setting up AutoMobile test authoring & execution for the first time or debugging an issue.

#### Ensure prerequisites are met

- AutoMobile should be [installed](../../installation.md).
- Android device or emulator connected and accessible via ADB.
- The target app installed on the device.

#### Configure AutoMobile your project

This is what will allow AutoMobile to recognize what source code you're testing from the view hierarchy. Add
environment variables to your AutoMobile MCP configuration like so:

```json
{
  "androidProjectPath": "/absolute/path/to/your/android/project/root",
  "androidAppId": "com.example.app",
  "mode": "testAuthoring"
}
```

#### Explore your app via AutoMobile

Give AutoMobile a goal to perform. It can be simple or complex.

Example Prompt:

```
Open the My Example App, complete Login with credentials
testuser@example.com
password123
```

Unless there is some non-standard UX that AutoMobile doesn't understand how to navigate it shouldn't need overly
specific instructions. You can also point your agent at an existing test (Espresso/Maestro/Zephyr) and ask it to
perform the same operations.

#### Force Close the App

Once you've completed your interaction sequence, force close the app. AutoMobile will then automatically write the plan
and test in the relevant module of the tested UI. You can also tell AutoMobile to close the app as part of its prompt.

If you have a use-case where you'd prefer to trigger exporting plans differently, please file an issue.

## Next

- Explore [plan syntax](plan-syntax.md) for more complex interactions
- Learn about [test execution options](../test-execution/index.md).
