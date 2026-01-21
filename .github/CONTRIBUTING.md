# Contributing

AutoMobile welcomes contributions!

If you have a question file an issue or discussion, but small contributions like documentation improvements, small obvious fixes, etc don't need prior discussion. If you see a TODO go for it. For larger functionality changes or features, please raise a discussion or issue first before starting work. Keep in mind the [design principles](https://kaeawc.github.io/auto-mobile/design-docs/#design-principles) of the project. Almost everything in CI can be run locally, check out the `scripts/` directory. After you've forked and cloned the project, set up your [local development](#local-development) environment. We expect contributors to be active users of Claude Code or some other AI tool.

## Ways to Contribute

| Type | Description |
|------|-------------|
| Bug reports | File issues with reproduction steps |
| Feature requests | Propose new capabilities via issues |
| Documentation | Improve guides, fix typos, add examples |
| Code | Bug fixes, new features, performance improvements |

## Code Guidelines

- **TypeScript only** - Never write JavaScript
- **Run validation** - `bun run lint` and `bun test` before submitting. If modifying Android or iOS code check for appropriate validation scripts in the `scripts/` directory
- **Keep PRs focused** - One feature or fix per PR
- **Add tests** - Cover new functionality with tests

## Pull Request Process

1. Create a branch from `main`
2. Make your changes with tests
3. At a minimum run `scripts/all_fast_validate_checks.sh`. If modifying Android or iOS code check for appropriate validation scripts in the `scripts/` directory
4. Submit PR with clear description
5. Address review feedback

## Local Development

| Platform | Script |
|----------|--------|
| Android | `./scripts/local-dev/android-hot-reload.sh` |
| iOS | `./scripts/local-dev/ios-hot-reload.sh` |

Options:
- `--device <id>` - Target specific device (ADB device ID or simulator UDID)
- `--skip-ai` - Run without AI agent prompt
- `--once` - Build once and exit

Both scripts write logs to `scratch/`, auto-detect ports based on your git branch, and automatically enable debug flags (`AUTOMOBILE_DEBUG`, `AUTOMOBILE_DEBUG_PERF`).

**Verifying Setup**

In Claude Code, run `/mcp` to check the connection status. A successful setup looks like:

```
╭─────────────────────────────────────────────────────────────────────╮
│ Auto-mobile MCP Server                                              │
│                                                                     │
│ Status: ✔ connected                                                 │
│ Auth: ✔ authenticated                                               │
│ URL: http://localhost:9000/auto-mobile/streamable                   │
│ Config location: /path/to/your/worktree/.mcp.json                   │
│ Capabilities: tools · resources                                     │
│ Tools: 44 tools                                                     │
╰─────────────────────────────────────────────────────────────────────╯
```
