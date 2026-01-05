# Model Providers

AutoMobile’s AI agent is bundled with the Android JUnitRunner. Provider selection and credentials are configured via
system properties or environment variables in the JUnitRunner process.

Supported providers:

- ✅ [OpenAI](openai.md)
- ✅ [Anthropic](anthropic.md)
- ✅ [Google](google.md)

Not supported:

- ❌ [AWS Bedrock](aws-bedrock.md)

## Common Configuration

Use the system property `automobile.ai.provider` to select a provider (`openai`, `anthropic`, `google`). The agent
reads provider-specific API keys from environment variables or `automobile.<provider>.api.key` system properties. An
optional proxy endpoint can be set with `automobile.ai.proxy.endpoint`.

## Implementation references

- [`android/junit-runner/src/main/kotlin/dev/jasonpearson/automobile/junit/AutoMobileAgent.kt#L811-L850`](https://github.com/kaeawc/auto-mobile/blob/main/android/junit-runner/src/main/kotlin/dev/jasonpearson/automobile/junit/AutoMobileAgent.kt#L811-L850) for provider selection and credential lookup.
- [`android/junit-runner/src/main/kotlin/dev/jasonpearson/automobile/junit/AutoMobileAgent.kt#L885-L896`](https://github.com/kaeawc/auto-mobile/blob/main/android/junit-runner/src/main/kotlin/dev/jasonpearson/automobile/junit/AutoMobileAgent.kt#L885-L896) for the current model mapping per provider.
