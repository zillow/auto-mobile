# Plans - Exporting

Plans are automatically saved as YAML files and can be [replayed](execution.md) along with KotlinPoet-generated test
files that reference the YAML plans. AutoMobile uses source mapping and heuristics to guide which module tests are
written to.

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

If you have a use-case where you'd prefer to trigger exporting plans differently, please file an issue.
