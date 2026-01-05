# Model Providers - OpenAI

The Android JUnitRunner uses OpenAI when `automobile.ai.provider=openai` (default).

## Environment setup

```shell
export OPENAI_API_KEY="your_api_key_here"
```

You can also supply the API key via JVM system property:

```shell
-Dautomobile.openai.api.key=your_api_key_here
```

Optional proxy endpoint (all providers):

```shell
-Dautomobile.ai.proxy.endpoint=https://your-proxy.example.com
```

## Current model

- `GPT4o`

## Implementation references

- [`android/junit-runner/src/main/kotlin/dev/jasonpearson/automobile/junit/AutoMobileAgent.kt#L811-L830`](https://github.com/kaeawc/auto-mobile/blob/main/android/junit-runner/src/main/kotlin/dev/jasonpearson/automobile/junit/AutoMobileAgent.kt#L811-L830) for provider selection and API key lookup.
- [`android/junit-runner/src/main/kotlin/dev/jasonpearson/automobile/junit/AutoMobileAgent.kt#L885-L896`](https://github.com/kaeawc/auto-mobile/blob/main/android/junit-runner/src/main/kotlin/dev/jasonpearson/automobile/junit/AutoMobileAgent.kt#L885-L896) for the OpenAI model mapping.
