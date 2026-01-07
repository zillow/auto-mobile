# 🎮 AutoMobile Android Playground

The AutoMobile Android Playground is a demonstration app designed to test and showcase AutoMobile's automation
capabilities. Its purpose is:

1. **🎯 Serve as a test target** - Provides a controlled Android app environment for AutoMobile to interact with and
   automate, both to make itself better and to improve its playground.
2. **🚀 Use modern Android development** - Built with 100% Jetpack Compose UI, Nav3, Material3, and modern Android
   patterns.
3. **📦 Minimal dependencies** - No dependency injection frameworks or network calls to keep it simple and self-contained.
4. **🎨 Feature variety** - Includes multiple modules (login, home, settings, media player, onboarding, etc.) to test
   different UI patterns and Experiment/Treatment context awareness.
5. **📸 Media capabilities** - Integrates Coil for image loading and ExoPlayer for video playback.

| Light Mode | Dark Mode |
|------------|-----------|
| <img src="../art/discover-tap-light.png" width="200" alt="discover-tap-light.png"> | <img src="../art/discover-tap-dark.png" width="200" alt="discover-tap-dark.png"> |
| <img src="../art/discover-chat-light.png" width="200" alt="discover-chat-light.png"> | <img src="../art/discover-chat-dark.png" width="200" alt="discover-chat-dark.png"> |

It also includes the original Droidcon NYC 2025 slides with complex presentation functionality.

<img src="../art/presentation-start-dark.png" width="400" alt="presentation-start-dark.png" />
<img src="../art/presentation-chart-light.png" width="400" alt="presentation-chart-light.png" />
<img src="../art/presentation-code-light.png" width="400" alt="presentation-code-light.png" />

## Docs Workflow Demos

The app includes a Docs Demo Index screen (Home > Demos) with deterministic demo flows for the
`docs/using` workflows:

- UX exploration flow (start, details, summary)
- Performance startup, list scrolling, and list-to-detail transitions
- Accessibility contrast failures and small tap targets
- Bug reproduction with an intentional toggleable bug

Demo screens use stable labels and Compose test tags for repeatable automation. Deep links are
listed in `android/docs/playground-deep-links.md`.
