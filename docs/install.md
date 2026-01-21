# Install

You can use our interactive installer to step through all host platform requirements and configuration options. It checks host dependencies, optionally downloads Android or iOS developer tools, and configures the MCP daemon.

``` bash title="One-line install (click to copy)"
curl -fsSL https://raw.githubusercontent.com/kaeawc/auto-mobile/main/scripts/install.sh | bash
```

![Install Demo](img/install.gif)

Once you've finished that, learn [how to use AutoMobile](using/ux-exploration.md)

## Uninstalling

To remove AutoMobile and its configurations, use the uninstall script:

``` bash title="One-line uninstall (click to copy)"
curl -fsSL https://raw.githubusercontent.com/kaeawc/auto-mobile/main/scripts/uninstall.sh | bash
```

![Uninstall Demo](img/uninstall.gif)

This will interactively guide you through removing:

- MCP configurations from AI agents (Claude Desktop, Cursor, VS Code, etc.)
- Claude Marketplace plugin
- AutoMobile CLI
- MCP daemon
- AutoMobile data directory

Use `--all` flag to remove everything non-interactively:

``` bash
curl -fsSL https://raw.githubusercontent.com/kaeawc/auto-mobile/main/scripts/uninstall.sh | bash -s -- --all
```
