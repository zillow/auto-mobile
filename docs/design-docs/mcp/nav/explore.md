# Explore

<kbd>✅ Implemented</kbd> <kbd>🧪 Tested</kbd>

> **Current state:** All three modes (discover, validate, hybrid) are implemented. See the [Status Glossary](../../status-glossary.md) for chip definitions.

## Exploration Modes

The `explore` tool supports three modes for different use cases:

### Discovery Mode (`mode: "discover"`)

**Purpose**: Build the navigation graph from scratch by discovering new screens and transitions.

**Behavior**:
- Heavily favors novel elements and unexplored areas
- Prioritizes coverage over validation
- Records new screens and transitions as they're discovered
- Best for initial app exploration

### Validate Mode (`mode: "validate"`)

**Purpose**: Navigate through a known navigation graph to verify it matches current app behavior.

**Behavior**:
- Requires an existing navigation graph
- Systematically traverses all known edges in the graph
- Validates that each navigation transition still works as recorded
- Fails with detailed error if app diverges from known graph
- Records edge validation results (success/failure, confidence scores)
- Provides graph traversal metrics (edges traversed, nodes visited, coverage %)

**Use Cases**:
- **Regression Testing**: Verify navigation paths still work after code changes
- **State Verification**: Navigate to specific screens to verify UI/functionality
- **Performance Testing**: Measure navigation performance across known routes
- **Graph Quality Assessment**: Validate graph accuracy and identify stale edges

**Validation Results**:
```typescript
{
  graphTraversal: {
    nodesVisited: number,
    totalNodes: number,
    edgesTraversed: number,
    totalEdges: number,
    edgeValidationResults: EdgeValidationResult[],
    coveragePercentage: number
  }
}
```

**Edge Validation**:
Each edge traversal records:
- Success/failure of the navigation
- Expected vs actual destination
- Element matching confidence
- Error details if validation failed

### Hybrid Mode (`mode: "hybrid"`)

**Purpose**: Balance between discovery and validation.

**Behavior**:
- Uses known graph when available but allows discovery
- Balances navigation score, novelty, and coverage equally
- Suitable for general exploration of partially-known apps
