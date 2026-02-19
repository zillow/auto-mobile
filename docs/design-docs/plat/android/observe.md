# Observe

<kbd>✅ Implemented</kbd> <kbd>🧪 Tested</kbd>

> **Current state:** Fully implemented. The tiered observation pipeline (Accessibility Service → uiautomator fallback with perceptual hash caching) is active. WebSocket freshness after interactions with a 5-second timeout is implemented. See the [Status Glossary](../../status-glossary.md) for chip definitions.

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
    classDef decision fill:#CC2200,stroke-width:0px,color:white;
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
    classDef decision fill:#CC2200,stroke-width:0px,color:white;
    classDef logic fill:#525FE1,stroke-width:0px,color:white;
    classDef result stroke-width:0px;
    class A,G,I result;
    class D,E,H logic;
    class B,C,F decision;
    ```

See [Observation Overview](../../mcp/observe/index.md) for the full list of collected fields and error handling.