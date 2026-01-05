# Navigation Graph (Current Implementation)

## Overview
AutoMobile maintains a navigation graph per app. The graph is persisted in SQLite and updated from both explicit
navigation events emitted by the Android accessibility service and view-hierarchy fingerprint changes. Tool calls are
recorded in memory and correlated to navigation events to build replayable edges.

## Data Flow

1. `AccessibilityServiceClient` receives `navigation_event` messages from the Android accessibility service and records
   them in `NavigationGraphManager`.
2. `HierarchyNavigationDetector` consumes hierarchy updates and records fingerprint-based transitions when screens
   change without explicit events.
3. `ToolRegistry` records navigation-relevant tool calls and the current UI state for later correlation.
4. `NavigationGraphManager` persists nodes, edges, UI elements, modal stacks, and scroll positions via
   `NavigationRepository` (SQLite).
5. `navigateTo`, `getNavigationGraph`, and `explore` use the stored graph for navigation and debugging.

## Storage

The navigation graph is stored in the shared AutoMobile SQLite database at `~/.auto-mobile/auto-mobile.db`.

## Tools

- `navigateTo`: replay a known path to a target screen, using recorded tool calls when possible.
- `getNavigationGraph`: export graph summaries for debugging.
- `explore`: build the navigation graph automatically by exploring screens.

## Implementation References

- `navigation_event` handling: https://github.com/kaeawc/auto-mobile/blob/main/src/features/observe/AccessibilityServiceClient.ts#L760-L1010
- Hierarchy-based navigation detection: https://github.com/kaeawc/auto-mobile/blob/main/src/features/navigation/HierarchyNavigationDetector.ts#L1-L210
- Navigation graph persistence/correlation: https://github.com/kaeawc/auto-mobile/blob/main/src/features/navigation/NavigationGraphManager.ts#L1-L460
- Tool call correlation: https://github.com/kaeawc/auto-mobile/blob/main/src/server/toolRegistry.ts#L120-L190
- Navigation tools (`navigateTo`, `getNavigationGraph`, `explore`): https://github.com/kaeawc/auto-mobile/blob/main/src/server/navigationTools.ts#L1-L186
- SQLite database path: https://github.com/kaeawc/auto-mobile/blob/main/src/db/database.ts#L1-L50
