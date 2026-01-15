# Graph Structure

The navigation graph captures:

- **Nodes**: Unique UI states identified by AutoMobile SDK navigation events + view hierarchy hashing
- **Edges**: Tool calls that cause navigation
- **History**: Sequence of screens visited

## Graph Structure

### Nodes

Each node is identified by:
```typescript
{
  screenId: string,        // Unique identifier
  screenName: string,      // Screen name
  title: string,           // Screen title/label
  signature: string,       // View hierarchy fingerprint
  timestamp: number        // First seen time
}
```

### Edges

Edges record the method of navigation in terms of UI interaction:
```typescript
{
  from: string,           // Source screen ID
  to: string,             // Destination screen ID
  trigger: {
    action: string,       // "tap", "swipe", etc.
    element: string,      // Element that triggered transition
    text: string          // Element text/description
  },
  count: number,          // Times this transition occurred
  avgDuration: number     // Average transition time
}
```
