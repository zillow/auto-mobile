The plan is for this to be a simple Android application that is 100% Compose with Android Nav3,
zero dependency injection, no remote network sources, just for AutoMobile to use for exercising its
various capabilities. To that end we should

1. Convert all existing modules from XML/ViewBinding to Compose
2. Add Coil image loading and Exoplayer video player
3. Wire up the App module to lazy load media libraries
4. Add a splash screen
5. Wire up navigation
6. Continually add widgets for AutoMobile to interact with

