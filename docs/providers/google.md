# Model Providers - Google

The Android JUnitRunner uses Google when `automobile.ai.provider=google`.

## Environment setup

```shell
export GOOGLE_API_KEY="your_api_key_here"
```

You can also supply the API key via JVM system property:

```shell
-Dautomobile.google.api.key=your_api_key_here
```

Optional proxy endpoint (all providers):

```shell
-Dautomobile.ai.proxy.endpoint=https://your-proxy.example.com
```

On CI you should provide these as environment-injected secrets with masking to protect your credentials.

## Current model

- `Gemini2_5Pro`

## Implementation references

- [`android/junit-runner/src/main/kotlin/dev/jasonpearson/automobile/junit/AutoMobileAgent.kt#L811-L845`](https://github.com/kaeawc/auto-mobile/blob/main/android/junit-runner/src/main/kotlin/dev/jasonpearson/automobile/junit/AutoMobileAgent.kt#L811-L845) for provider selection and API key lookup.
- [`android/junit-runner/src/main/kotlin/dev/jasonpearson/automobile/junit/AutoMobileAgent.kt#L893-L896`](https://github.com/kaeawc/auto-mobile/blob/main/android/junit-runner/src/main/kotlin/dev/jasonpearson/automobile/junit/AutoMobileAgent.kt#L893-L896) for the Google model mapping.
