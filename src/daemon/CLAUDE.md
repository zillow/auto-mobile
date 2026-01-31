# Daemon Socket Servers

This directory contains Unix domain socket servers that communicate with IDE plugins and other clients.

## Socket Server Patterns

All socket servers MUST extend one of the base classes in `socketServer/`:

### Request-Response Pattern
For servers that handle discrete requests with responses:
```typescript
import { RequestResponseSocketServer } from "./socketServer/index";

class MySocketServer extends RequestResponseSocketServer<MyRequest, MyResponse> {
  protected async handleRequest(request: MyRequest): Promise<MyResponse> {
    // Handle request and return response
  }
}
```

**Examples:** `videoRecordingSocketServer`, `deviceSnapshotSocketServer`, `testRecordingSocketServer`, `appearanceSocketServer`, `performanceStreamSocketServer`, `failuresStreamSocketServer`

### Push Subscription Pattern
For servers that maintain subscribers and push updates:
```typescript
import { PushSubscriptionSocketServer } from "./socketServer/index";

class MySocketServer extends PushSubscriptionSocketServer<MyFilter, MyPushData> {
  protected parseSubscriptionFilter(request: Record<string, unknown>): MyFilter {
    // Extract filter from subscription request
  }

  protected matchesFilter(filter: MyFilter, data: MyPushData): boolean {
    // Return true if data should be sent to this subscriber
  }

  protected createPushMessage(data: MyPushData): unknown {
    // Create the push message to send
  }

  // Call this to push data to subscribers:
  // this.pushToSubscribers(data);
}
```

**Examples:** `performancePushSocketServer`, `deviceDataStreamSocketServer`

## Key Benefits of Base Classes

1. **Timer injection** - Use `this.timer` for testable time-dependent code (via `FakeTimer` in tests)
2. **Consistent line protocol** - JSON-over-newline handled automatically
3. **Keepalive handling** - Automatic ping/pong and dead subscriber cleanup (push servers)
4. **Socket lifecycle** - Start/stop/cleanup managed consistently
5. **Reduced duplication** - ~200 lines saved per server

## Adding a New Socket Server

1. Determine the pattern: request-response or push subscription
2. Extend the appropriate base class
3. Implement the required abstract methods
4. Use `getSocketPath()` with `SocketServerConfig` for consistent path handling
5. Add singleton management functions (`getXxxServer`, `startXxxSocketServer`, `stopXxxSocketServer`)

## Testing

Use `FakeTimer` from `test/fakes/FakeTimer.ts` to control time in tests:
```typescript
const fakeTimer = new FakeTimer();
const server = new MySocketServer(socketPath, fakeTimer);
// Advance time without waiting
fakeTimer.advance(10000);
```
