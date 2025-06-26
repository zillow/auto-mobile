# AutoMobile Accessibility Service

This accessibility service provides view hierarchy extraction capabilities for automated Android UI
testing with automatic refresh when screen content changes.

## Features

- **Automatic View Hierarchy Capture**: Automatically detects when screen content changes and marks
  hierarchy for refresh
- **On-Demand Extraction**: Extracts fresh hierarchy only when requested after content changes
- **Synchronous File Access**: Writes hierarchy to app-scoped storage accessible via ADB
- **Broadcast Communication**: Alternative broadcast-based communication
- **Single Command Interface**: Only exposes one operation - get latest view hierarchy

## Usage

### Synchronous File Access (Recommended)

The easiest way to get view hierarchy data synchronously is to trigger the sync action and then read
the file:

```bash
# Step 1: Trigger hierarchy extraction to file
adb shell am broadcast -a com.zillow.automobile.GET_HIERARCHY_SYNC

# Step 2: Read the result file
adb shell run-as com.zillow.automobile.accessibilityservice cat files/latest_hierarchy.json
```

**One-liner for convenience:**
```bash
adb shell "am broadcast -a com.zillow.automobile.GET_HIERARCHY_SYNC && sleep 0.5 && run-as com.zillow.automobile.accessibilityservice cat files/latest_hierarchy.json"
```

**Debugging commands if the above doesn't work:**

```bash
# Check if the app is installed
adb shell pm list packages | grep com.zillow.automobile.accessibilityservice

# Check if the accessibility service is running
adb shell settings get secure enabled_accessibility_services

# Check if the file exists in app storage
adb shell run-as com.zillow.automobile.accessibilityservice ls -la files/

# Check recent logs for both receiver and service
adb logcat -s AccessibilityCommandReceiver AutoMobileAccessibilityService

# Trigger broadcast and check logs in real-time
adb shell am broadcast -a com.zillow.automobile.GET_HIERARCHY_SYNC && adb logcat -s AccessibilityCommandReceiver AutoMobileAccessibilityService
```

**Benefits:**

- Synchronous response after brief delay
- Returns JSON directly to stdout
- No broadcast receivers needed
- Works with any shell scripting
- Uses app-scoped storage (secure and reliable)

### Broadcast Communication (Alternative)

For applications that prefer broadcast-based communication:

```bash
# Request latest view hierarchy
adb shell am broadcast -a com.zillow.automobile.GET_LATEST_HIERARCHY

# Response will be sent via broadcast:
# Action: com.zillow.automobile.HIERARCHY_RESPONSE
# Extras: 
#   - json_data (string): JSON-encoded view hierarchy
#   - success (boolean): Whether operation was successful
#   - error (string): Error message if success is false
```

## Response Format

Both interfaces return the same JSON structure:

```json
{
  "packageName": "com.example.app",
  "windowId": 12345,
  "root": {
    "text": "Button Text",
    "contentDescription": "Button Description",
    "className": "android.widget.Button",
    "resourceId": "com.example.app:id/button",
    "bounds": {
      "left": 100,
      "top": 200,
      "right": 300,
      "bottom": 250
    },
    "isClickable": true,
    "isEnabled": true,
    "children": [...]
  }
}
```

For errors (via broadcasts):
```json
{
  "error": "Error message",
  "success": false
}
```

## Integration Examples

### Shell Script
```bash
#!/bin/bash
# Get view hierarchy synchronously
HIERARCHY=$(adb shell "am broadcast -a com.zillow.automobile.GET_HIERARCHY_SYNC && sleep 0.5 && run-as com.zillow.automobile.accessibilityservice cat files/latest_hierarchy.json")
echo "Current screen hierarchy: $HIERARCHY"
```

### Python Script
```python
import subprocess
import json
import time

def get_view_hierarchy():
    # Trigger extraction
    subprocess.run(['adb', 'shell', 'am', 'broadcast', '-a', 'com.zillow.automobile.GET_HIERARCHY_SYNC'])
    
    # Wait briefly for file write
    time.sleep(0.5)
    
    # Read the result
    result = subprocess.run([
        'adb', 'shell', 'run-as', 'com.zillow.automobile.accessibilityservice', 
        'cat', 'files/latest_hierarchy.json'
    ], capture_output=True, text=True)
    
    return json.loads(result.stdout)

hierarchy = get_view_hierarchy()
print(f"Found {len(hierarchy.get('root', {}).get('children', []))} top-level elements")
```

### Broadcast Receiver (Kotlin)
```kotlin
val receiver = object : BroadcastReceiver() {
    override fun onReceive(context: Context?, intent: Intent?) {
        val success = intent?.getBooleanExtra("success", false) ?: false
        val jsonData = intent?.getStringExtra("json_data")
        val error = intent?.getStringExtra("error")
        
        if (success && jsonData != null) {
            // Process JSON view hierarchy
            Log.d("AutoMobile", "View Hierarchy: $jsonData")
        } else {
            Log.e("AutoMobile", "Error: $error")
        }
    }
}

// Register for hierarchy responses
val filter = IntentFilter("com.zillow.automobile.HIERARCHY_RESPONSE")
context.registerReceiver(receiver, filter)
```

## App Package Information

- **Package Name**: `com.zillow.automobile.accessibilityservice`
- **Hierarchy File Location**: `files/latest_hierarchy.json` (within app's private directory)
- **ADB Access**: Use `run-as com.zillow.automobile.accessibilityservice` to access app-scoped files

## How It Works

1. **Content Change Detection**: Service monitors for window state and content changes
2. **Lazy Extraction**: Hierarchy is only extracted when requested after a content change
3. **Memory Storage**: Latest hierarchy is cached in memory for fast repeated access
4. **File Output**: Sync command writes to app-scoped storage accessible via ADB

## Optimized Architecture

The service uses an optimized approach for minimal overhead:

1. **Event-Driven Refresh**: Only marks hierarchy as needing refresh when content actually changes
2. **Lazy Extraction**: Hierarchy extraction only happens on-demand after content changes
3. **Memory Caching**: Repeated requests return cached data if no content changes occurred
4. **Secure Storage**: Files written to app-scoped storage accessible via ADB

This design minimizes CPU usage and battery impact while ensuring fresh data is always available.

## Error Handling

The service includes comprehensive error handling:

- Non-blocking error handling to prevent service crashes
- Error responses in JSON format with detailed messages
- Graceful handling of missing data or service interruptions
- Detailed logging for debugging

## Permissions

The service requires accessibility permissions to be granted manually in device settings:
Settings > Accessibility > AutoMobile Accessibility Service > Enable
