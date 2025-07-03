# Features - MCP Server - Observation

Each observation captures a snapshot of the current state of a device's screen and UI. When executed, it
collects multiple data points in parallel to minimize observation latency. These operations are incredibly platform
specific and will likely require a different ordering of steps per platform. All of this is to drive the
[interaction loop](interaction-loop.md).

## Android

- Pre-fetch `dumpsys window` and `wm size` output, potentially from cache, to optimize subsequent parallel operations. The cached
value should have been written from the last most recent observation from the current device.
- At this point we can determine physical screen size, active window, current orientation, and system insets.
  This includes the status bar height, navigation bar height, and other gesture navigation areas.
- We then optionally query two things simultaneously:
  - Full active window refresh via `dumpsys window`. This ensures that if for some reason we didn't have the correct active window and application package name, we'll have it in time before the view hierarch fetch starts.
  - `gfxinfo reset` in order to reset all framerate calculations and data collection. We need this reset in order to
    properly idle between interactions.
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
    cached based on screenshot dHash + pixel matching within a tool-variable threshold. Most tools use the default
    threshold, but certain operations like text manipulation require exact pixel matching to have confidence that we're
    capturing the actual latest view hierarchy.

    ```mermaid
    flowchart LR
    A["Observe()"] --> B["Screenshot<br/>+dHash"];
    B --> C{"hash<br/>match?"};
    C -->|"✅"| D["pixelmatch"];
    C -->|"❌"| E["uiautomator dump"];
    D --> F{>99.8%?};
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

All collected data is assembled into an object containing:

- `timestamp`: ISO timestamp of the observation
- `screenSize`: Current screen dimensions (rotation-aware)
- `systemInsets`: UI insets for all screen edges
- `rotation`: Current device rotation value
- `activeWindow`: Current app and activity information
- `viewHierarchy`: Complete UI hierarchy (if available)
- `focusedElement`: Currently focused UI element (if any)
- `intentChooserDetected`: Whether a system intent chooser is visible
- `error`: Any error messages encountered during observation

The observation gracefully handles various error conditions:

- Screen off or device locked states
- Missing accessibility service
- Network timeouts or ADB connection issues
- Partial failures (returns available data even if some operations fail)

Each error is captured in the result object without causing the entire observation to fail, ensuring maximum data
availability for automation workflows.
