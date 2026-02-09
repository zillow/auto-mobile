# Overview

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

    classDef detect fill:#FF3300,stroke-width:0px,color:white;
    classDef adapt fill:#525FE1,stroke-width:0px,color:white;
    classDef result fill:#00AA55,stroke-width:0px,color:white;

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
| Android | TalkBack | Primary focus |
| iOS | VoiceOver | Planned |

