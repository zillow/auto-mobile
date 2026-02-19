# Overview

<kbd>⚠️ Partial</kbd>

> **Current state:** TalkBack/VoiceOver auto-detection is implemented (via ADB secure settings query, cached with 60s TTL). Tool adaptations for TalkBack mode (ACTION_CLICK, two-finger scroll, etc.) are designed but not yet fully built — see [TalkBack/VoiceOver design](talkback-voiceover.md). iOS VoiceOver support is planned. The `auditAccessibility` MCP tool for contrast/tap target checks is ✅ Implemented separately. See the [Status Glossary](../../status-glossary.md) for chip definitions.

AutoMobile supports accessibility testing by detecting and adapting to screen readers like TalkBack (Android) and VoiceOver (iOS).

```mermaid
flowchart LR
    subgraph Detection
        Auto["🔍 Auto-detect<br/>TalkBack/VoiceOver"]
        Cache["💾 Cache State<br/>(60s TTL)"]
    end

    subgraph Adaptation
        Tap["👆 tapOn<br/>ACTION_CLICK"]
        Scroll["👉 swipeOn<br/>Two-finger / Scroll Action"]
        Input["⌨️ inputText<br/>ACTION_SET_TEXT"]
    end

    subgraph Result
        Agent["🤖 Agent<br/>(No changes needed)"]
    end

    Auto --> Cache
    Cache --> Tap
    Cache --> Scroll
    Cache --> Input
    Tap --> Agent
    Scroll --> Agent
    Input --> Agent

    classDef detect fill:#CC2200,stroke-width:0px,color:white;
    classDef adapt fill:#525FE1,stroke-width:0px,color:white;
    classDef result fill:#007A3D,stroke-width:0px,color:white;

    class Auto,Cache detect;
    class Tap,Scroll,Input adapt;
    class Agent result;
```

## Design Principles

1. **Auto-detect and adapt** - Tools automatically detect screen readers and adjust behavior
2. **Backward compatible** - No changes to existing tool interfaces or automation scripts
3. **Transparent** - Behavior adaptations invisible to MCP consumers (agents)
4. **Performance** - Detection cached with <50ms overhead

## Key Adaptations

| Tool | Standard Mode | Screen Reader Mode |
|------|---------------|-------------------|
| `tapOn` | Coordinate tap | `ACTION_CLICK` on element |
| `swipeOn` | Single-finger swipe | Two-finger swipe or `ACTION_SCROLL_*` |
| `inputText` | `ACTION_SET_TEXT` | No change (already accessible) |
| `pressButton` | Hardware keyevent | Optional `GLOBAL_ACTION_BACK` |

## Topics

| Document | Description |
|----------|-------------|
| [TalkBack/VoiceOver Adaptation](talkback-voiceover.md) | Complete design for screen reader support |

## Platform Support

| Platform | Screen Reader | Status |
|----------|---------------|--------|
| Android | TalkBack | <kbd>⚠️ Partial</kbd> — detection implemented, tool adaptations in progress |
| iOS | VoiceOver | <kbd>🚧 Design Only</kbd> — planned |

