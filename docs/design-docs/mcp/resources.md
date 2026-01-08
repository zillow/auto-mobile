# MCP Resources

AutoMobile exposes resources through the Model Context Protocol for AI agents to access.


MCP Resources provide read-only access to:

- Navigation graph data
- Test execution history
- Performance metrics
- Device information

## Available Resources

### Navigation Graph

**URI**: `automobile:navigation/graph`

Returns the current navigation graph showing:

- Known screens and their IDs
- Screen transitions and triggers
- UI elements that cause navigation

See [Navigation Graph](navigation-graph.md) for details.

### Test Timing History

**URI**: `
automobile:test-timings`

Returns historical test execution data:

- Test class and method names
- Average execution duration
- Success/failure rates
- Device information

See [Daemon](daemon.md) for test timing aggregation.

### Performance Results

**URI**: `
automobile:performance-results`

Returns recent UI performance audit results:

- Scroll framerate measurements
- Frame drop counts
- Render time statistics

## Using Resources

AI agents can request resources via MCP:

```json
{
  "method": "resources/read",
  "params": {
    "uri": "automobile:navigation/graph"
  }
}
```

The agent receives structured data that it can analyze and use to inform decisions.

## Implementation

See [MCP Server](index.md) for technical implementation details of resource providers.
