import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { XCTestServiceClient } from "../../../../src/features/observe/ios";
import { BootedDevice } from "../../../../src/models";
import {
  createInstantFailureWebSocketFactory,
  createSuccessWebSocketFactory,
} from "../../../fakes/FakeWebSocket";
import { FakeTimer } from "../../../fakes/FakeTimer";
import { FakeXCTestServiceManager } from "../../../fakes/FakeXCTestServiceManager";
import type { ServiceManagerFactory } from "../../../../src/features/observe/ios/XCTestServiceClient";

describe("XCTestServiceClient auto-setup", function() {
  let testDevice: BootedDevice;
  let fakeTimer: FakeTimer;
  let fakeManager: FakeXCTestServiceManager;
  const serverPort = 8765;

  beforeEach(function() {
    fakeTimer = new FakeTimer();
    fakeTimer.enableAutoAdvance();

    testDevice = {
      deviceId: "A1B2C3D4-E5F6-7890-ABCD-EF1234567890",
      platform: "ios",
      name: "iPhone 16 Simulator",
    };

    fakeManager = new FakeXCTestServiceManager();

    XCTestServiceClient.resetInstances();
  });

  afterEach(async function() {
    XCTestServiceClient.resetInstances();
  });

  const createManagerFactory = (): ServiceManagerFactory => {
    return () => fakeManager;
  };

  test("auto-setup triggered when WebSocket fails", async function() {
    const client = XCTestServiceClient.createForTesting(
      testDevice,
      serverPort,
      createInstantFailureWebSocketFactory(fakeTimer),
      fakeTimer,
      createManagerFactory()
    );

    await client.ensureConnected();

    expect(fakeManager.wasMethodCalled("setup:force=true")).toBe(true);

    await client.close();
  });

  test("connect succeeds after auto-setup starts service", async function() {
    let callCount = 0;
    const wsFactory = (url: string) => {
      callCount++;
      if (callCount <= 1) {
        // First call fails (before auto-setup)
        return createInstantFailureWebSocketFactory(fakeTimer)(url);
      }
      // After auto-setup, connection succeeds
      return createSuccessWebSocketFactory(fakeTimer)(url);
    };

    const client = XCTestServiceClient.createForTesting(
      testDevice,
      serverPort,
      wsFactory,
      fakeTimer,
      createManagerFactory()
    );

    const result = await client.ensureConnected();

    expect(result).toBe(true);
    expect(fakeManager.wasMethodCalled("setup:force=true")).toBe(true);

    await client.close();
  });

  test("no auto-setup when already connected", async function() {
    const client = XCTestServiceClient.createForTesting(
      testDevice,
      serverPort,
      createSuccessWebSocketFactory(fakeTimer),
      fakeTimer,
      createManagerFactory()
    );

    const result = await client.ensureConnected();

    expect(result).toBe(true);
    expect(fakeManager.wasMethodCalled("setup:force=true")).toBe(false);

    await client.close();
  });

  test("setup failure handled gracefully", async function() {
    fakeManager.setSetupShouldFail(true);

    const client = XCTestServiceClient.createForTesting(
      testDevice,
      serverPort,
      createInstantFailureWebSocketFactory(fakeTimer),
      fakeTimer,
      createManagerFactory()
    );

    const result = await client.ensureConnected();

    expect(result).toBe(false);
    expect(fakeManager.wasMethodCalled("setup:force=true")).toBe(true);

    await client.close();
  });

  test("guard prevents re-entry during auto-setup", async function() {
    // Create a manager where setup triggers another ensureConnected call
    let reentrantCallResult: boolean | null = null;
    // Use a ref object so the closure captures a mutable reference
    const clientRef: { current: XCTestServiceClient | null } = { current: null };

    const reentrantManager = new FakeXCTestServiceManager();
    const originalSetup = reentrantManager.setup.bind(reentrantManager);
    reentrantManager.setup = async (force, perf) => {
      // During setup, try calling ensureConnected again (simulates re-entry)
      reentrantCallResult = await clientRef.current!.ensureConnected();
      return originalSetup(force, perf);
    };

    const client = XCTestServiceClient.createForTesting(
      testDevice,
      serverPort,
      createInstantFailureWebSocketFactory(fakeTimer),
      fakeTimer,
      () => reentrantManager
    );
    clientRef.current = client;

    await client.ensureConnected();

    // The re-entrant call should have returned false immediately
    expect(reentrantCallResult).toBe(false);

    await client.close();
  });
});
