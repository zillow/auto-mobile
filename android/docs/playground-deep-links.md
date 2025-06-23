# Playground App Deep Links

The AutoMobile Playground app supports deep links for direct navigation to specific app states and
features. This enables AutoMobile tests to navigate directly to specific sections without manual
navigation steps.

## Deep Link URL Structure

All deep links use the custom scheme: `automobile://playground/[path]`

## Available Deep Links

### 1. Onboarding Screen

- **URL**: `automobile://playground/onboarding`
- **Description**: Navigate directly to the onboarding screen
- **Usage**: Test onboarding flow or reset app state to initial setup

### 2. Login Screen

- **URL**: `automobile://playground/login`
- **Description**: Navigate directly to the login screen
- **Usage**: Test authentication flows or bypass onboarding

### 3. Home Screen

- **URL**: `automobile://playground/home`
- **Description**: Navigate directly to the home screen
- **Usage**: Test main app functionality or bypass authentication

### 4. Video Player Screen

- **URL**: `automobile://playground/video_player/{videoId}`
- **Description**: Navigate directly to the video player with a specific video
- **Usage**: Test video playback functionality
- **Example**: `automobile://playground/video_player/sample123`

## Testing with ADB

You can test deep links using ADB commands:

```bash
# Navigate to onboarding
adb shell am start -a android.intent.action.VIEW -d "automobile://playground/onboarding" com.zillow.automobile.playground

# Navigate to login
adb shell am start -a android.intent.action.VIEW -d "automobile://playground/login" com.zillow.automobile.playground

# Navigate to home
adb shell am start -a android.intent.action.VIEW -d "automobile://playground/home" com.zillow.automobile.playground

# Navigate to video player
adb shell am start -a android.intent.action.VIEW -d "automobile://playground/video_player/test123" com.zillow.automobile.playground
```

## AutoMobile Test Integration

The `DeepLinkManager` provides utility methods for AutoMobile tests:

```kotlin
// Navigate to specific screens for testing
DeepLinkManager.navigateToOnboardingForTest(context)
DeepLinkManager.navigateToLoginForTest(context)
DeepLinkManager.navigateToHomeForTest(context)
DeepLinkManager.navigateToVideoPlayerForTest(context, "videoId")

// Get all available deep links
val allDeepLinks = DeepLinkManager.getAllDeepLinks()
```

## Implementation Details

### Deep Link Parsing

- **DeepLinkManager**: Handles URL generation, parsing, and validation
- **AppDestinations**: Defines route patterns and deep link URLs
- **AppNavigation**: Integrates deep links with Navigation Compose

### Intent Handling

- **MainActivity**: Processes incoming deep link intents
- **AndroidManifest.xml**: Declares intent filters for `automobile://playground` scheme

### Navigation State

Deep links respect the app's navigation state and user preferences:

- If user hasn't completed onboarding, some deep links may redirect to onboarding
- Authentication state is preserved and may affect navigation behavior
- Back stack is managed appropriately for each deep link destination

## Known Limitations

1. **State Dependencies**: Some deep links may redirect based on user state (authentication,
   onboarding completion)
2. **Argument Validation**: Video player deep links require valid video IDs
3. **Navigation Context**: Deep links launched from external sources may not preserve internal
   navigation history

## Error Handling

- Invalid deep link URLs are ignored
- Malformed video IDs in video player deep links are handled gracefully
- Unknown paths return to default navigation behavior
