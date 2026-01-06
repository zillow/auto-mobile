# Android Work Profile Testing

This guide explains how to set up and test Android work profiles with AutoMobile.

## What is a Work Profile?

An Android work profile is a separate user profile on a device that allows organizations to manage work-related apps and data separately from personal apps. Each profile has its own user ID:
- **User 0**: Primary/Personal profile
- **User 10+**: Work profiles or other managed profiles

## AutoMobile Work Profile Support

AutoMobile automatically detects and handles work profiles across all app management features:

- **Auto-detection**: Features automatically detect the appropriate user profile
- **Priority order**:
  1. If app is in foreground → use that user profile
  2. Else if a running work profile exists → use the first running work profile
  3. Else → use primary user (user 0)
- **userId in responses**: App management tools include the `userId` field indicating which profile was used
- **Note**: MCP tool schemas do not currently accept a `userId` override; selection is automatic

### Supported Features

App management tools that support work profiles:
- `installApp` - Install APKs to the auto-selected profile
- `launchApp` - Launch apps in the auto-selected profile
- `terminateApp` - Terminate apps in the auto-selected profile
- `listApps` - List apps from all profiles with userId and foreground status (recent is a placeholder)

## Setting Up Work Profile on Android Emulator

### Prerequisites

- Android Studio with Android SDK
- Android emulator (API 21+, work profiles supported from Android 5.0)
- ADB installed and in PATH

### Steps

#### 1. Create or Start an Emulator

```bash
# List available AVDs
emulator -list-avds

# Start an emulator
emulator -avd <avd_name>
```

#### 2. Set Up Work Profile Using Test DPC

Test DPC (Device Policy Controller) is Google's app for testing enterprise features.

**Option A: Using ADB**

```bash
# Install Test DPC from Google Play or download the APK
adb install TestDPC.apk

# Launch Test DPC
adb shell am start -n com.afwsamples.testdpc/.SetupManagementActivity

# Follow on-screen prompts to set up work profile
```

**Option B: Using Device Settings**

1. Open **Settings** on the emulator
2. Go to **Users & accounts** → **Work profile**
3. Tap **Set up profile**
4. Follow the setup wizard
5. Install Test DPC when prompted

#### 3. Verify Work Profile

```bash
# List all users on device
adb shell pm list users

# Expected output:
# Users:
#     UserInfo{0:Owner:13} running
#     UserInfo{10:Work profile:30} running
```

The output shows:
- `0` = Personal profile (primary user)
- `10` = Work profile (managed profile)

#### 4. Install Apps to Work Profile

```bash
# Install to work profile (user 10)
adb install --user 10 your-app.apk

# Install to personal profile (user 0)
adb install --user 0 your-app.apk

# List apps in work profile
adb shell pm list packages --user 10

# List apps in personal profile
adb shell pm list packages --user 0
```

## Testing with AutoMobile

### Example: Install App to Work Profile

AutoMobile automatically installs to the work profile if it exists:

```typescript
// Using MCP tool
const result = await installApp({ apkPath: "/path/to/app.apk" });
console.log(result.userId); // 10 (work profile)
```

### Example: Launch App (Auto-detected Profile)

```typescript
// Auto-detects (uses foreground profile or a running work profile if present)
await launchApp({ packageName: "com.example.app" });
```

### Example: List Apps from All Profiles

```typescript
// Lists apps from all profiles with detailed info
const apps = await listApps();

// Result includes grouped user apps and deduped system apps:
// {
//   profiles: {
//     "0": [
//       { packageName: "com.example.personal", userId: 0, foreground: false, recent: false }
//     ],
//     "10": [
//       { packageName: "com.example.work", userId: 10, foreground: true, recent: false }
//     ]
//   },
//   system: [
//     { packageName: "com.android.chrome", userIds: [0, 10], foreground: false, recent: false }
//   ]
// }
```

Note: Chrome can be installed in both profiles!

## Testing Scenarios

### Scenario 1: App in Foreground

```bash
# Launch app in work profile
adb shell am start --user 10 com.example.app/.MainActivity

# AutoMobile operations will target user 10 automatically
```

### Scenario 2: Multiple Profiles

```bash
# Verify multiple profiles
adb shell pm list users

# AutoMobile will:
# 1. Check foreground app first
# 2. Fall back to first work profile (user 10)
# 3. Fall back to primary (user 0)
```

### Scenario 3: Same App in Both Profiles

```bash
# Install in both
adb install --user 0 app.apk
adb install --user 10 app.apk

# List all installations
adb shell pm list packages -f com.example.app --all-users

# AutoMobile's listApps will return both with unique userIds
```

## Troubleshooting

### Work Profile Not Showing Up

```bash
# Check if work profile is running
adb shell pm list users

# If not running, restart emulator or device
```

### App Not Installing to Work Profile

```bash
# Check available space
adb shell df

# Verify user ID exists
adb shell pm list users

# Install with explicit user flag
adb install --user 10 app.apk
```

### Cannot Launch App in Work Profile

```bash
# Verify app is installed in work profile
adb shell pm list packages --user 10 | grep your.app

# Launch manually to test
adb shell am start --user 10 your.app/.MainActivity
```

## ADB Commands Reference

```bash
# List all users
adb shell pm list users

# Install to specific user
adb install --user <userId> app.apk

# Uninstall from specific user
adb shell pm uninstall --user <userId> com.package.name

# List packages for user
adb shell pm list packages --user <userId>

# Clear app data for user
adb shell pm clear --user <userId> com.package.name

# Force stop app for user
adb shell am force-stop --user <userId> com.package.name

# Launch app in user
adb shell am start --user <userId> com.package.name/.MainActivity

# Get foreground app with user
adb shell dumpsys activity activities | grep -E "(mResumedActivity|mFocusedActivity|topResumedActivity)"
```

## API Version Compatibility

- **Android 5.0+ (API 21+)**: Work profiles supported
- **Android 7.0+ (API 24+)**: Enhanced work profile features
- **Android 9.0+ (API 28+)**: Improved work profile UI

AutoMobile's work profile features work on all Android versions that support work profiles (API 21+).
