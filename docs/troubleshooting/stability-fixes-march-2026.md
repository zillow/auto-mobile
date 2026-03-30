# Stability Fixes — March 2026

> Documented after a multi-session debugging marathon running AutoMobile tests in fub-android. Several independent bugs combined to make diagnosis difficult.

---

## 1. `console.log()` corrupts the MCP stdio channel

**Where:** `src/daemon/manager.ts` — `DaemonManager.start()`, `.stop()`, `.restart()`

**What happens:**

The MCP server uses **stdout** for JSON-RPC communication with the IDE. When running in proxy mode (default), the server auto-starts a background daemon on first use. The `DaemonManager` lifecycle methods used `console.log()` to print status messages like:

```
Starting AutoMobile daemon...
Daemon started successfully (PID 12345, port 3000)
Socket: /tmp/auto-mobile-daemon-502.sock
```

These plain-text messages get **interleaved with JSON-RPC on stdout**, corrupting the protocol. The IDE receives garbage mixed with JSON and can't parse any of it.

**Why not caught sooner:** Only affects proxy mode (default). Direct mode (`--no-proxy`) doesn't use stdout for MCP, so tools loaded fine there — making the bug invisible during typical local development.

**Fix:** Replaced all `console.log()` in `DaemonManager` class methods with `stderrLog()`, a helper that writes to `process.stderr`. The `console.log` calls in `runDaemonCommand()` (CLI-only code path) were left alone since CLI mode doesn't use stdio for MCP.

**Rule:** Never use `console.log()` in any code path that can execute while the MCP stdio transport is active. Use `logger` (writes to file) or `process.stderr.write()` instead.

### Reproduction

The script below simulates `DaemonManager.start()` in both modes. "before" uses `console.log()` (writes to stdout); "after" uses `stderrLog()` (writes to stderr). Run with stderr suppressed to see exactly what the IDE receives on the JSON-RPC channel:

```javascript
#!/usr/bin/env node
/**
 * Reproduction of MCP stdout corruption.
 *
 * In proxy mode, stdout is the JSON-RPC channel. DaemonManager.start()
 * used console.log() which writes to stdout, interleaving plain text
 * with JSON-RPC messages. The IDE can't parse the result.
 *
 * Run:
 *   node scratch/repro-stdout-corruption.js before 2>/dev/null
 *   node scratch/repro-stdout-corruption.js after  2>/dev/null
 */

const mode = process.argv[2] || "before";

function simulateMcpResponse() {
  const response = JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    result: {
      protocolVersion: "2024-11-05",
      capabilities: { tools: {} },
      serverInfo: { name: "auto-mobile", version: "1.0.0" }
    }
  });
  process.stdout.write(response + "\n");
}

function stderrLog(msg) {
  process.stderr.write(msg + "\n");
}

if (mode === "before") {
  // BEFORE: DaemonManager.start() used console.log (writes to stdout)
  console.log("WARNING: Found 1 other auto-mobile daemon process(es) running:");
  console.log("  - PID 12345");
  console.log("Stopping all other daemons before starting new one...");
  console.log("  Stopped PID 12345");
  console.log("Starting AutoMobile daemon...");
  simulateMcpResponse();
  console.log("Daemon started successfully (PID 67890, port 3000)");
  console.log("Socket: /tmp/auto-mobile-daemon-502.sock");
  console.log("Logs: /tmp/auto-mobile-daemon.log");
} else {
  // AFTER: All lifecycle messages go to stderr
  stderrLog("WARNING: Found 1 other auto-mobile daemon process(es) running:");
  stderrLog("  - PID 12345");
  stderrLog("Stopping all other daemons before starting new one...");
  stderrLog("  Stopped PID 12345");
  stderrLog("Starting AutoMobile daemon...");
  simulateMcpResponse();
  stderrLog("Daemon started successfully (PID 67890, port 3000)");
  stderrLog("Socket: /tmp/auto-mobile-daemon-502.sock");
  stderrLog("Logs: /tmp/auto-mobile-daemon.log");
}
```

**Before (stdout with `console.log` — what the IDE sees on the JSON-RPC channel):**

```
$ node scratch/repro-stdout-corruption.js before 2>/dev/null

WARNING: Found 1 other auto-mobile daemon process(es) running:
  - PID 12345
Stopping all other daemons before starting new one...
  Stopped PID 12345
Starting AutoMobile daemon...
{"jsonrpc":"2.0","id":1,"result":{"protocolVersion":"2024-11-05","capabilities":{"tools":{}},"serverInfo":{"name":"auto-mobile","version":"1.0.0"}}}
Daemon started successfully (PID 67890, port 3000)
Socket: /tmp/auto-mobile-daemon-502.sock
Logs: /tmp/auto-mobile-daemon.log
```

The IDE tries to parse each line as JSON-RPC. The first thing it reads is `WARNING: Found 1 other...` — not valid JSON. It fails, and tools never load.

**After (stdout with `stderrLog` — clean JSON-RPC channel):**

```
$ node scratch/repro-stdout-corruption.js after 2>/dev/null

{"jsonrpc":"2.0","id":1,"result":{"protocolVersion":"2024-11-05","capabilities":{"tools":{}},"serverInfo":{"name":"auto-mobile","version":"1.0.0"}}}
```

Only valid JSON-RPC on stdout. The lifecycle messages still print — they're on stderr where they belong.

---

## 2. Zod union schemas produce MCP-noncompliant tool definitions

**Where:** `src/server/toolRegistry.ts`, `src/server/interactionTools.ts`

**What happens:**

The MCP spec requires every tool's `inputSchema` to have `type: "object"` at the top level. Tools using `z.union()` (like `tapOn` with multiple selector strategies) produce JSON Schema with `anyOf`/`oneOf` at the top level — no `type: "object"`. The MCP SDK validates tool definitions in proxy mode and rejects the **entire** `tools/list` response — zero tools load even though 47 of 49 tools are valid. The Anthropic API independently rejects `anyOf`/`oneOf`/`allOf` at the top level of `input_schema`.

**Why not caught sooner:** Direct mode (`--no-proxy`) returns tool definitions without this validation step, so tools loaded fine there.

**Fix:** Added `flattenTopLevelUnion()` in `toolRegistry.ts` that merges all union branches into a single `type: "object"` schema with all properties combined. `required` is dropped since different branches require different keys. Applied automatically in `getToolDefinitions()` to every tool's `inputSchema`.

**Trade-off:** The flattened schema loses mutual-exclusivity information, so LLMs may send invalid property combinations. The server-side Zod union still validates at runtime, but error messages are less clear than a well-structured schema would provide. A TODO is in the code to replace top-level `z.union()` with discriminator fields for a cleaner long-term solution.

**Rule:** When adding new tools with `z.union()` as the top-level schema, `flattenTopLevelUnion` handles it automatically. But prefer `z.object()` with optional fields over unions when possible.

---

## 3. "Setup already attempted" across test sessions

**Where:** `src/server/ToolExecutionContext.ts`

**What happens:**

`AndroidCtrlProxyManager` is a per-device singleton that lives for the daemon process's entire lifetime. It has an `attemptedAutomatedSetup` flag that gets set to `true` after the first accessibility service setup attempt. When a new test session starts (new UUID), `ensureAccessibilityServiceReady()` grabs the same singleton and calls `setup()`. If the accessibility service is no longer working (previous test disrupted it, service crashed, etc.), `setup()` sees the flag is `true` and bails with "Setup already attempted" — refusing to retry.

**Why not caught sooner:** Requires multiple sequential test sessions on the same device with a long-lived daemon — the pattern created by the JUnit runner. Most users either use single-session IDE workflows, restart the daemon between runs, or have a healthy accessibility service that doesn't need re-setup.

**Fix:** Call `resetSetupState()` before `setup()` in `ensureAccessibilityServiceReady()`. Since this function is only called for brand-new sessions, each test gets a clean setup attempt. This matches the pattern already used in `DeviceSessionManager`'s recovery paths.

---

## 4. PlanExecutor not unwrapping MCP response envelope

**Where:** `src/utils/plan/PlanExecutor.ts`

**What happens:**

Tool handlers return MCP-wrapped responses via `createJSONToolResponse()`:

```json
{ "content": [{ "type": "text", "text": "{\"success\": false, \"error\": \"Element not found\"}" }] }
```

The PlanExecutor was checking `response.success` on this MCP envelope, which doesn't have a `success` field — it has `content`. So `response.success === false` was never true, and every step appeared to succeed even when the underlying tool reported failure.

**Fix:** Added `extractToolResult()` that unwraps the MCP content envelope to get the actual tool result JSON. All success/failure checks and error logging now use the unwrapped result.

**Impact:** Before the fix, a plan with a failing step would silently continue. After the fix, failures are detected, logged with the actual error message, and the plan stops at the correct step.

---

## 5. JUnit runner: local daemon path resolution

**Where:** `android/junit-runner/.../DaemonSocketClient.kt`

**What happens:**

The JUnit runner's `buildDaemonCommand()` always resolved the daemon via `npx @kaeawc/auto-mobile@latest`, pulling the npm-published version. When developing AutoMobile locally, new tools and fixes aren't in the published package — leading to "Unknown tool" errors and stale behavior. The only workaround was a fragile `npx` cache symlink hack.

**Fix:** Added `resolveLocalProjectPath()` that checks `automobile.daemon.local.project.path` (system property) or `AUTOMOBILE_DAEMON_LOCAL_PROJECT_PATH` (env var). If set and `dist/src/index.js` exists at that path, the runner uses `node <path>/dist/src/index.js` instead of `npx`. Falls through to existing resolution otherwise.

**Also:** `TestTimingCache.kt` — moved `buildRequestUri()` inside the try block so URI construction failures are caught instead of crashing the runner.

---

## 6. Plan tools gated behind daemon mode

**Where:** `src/server/index.ts`

**What happens:**

`registerPlanTools()` was inside the `if (daemonMode)` block, so `executePlan` and related tools were unavailable in stdio/no-proxy mode. Single-device plan execution doesn't actually need the daemon.

**Fix:** Moved `registerPlanTools()` outside the daemon gate. Only `registerCriticalSectionTools()` (which depends on `DaemonState`'s lock manager) remains daemon-only.

---

## Architecture Context: Proxy vs Direct Mode

Understanding these two modes is key to debugging MCP issues.

### Proxy mode (default, no flags)

```
IDE ←stdio→ MCP Server ←unix socket→ Daemon (background process)
```

- The MCP server is a thin proxy that forwards all requests to a daemon
- The daemon manages device state, tool execution, and device pools
- Tool definitions come FROM the daemon, through the MCP SDK validation layer
- **The MCP SDK validates tool definitions received from the daemon** — this is where schema issues manifest

### Direct mode (`--no-proxy`)

```
IDE ←stdio→ MCP Server (executes tools directly)
```

- The MCP server handles everything in-process
- Tool definitions come directly from `ToolRegistry` without proxy validation
- **Tool definitions bypass the strict MCP SDK validation** — schema issues are invisible here

## Prevention Checklist

When adding new tools or modifying the daemon/proxy path:

1. **Never `console.log()` in code reachable from the MCP server process.** Use `logger` or `process.stderr.write()`.
2. **Test tool schemas in proxy mode**, not just direct mode. The proxy validates schemas more strictly.
3. **Prefer `z.object()` over `z.union()` for tool input schemas.** If union is necessary, verify the JSON Schema output has `type: "object"` at the top level.
4. **After schema changes, run `bun test test/server/tools/schema.test.ts`** — it validates all tool definitions conform to MCP standards.
5. **Kill stale daemon processes and clean socket files** when switching between branches or rebuilding:
   ```bash
   kill $(cat /tmp/auto-mobile-daemon-$(id -u).pid 2>/dev/null | python3 -c "import json,sys; print(json.load(sys.stdin)['pid'])" 2>/dev/null) 2>/dev/null
   rm -f /tmp/auto-mobile-daemon-$(id -u).pid /tmp/auto-mobile-daemon-$(id -u).sock
   ```

## Quick Fix Reference

| Symptom | Likely cause | Fix |
|---|---|---|
| "Loading tools..." forever | `console.log` on stdout in proxy path | Ensure no stdout writes in daemon lifecycle code |
| "Error" in Firebender MCP | Tool schema validation failure | Check `toJSONSchema()` output has `type: "object"` |
| Resources load but no tools | Schema validation — resources and tools are separate MCP requests | Fix tool schemas, restart |
| Tools work in `--no-proxy` but not default | Proxy mode validates schemas stricter than direct mode | Test in proxy mode |
| "Setup already attempted" | Stale singleton flag from prior session | `resetSetupState()` before `setup()` in new sessions |
| "Unknown tool: X" | Running npm-published daemon, not local build | Set `automobile.daemon.local.project.path` or kill stale `npx` daemon |
| Plan steps silently pass when they should fail | PlanExecutor checking MCP envelope instead of tool result | Use `extractToolResult()` to unwrap |
| Daemon won't start | Stale socket/PID files from dead process | Clean `/tmp/auto-mobile-daemon-*.sock` and `.pid` |
| Multiple daemons fighting | Old daemon from another branch still running | `ps aux \| grep auto-mobile` and kill strays |
