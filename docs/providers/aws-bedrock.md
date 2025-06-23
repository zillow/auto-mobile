# Model Providers - AWS Bedrock 📋

📋 Koog does not yet support AWS Bedrock

## Environment Requirements

```shell
export AWS_ID="your_secrets"
export AWS_SECRET_KEY="your_secrets"
export AWS_REGION`="your_secrets"
export AWS_PROFILE="your_profile"
```

On CI you should be providing these as environment injected secrets with masking to protect your credentials.

## Available Models

Amazon's Bedrock service basically makes all other models available through their API. While this might be nice to
switch and learn in you should get the same performance as using model providers directly. The main difference
will be the pricing - Anthropic and other providers have direct subscription plans which might be more cost effective
whereas AWS will just the current price per token.
