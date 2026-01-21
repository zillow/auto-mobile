# UX Exploration

Use AI agents to interactively explore your app and discover UI flows.

## Example Prompts

| Goal | Prompt |
|------|--------|
| General exploration | "Explore the main features and identify key user flows" |
| Specific screen | "Find all the ways to reach the settings screen" |
| Flow analysis | "Explore the onboarding flow and report any confusing steps" |
| Navigation Graph | "Build a [navigation graph](../design-docs/mcp/nav/index.md) and then describe it as a mermaid diagram" |
| Element discovery | "Identify all screens that contain text input fields" |

## Best Practices

| Practice | Why |
|----------|-----|
| Set clear objectives | Helps agent focus on what matters |
| Define boundaries | "Don't submit forms" prevents unwanted actions |
| Request specific outputs | "Build a navigation summary" gives concrete results |

??? example "See demo: Google Maps exploration"
    ![Exploring Google Maps](../img/google-maps.gif)
    *Demo: An AI agent exploring Google Maps, searching for locations, and interacting with map controls.*

??? example "See demo: Clock app alarm"
    ![Setting an alarm in the Clock app](../img/clock-app.gif)
    *Demo: An AI agent navigating to the Clock app, opening the alarm tab, and creating a new alarm.*

??? example "See demo: Camera gallery"
    ![Taking a photo and viewing the gallery](../img/camera-gallery.gif)
    *Demo: An AI agent opening the Camera app, taking a photo, and viewing it in the Gallery.*
