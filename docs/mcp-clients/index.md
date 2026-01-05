# MCP Client Support

AutoMobile MCP is designed to be run in STDIO mode in production settings like workstations and CI automation. See
[MCP Server Configuration](../features/mcp-server/index.md)

We have specific documentation for clients we have used AutoMobile with:

* [Claude Code](claude-code.md)
* [Codex](codex.md)
* [Cursor](cursor.md)
* [Firebender](firebender.md)
* [Goose](goose.md) 

## Implementation references

- [`src/index.ts#L84-L169`](https://github.com/kaeawc/auto-mobile/blob/main/src/index.ts#L84-L169) for default STDIO transport and CLI flags.
