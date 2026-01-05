# Features - MCP Server - Observation

Each observation captures a snapshot of the current state of a device's screen and UI. When executed, it
collects multiple data points in parallel to minimize observation latency. These operations are incredibly platform
specific and will likely require a different ordering of steps per platform. All of this is to drive the
[interaction loop](interaction-loop.md).

## Android

- `dumpsys window` is fetched (with a short-lived memory/disk cache) and used to compute rotation and system insets.
- Screen size is computed from `wm size` plus rotation, with its own memory/disk cache.
- In parallel, the observer collects rotation, wakefulness, and back stack while view hierarchy is fetched separately.
- The active window is primarily derived from the view hierarchy package name, with a fallback to `dumpsys window` when
  needed.
- View Hierarchy
  - The best and fastest option is fetching it via the pre-installed and enabled accessibility service. This is never
    cached because that would introduce lag.

    ```mermaid
    flowchart LR
    A["Observe()"] --> B{"installed?"};
    B -->|"✅"| C{"running?"};
    B -->|"❌"| E["caching system"];
    C -->|"✅"| D["cat vh.json"];
    C -->|"❌"| E["uiautomator dump"];
    D --> I["Return"]
    E --> I;
    classDef decision fill:#FF3300,stroke-width:0px,color:white;
    classDef logic fill:#525FE1,stroke-width:0px,color:white;
    classDef result stroke-width:0px;
    class A,G,I result;
    class D,E,H logic;
    class B,C,F decision;
    ```

  - If the accessibility service is not installed or not enabled yet, we fall back to `uiautomator` output that is
    cached based on a perceptual hash plus pixel matching within a tolerance threshold.

    ```mermaid
    flowchart LR
    A["Observe()"] --> B["Screenshot<br/>+perceptual hash"];
    B --> C{"hash<br/>match?"};
    C -->|"✅"| D["pixelmatch"];
    C -->|"❌"| E["uiautomator dump"];
    D --> F{"within tolerance?"};
    F -->|"✅"| G["Return"];
    F -->|"❌"| E;
    E --> H["Cache"];
    H --> I["Return New Hierarchy"];
    classDef decision fill:#FF3300,stroke-width:0px,color:white;
    classDef logic fill:#525FE1,stroke-width:0px,color:white;
    classDef result stroke-width:0px;
    class A,G,I result;
    class D,E,H logic;
    class B,C,F decision;
    ```

All collected data is assembled into an object containing (fields may be omitted when unavailable):

- `updatedAt`: device timestamp (or server timestamp fallback)
- `screenSize`: current screen dimensions (rotation-aware)
- `systemInsets`: UI insets for all screen edges
- `rotation`: current device rotation value
- `activeWindow`: current app/activity information when resolved
- `viewHierarchy`: complete UI hierarchy (if available)
- `focusedElement`: currently focused UI element (if any)
- `intentChooserDetected`: whether a system intent chooser is visible
- `wakefulness` and `backStack`: Android-specific state
- `perfTiming`, `performanceAudit`, and `accessibilityAudit`: present when the relevant modes are enabled
- `error`: error messages encountered during observation

The observation gracefully handles various error conditions:

- Screen off or device locked states
- Missing accessibility service
- Network timeouts or ADB connection issues
- Partial failures (returns available data even if some operations fail)

Each error is captured in the result object without causing the entire observation to fail, ensuring maximum data
availability for automation workflows.

## Implementation references

- [`src/features/observe/ObserveScreen.ts#L314-L385`](https://github.com/kaeawc/auto-mobile/blob/main/src/features/observe/ObserveScreen.ts#L314-L385) for parallel collection and Android/iOS observation flow.
- [`src/features/observe/GetDumpsysWindow.ts#L8-L86`](https://github.com/kaeawc/auto-mobile/blob/main/src/features/observe/GetDumpsysWindow.ts#L8-L86) for `dumpsys window` caching behavior.
- [`src/features/observe/GetScreenSize.ts#L152-L221`](https://github.com/kaeawc/auto-mobile/blob/main/src/features/observe/GetScreenSize.ts#L152-L221) for `wm size` usage and screen size caching.
- [`src/features/observe/ViewHierarchy.ts#L30-L215`](https://github.com/kaeawc/auto-mobile/blob/main/src/features/observe/ViewHierarchy.ts#L30-L215) for accessibility service usage and view hierarchy caching.
- [`src/models/ObserveResult.ts#L23-L170`](https://github.com/kaeawc/auto-mobile/blob/main/src/models/ObserveResult.ts#L23-L170) for the observation result schema.
