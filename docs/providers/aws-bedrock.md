# Model Providers - AWS Bedrock

AWS Bedrock is not supported by the current AutoMobile JUnitRunner agent. There is no Bedrock provider wiring in the
Koog-based agent configuration yet.

## Implementation references

- [`android/junit-runner/src/main/kotlin/dev/jasonpearson/automobile/junit/AutoMobileAgent.kt#L43-L48`](https://github.com/kaeawc/auto-mobile/blob/main/android/junit-runner/src/main/kotlin/dev/jasonpearson/automobile/junit/AutoMobileAgent.kt#L43-L48) for the supported provider enum (OpenAI/Anthropic/Google only).
