# Observe

## UIAutomator Fallback

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

  - Latest iteration (WebSocket freshness)
    - After interactions, the observer waits for a WebSocket push from the accessibility service to deliver a fresh
      view hierarchy.
    - The wait uses a 5-second timeout. If no push arrives, the server falls back to a synchronous request to fetch
      the latest view hierarchy.
    - Debouncing is applied so rapid consecutive interactions do not trigger multiple overlapping fetches. The most
      recent pending request wins, and stale requests are dropped.

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
- `perfTiming`, `displayedTimeMetrics` (Android launchApp "Displayed" startup timings), `performanceAudit`, and `accessibilityAudit`: present when the relevant modes are enabled
- `error`: error messages encountered during observation

The observation gracefully handles various error conditions:

- Screen off or device locked states
- Missing accessibility service
- Network timeouts or ADB connection issues
- Partial failures (returns available data even if some operations fail)

Each error is captured in the result object without causing the entire observation to fail, ensuring maximum data
availability for automation workflows.