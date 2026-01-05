# Test Execution

## Environments

If you haven't already, add [AutoMobile JUnitRunner dependency](junitrunner.md).

#### Local

Right-click on the test created in Android Studio and run. See other [execution options](options.md).

#### CI

Read the [guide](ci.md)

## Performance

Ensure that the [accessibility service](../index.md#android-accessibility-service) is installed and running on the
target device. AutoMobile attempts to install and enable the service automatically when creating sessions, but you may
still need to verify it is enabled on your devices (especially in CI images).

## Implementation references

- [`src/server/ToolExecutionContext.ts#L19-L70`](https://github.com/kaeawc/auto-mobile/blob/main/src/server/ToolExecutionContext.ts#L19-L70) for automatic accessibility service setup during session creation.
- [`src/utils/AccessibilityServiceManager.ts#L543-L616`](https://github.com/kaeawc/auto-mobile/blob/main/src/utils/AccessibilityServiceManager.ts#L543-L616) for the setup workflow.
