import { describe, it, expect, beforeEach } from "bun:test";
import {
  TelemetryRecorder,
  type TelemetryRepository,
  type TelemetryPushTarget,
  type TelemetryEvent,
} from "../../../src/features/telemetry/TelemetryRecorder";
import type { RecordNetworkEventInput } from "../../../src/db/networkEventRepository";
import type { RecordLogEventInput } from "../../../src/db/logEventRepository";
import type { RecordCustomEventInput } from "../../../src/db/customEventRepository";
import type { RecordOsEventInput } from "../../../src/db/osEventRepository";

class FakeRepository implements TelemetryRepository {
  networkEvents: RecordNetworkEventInput[] = [];
  logEvents: RecordLogEventInput[] = [];
  customEvents: RecordCustomEventInput[] = [];
  osEvents: RecordOsEventInput[] = [];
  shouldThrow = false;

  async recordNetworkEvent(input: RecordNetworkEventInput): Promise<void> {
    if (this.shouldThrow) {throw new Error("db error");}
    this.networkEvents.push(input);
  }
  async recordLogEvent(input: RecordLogEventInput): Promise<void> {
    if (this.shouldThrow) {throw new Error("db error");}
    this.logEvents.push(input);
  }
  async recordCustomEvent(input: RecordCustomEventInput): Promise<void> {
    if (this.shouldThrow) {throw new Error("db error");}
    this.customEvents.push(input);
  }
  async recordOsEvent(input: RecordOsEventInput): Promise<void> {
    if (this.shouldThrow) {throw new Error("db error");}
    this.osEvents.push(input);
  }
}

class FakePushTarget implements TelemetryPushTarget {
  pushedEvents: TelemetryEvent[] = [];
  pushTelemetryEvent(event: TelemetryEvent): void {
    this.pushedEvents.push(event);
  }
}

describe("TelemetryRecorder", () => {
  let repo: FakeRepository;
  let pushTarget: FakePushTarget;
  let recorder: TelemetryRecorder;

  beforeEach(() => {
    repo = new FakeRepository();
    pushTarget = new FakePushTarget();
    recorder = new TelemetryRecorder(repo, () => pushTarget);
    TelemetryRecorder.resetInstance();
  });

  it("records network event to repository with context", async () => {
    recorder.setContext("device-1", "session-1");

    await recorder.recordNetworkEvent({
      timestamp: 1000,
      applicationId: "com.example",
      url: "https://api.example.com/users",
      method: "GET",
      statusCode: 200,
      durationMs: 42,
      requestBodySize: 0,
      responseBodySize: 1024,
      protocol: "h2",
      host: "api.example.com",
      path: "/users",
      error: null,
    });

    expect(repo.networkEvents).toHaveLength(1);
    expect(repo.networkEvents[0].deviceId).toBe("device-1");
    expect(repo.networkEvents[0].sessionId).toBe("session-1");
    expect(repo.networkEvents[0].url).toBe("https://api.example.com/users");
  });

  it("pushes network event to socket", async () => {
    await recorder.recordNetworkEvent({
      timestamp: 1000,
      applicationId: null,
      url: "/test",
      method: "GET",
      statusCode: 200,
      durationMs: 10,
      requestBodySize: 0,
      responseBodySize: 0,
      protocol: null,
      host: null,
      path: null,
      error: null,
    });

    expect(pushTarget.pushedEvents).toHaveLength(1);
    expect(pushTarget.pushedEvents[0].category).toBe("network");
    expect(pushTarget.pushedEvents[0].timestamp).toBe(1000);
    expect(pushTarget.pushedEvents[0].deviceId).toBeNull();
  });

  it("includes deviceId in pushed events", async () => {
    recorder.setContext("emulator-5554", "s1");

    await recorder.recordLogEvent({
      timestamp: 1000, applicationId: null, level: 4, tag: "t", message: "m", filterName: "f",
    });

    expect(pushTarget.pushedEvents).toHaveLength(1);
    expect(pushTarget.pushedEvents[0].deviceId).toBe("emulator-5554");
  });

  it("records log event to repository", async () => {
    recorder.setContext("d1", "s1");

    await recorder.recordLogEvent({
      timestamp: 2000,
      applicationId: "com.example",
      level: 4,
      tag: "TestTag",
      message: "hello",
      filterName: "main",
    });

    expect(repo.logEvents).toHaveLength(1);
    expect(repo.logEvents[0].tag).toBe("TestTag");
    expect(repo.logEvents[0].deviceId).toBe("d1");
  });

  it("records custom event to repository", async () => {
    await recorder.recordCustomEvent({
      timestamp: 3000,
      applicationId: null,
      name: "purchase",
      properties: { item: "premium" },
    });

    expect(repo.customEvents).toHaveLength(1);
    expect(repo.customEvents[0].name).toBe("purchase");
    expect(repo.customEvents[0].properties).toEqual({ item: "premium" });
  });

  it("records OS event to repository", async () => {
    await recorder.recordOsEvent({
      timestamp: 4000,
      applicationId: null,
      category: "lifecycle",
      kind: "foreground",
      details: null,
    });

    expect(repo.osEvents).toHaveLength(1);
    expect(repo.osEvents[0].category).toBe("lifecycle");
  });

  it("pushes all event types to socket", async () => {
    await recorder.recordNetworkEvent({
      timestamp: 1, applicationId: null, url: "u", method: "GET",
      statusCode: 200, durationMs: 0, requestBodySize: 0, responseBodySize: 0,
      protocol: null, host: null, path: null, error: null,
    });
    await recorder.recordLogEvent({
      timestamp: 2, applicationId: null, level: 4, tag: "t", message: "m", filterName: "f",
    });
    await recorder.recordCustomEvent({
      timestamp: 3, applicationId: null, name: "n", properties: {},
    });
    await recorder.recordOsEvent({
      timestamp: 4, applicationId: null, category: "c", kind: "k", details: null,
    });

    expect(pushTarget.pushedEvents).toHaveLength(4);
    expect(pushTarget.pushedEvents.map(e => e.category)).toEqual(["network", "log", "custom", "os"]);
  });

  it("still pushes to socket when repository throws", async () => {
    repo.shouldThrow = true;

    await recorder.recordNetworkEvent({
      timestamp: 1000, applicationId: null, url: "u", method: "GET",
      statusCode: 200, durationMs: 0, requestBodySize: 0, responseBodySize: 0,
      protocol: null, host: null, path: null, error: null,
    });

    expect(repo.networkEvents).toHaveLength(0);
    expect(pushTarget.pushedEvents).toHaveLength(1);
  });

  it("does not throw when push target is null", async () => {
    const recorderNoPush = new TelemetryRecorder(repo, () => null);

    await recorderNoPush.recordLogEvent({
      timestamp: 1000, applicationId: null, level: 4, tag: "t", message: "m", filterName: "f",
    });

    expect(repo.logEvents).toHaveLength(1);
  });

  it("setContext updates deviceId and sessionId for subsequent events", async () => {
    recorder.setContext("d1", "s1");
    await recorder.recordLogEvent({
      timestamp: 1, applicationId: null, level: 4, tag: "t", message: "m", filterName: "f",
    });

    recorder.setContext("d2", "s2");
    await recorder.recordLogEvent({
      timestamp: 2, applicationId: null, level: 4, tag: "t", message: "m", filterName: "f",
    });

    expect(repo.logEvents[0].deviceId).toBe("d1");
    expect(repo.logEvents[0].sessionId).toBe("s1");
    expect(repo.logEvents[1].deviceId).toBe("d2");
    expect(repo.logEvents[1].sessionId).toBe("s2");
  });

  it("getContext returns current context", () => {
    recorder.setContext("dev-1", "sess-1");
    const ctx = recorder.getContext();
    expect(ctx.deviceId).toBe("dev-1");
    expect(ctx.sessionId).toBe("sess-1");
  });

  it("getInstance returns singleton", () => {
    const a = TelemetryRecorder.getInstance();
    const b = TelemetryRecorder.getInstance();
    expect(a).toBe(b);
  });

  it("resetInstance clears singleton", () => {
    const a = TelemetryRecorder.getInstance();
    TelemetryRecorder.resetInstance();
    const b = TelemetryRecorder.getInstance();
    expect(a).not.toBe(b);
  });
});
