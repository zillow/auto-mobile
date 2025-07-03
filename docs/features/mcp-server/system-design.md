# Features - MCP Server - System Design

AutoMobile's MCP makes its various [actions](actions.md) available as tool calls and automatically performs
[observations](observation.md) within an [interaction loop](interaction-loop.md).

```mermaid
stateDiagram-v2
    Agent: Agent
    RequestHandler: Request Handler
    DeviceSessionManager: Device Session Manager
    InteractionLoop: Interaction Loop
    AuthorTest: Author Test
  
  
    InitialObserve: Observe
    FinalObserve: Observe
    MoreActions?: More Actions?
    ExecuteAction: Execute Action
    ValidateAction: Validate Action
    ChangeExpected?: Change Expected?
    ValidChange: Valid Change?
    ActionableError: throw ActionableError
    
        Agent --> RequestHandler : 📥 Tool Call Request
        RequestHandler --> Agent : 📤 Tool Call Response
        RequestHandler --> DeviceSessionManager
        InteractionLoop --> RequestHandler: 🖼️ Processed Results 
        DeviceSessionManager --> InteractionLoop: 📱
        RequestHandler --> AuthorTest: on App Stopped
    
    state InteractionLoop {
        InitialObserve --> ExecuteActions
        ExecuteActions --> FinalObserve

        
        state ExecuteActions {
          MoreActions? --> ExecuteAction: ✅
            ExecuteAction --> ValidateAction
            ValidateAction --> MoreActions?: ✅
            ValidateAction --> Done: ❌
            MoreActions? --> Done: ❌
        }
        
        state FinalObserve {
            ChangeExpected? --> ValidChange: ✅
            ChangeExpected? --> Success: ❌
            ValidChange --> Success: ✅
            ValidChange --> ActionableError: ❌
        }
    }
```
