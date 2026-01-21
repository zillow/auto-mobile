# Startup

App startup performance affects user experience and app store ratings. AutoMobile helps measure startup through UI observation and idle detection. Use AI to measure and optimize how quickly your app launches and becomes interactive.

Make sure to read [the overview guide for performance analysis](index.md).

**Example Prompts**

> Launch the <app-name\> <Android\iOS\> app and measure how long until the home screen is interactive.
>
> Let's performance test <app-name\> <Android\iOS\> startup via deep link <your-deep-link>. Run a series of tests with warm and then cold boot to get a baseline of time to first frame and time to UI stability.
>
> Take a snapshot of the currently running <emulator\simulator\> that capture <app-name\>. Spin up 3 different devices using that snapshot with low, standard, and high memory. Run cold and warm boot app startup tests.

??? example "See demo: Deep link startup"
    ![App startup via deep link demo](../../img/deeplink-startup.gif)
    *Demo: An AI agent launching a test app via deepLink to measure startup time to first frame rendered and UI stable.*

**See Also**

- [Android Launch Time Guide](https://developer.android.com/topic/performance/vitals/launch-time)
