# Model Providers - Anthropic

The Android JUnitRunner uses Anthropic when `automobile.ai.provider=anthropic`.

## Environment setup

```shell
export ANTHROPIC_API_KEY="your_api_key_here"
```

You can also supply the API key via JVM system property:

```shell
-Dautomobile.anthropic.api.key=your_api_key_here
```

Optional proxy endpoint (all providers):

```shell
-Dautomobile.ai.proxy.endpoint=https://your-proxy.example.com
```

On CI you should provide these as environment-injected secrets with masking to protect your credentials.

## Current model

- `Sonnet_4`

## Implementation references

- [`android/junit-runner/src/main/kotlin/dev/jasonpearson/automobile/junit/AutoMobileAgent.kt#L811-L838`](https://github.com/kaeawc/auto-mobile/blob/main/android/junit-runner/src/main/kotlin/dev/jasonpearson/automobile/junit/AutoMobileAgent.kt#L811-L838) for provider selection and API key lookup.
- [`android/junit-runner/src/main/kotlin/dev/jasonpearson/automobile/junit/AutoMobileAgent.kt#L891-L896`](https://github.com/kaeawc/auto-mobile/blob/main/android/junit-runner/src/main/kotlin/dev/jasonpearson/automobile/junit/AutoMobileAgent.kt#L891-L896) for the Anthropic model mapping.
