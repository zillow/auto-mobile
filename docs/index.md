# AutoMobile

AutoMobile is a comprehensive set of tools that enables AI agents to interact with mobile devices. It provides automated
testing, performance monitoring, and device interaction via an MCP server, custom test runner, and agentic loop that is
compatible with multiple foundation model providers. The first platform supported is Android with plans to extend to iOS.

# Why build this

Mobile engineers have a hard time having high confidence when simple changes can have cascading consequences. The UI 
tests meant to provide confidence are slow, brittle, and generally expensive to run. Product owners and designers have a
tough time dogfooding mobile apps on both platforms. Accessibility audits require experts in mobile accessibility - and
after 15 years we’re still applying WCAG once a quarter.

Basically everyone is missing something and it comes down to ease of access. It turns out there are low level tools that
have been available and open sourced for years.

# How do I get started?

- [Installation](installation.md) - Gets you setup with your IDE & MCP Client combination
- [Authoring your first test](test-authoring-and-execution/first-plan-and-test.md) - Using AutoMobile MCP to automatically author a test
- [Model Provider Guides](providers/overview.md) - To enable AutoMobile agent test recovery
- [Running on CI](ci.md) - Automated testing capabilities

## Additional Resources

- [FAQ](faq.md) - Frequently asked questions
- [Security](security.md) - Responsible vulnerability disclosure & use

# Acknowledgement

By continuing to use AutoMobile, you acknowledge and agree to the warnings and responsible use requirements above.

# License

```text
Copyright (C) 2025 Zillow Group

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

   https://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
```
