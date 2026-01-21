# Contributing

Thank you for your interest in contributing to AutoMobile!

![AutoMobile](../img/auto-mobile-party.gif)

## Getting Started

1. **File an issue first** - Discuss your idea before starting work
2. **Fork and clone** - Create your own fork of the repository
3. **Set up development** - See [Local Development](local-development.md) for setup instructions

## Ways to Contribute

| Type | Description |
|------|-------------|
| Bug reports | File issues with reproduction steps |
| Feature requests | Propose new capabilities via issues |
| Documentation | Improve guides, fix typos, add examples |
| Code | Bug fixes, new features, performance improvements |

## Code Guidelines

- **TypeScript only** - Never write JavaScript
- **Run validation** - `bun run lint` and `bun test` before submitting
- **Keep PRs focused** - One feature or fix per PR
- **Add tests** - Cover new functionality with tests

## Documentation Style

- **Demos are collapsible** - Wrap GIF demos in MkDocs collapsible admonitions (e.g. `??? example "See demo: <label>"`).
- **Vary labels by page** - Use "See demo: <context>" or similar, rather than repeating a single label everywhere.

## Pull Request Process

1. Create a branch from `main`
2. Make your changes with tests
3. Run `bun run lint && bun test`
4. Submit PR with clear description
5. Address review feedback

## Related

- [Local Development](local-development.md) - Development environment setup
- [iOS Signing](ios-signing.md) - XCTestRunner signing setup for CI
- [Publishing](publishing.md) - npm package publishing guide
