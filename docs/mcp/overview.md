# MCP Client Configuration

AutoMobile MCP is designed to be run in STDIO mode in production settings like workstations and CI automation.

```shell
npx -y auto-mobile@latest
```

If you have a private NPM registry you can instead do the following

```kotlin
npx --registry https://your.awesome.private.registry.net/path/to/npm/proxy -y auto-mobile@latest
```

A lot of MCP clients configure MCP servers through JSON, this sample will work with most

```json
{
  "mcpServers": {
    "AutoMobile": {
      "command": "npx",
      "args": ["-y", "auto-mobile@latest"]
    }
  }
}
```

We have specific documentation for clients we have used AutoMobile with:

* [Firebender](firebender.md)
* [Cursor](cursor.md)
* [Goose](goose.md) 
