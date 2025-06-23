# CI with AutoMobile

Since AutoMobile is a tool designed to automate mobile interactions one of the big early use cases is running it on CI.

## Run plans on CI with no agent capabilities

1. Install AutoMobile: `npm install -g auto-mobile`
2. Ensure one or more Android emulators are running and detectable by `adb devices`
3. Run test plans: `auto-mobile --cli executePlan --planContent "$(cat my-plan.yaml)"`

AutoMobile handles parallel test execution and clears app data between tests automatically.

## Run plans on CI with agent capabilities

1. Install AutoMobile: `npm install -g auto-mobile`
2. If you want to enable agent capabilities
   a. Read ([provider guides](providers/overview.md) and 
   b. Set foundation model API keys (and optionally proxy endpoints) as environment variables 
3. Ensure one or more Android emulators are running and detectable by `adb devices`
4. Start AutoMobile MCP server with agent loop: `auto-mobile --agent`

See documentation [Foundation Model Providers](providers/overview.md) for more details.
