# UX Exploration

Use AI agents to explore your app, get answers about the user experience.

**Example Prompts**

> Open my <app-name\> <Android\iOS\> app and...
>
> Explore the main features and identify key user flows of the current app
>
> Use the search features in the app to find <search-result\>
>
> Explore the onboarding flow and report any confusing steps
>
> Are there any interactive elements that are hard to interact with in the current screen?
>
> Use <feature-x\> and choose a date 1 week in the future.

The agent will:

1. Look for available devices, launch an Android emulator or iOS simulator
2. Look for installed apps. If the specified one is not installed it can attempt to install it.
3. Launch the requested app.
4. Use device interaction [tool calls](../design-docs/mcp/tools.md) to tap, swipe, pinch, drag, and generally interact to accomplish the given tasks.
5. At each step the agent will have full device state and observations to keep iterating.

??? example "See demo: Google Maps exploration"
    ![Exploring Google Maps](../img/google-maps.gif)
    *Demo: An AI agent exploring Google Maps, searching for locations, and interacting with map controls.*

??? example "See demo: Clock app alarm"
    ![Setting an alarm in the Clock app](../img/clock-app.gif)
    *Demo: An AI agent navigating to the Clock app, opening the alarm tab, and creating a new alarm.*

??? example "See demo: Camera gallery"
    ![Taking a photo and viewing the gallery](../img/camera-gallery.gif)
    *Demo: An AI agent opening the Camera app, taking a photo, and viewing it in the Gallery.*

**Best Practices**

- Describe what you want to explore instead of how when you want more general explorations.
- Specifically state interaction methods when you want the agent to take specific routes (deep links, search by scrolling, etc)
