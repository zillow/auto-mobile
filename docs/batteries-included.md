# Batteries Included

AutoMobile comes with extensive built-in functionality to minimize setup friction and provide a seamless
out-of-the-box experience. These "batteries included" features automatically handle common configuration tasks and
provide intelligent fallbacks.

## Android SDK Management

### Automatic SDK Detection

- `$ANDROID_HOME/platform-tools`
- `$HOME/Android/Sdk/platform-tools` (Linux/macOS)
- `%LOCALAPPDATA%\Android\Sdk\platform-tools` (Windows)
- System PATH locations

### SDK Download and Setup

When no Android SDK is detected, AutoMobile can automatically download and configure the required components.

TODO: Add documentation based on real implementation

### ANDROID_HOME Configuration

If `$ANDROID_HOME` is not set, AutoMobile will:

1. Attempt to locate the SDK automatically
2. Set the environment variable for the current session
3. Provide guidance for permanent configuration

```bash
# AutoMobile will automatically configure these paths:
export ANDROID_HOME=/path/to/android/sdk
export PATH=$PATH:$ANDROID_HOME/platform-tools
export PATH=$PATH:$ANDROID_HOME/tools
```

## Taking Out the Batteries

### Selective Feature Disabling

You can opt out of any or all automated behaviors via CLI arguments:

#### SDK Management

```bash
# Disable automatic SDK detection
npx auto-mobile --no-auto-sdk

# Use specific SDK path without validation
npx auto-mobile --android-home /custom/path --no-validate-sdk
```

#### Device Management

```bash
# Disable device auto-detection
npx auto-mobile --no-auto-device

# Skip USB debugging setup assistance
npx auto-mobile --no-setup-assistance

# Disable emulator auto-start
npx auto-mobile --no-auto-emulator
```

By leveraging these batteries-included features, AutoMobile provides a smooth onboarding experience while 
maintaining the flexibility to customize behavior for specific requirements and environments.
