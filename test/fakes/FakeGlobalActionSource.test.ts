import { describe, it, expect } from "bun:test";
import { FakeGlobalActionSource } from "./FakeGlobalActionSource";

describe("FakeGlobalActionSource", () => {
  it("returns success by default", async () => {
    const fake = new FakeGlobalActionSource();
    const result = await fake.executeGlobalAction("home");
    expect(result.success).toBe(true);
    expect(result.action).toBe("home");
  });

  it("records calls", async () => {
    const fake = new FakeGlobalActionSource();
    await fake.executeGlobalAction("back", 3000);
    await fake.executeGlobalAction("home");
    expect(fake.getCallCount()).toBe(2);
    expect(fake.getCalls()).toEqual([
      { action: "back", timeoutMs: 3000 },
      { action: "home", timeoutMs: undefined },
    ]);
  });

  it("returns last action", async () => {
    const fake = new FakeGlobalActionSource();
    await fake.executeGlobalAction("back");
    await fake.executeGlobalAction("recent");
    expect(fake.getLastAction()).toBe("recent");
  });

  it("returns failure when configured", async () => {
    const fake = new FakeGlobalActionSource();
    fake.setShouldFail(true);
    const result = await fake.executeGlobalAction("home");
    expect(result.success).toBe(false);
    expect(result.error).toBe("Fake failure");
    expect(result.action).toBe("home");
  });

  it("resets recorded calls", async () => {
    const fake = new FakeGlobalActionSource();
    await fake.executeGlobalAction("back");
    fake.reset();
    expect(fake.getCallCount()).toBe(0);
    expect(fake.getLastAction()).toBeUndefined();
  });

  it("uses action from call, not from configured result", async () => {
    const fake = new FakeGlobalActionSource();
    fake.setResult({ success: true, action: "configured" });
    const result = await fake.executeGlobalAction("actual");
    expect(result.action).toBe("actual");
  });
});
