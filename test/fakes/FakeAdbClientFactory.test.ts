import { describe, it, expect, beforeEach } from "bun:test";
import { FakeAdbClientFactory } from "./FakeAdbClientFactory";
import { FakeAdbClient } from "./FakeAdbClient";
import type { BootedDevice } from "../../src/models";

describe("FakeAdbClientFactory", () => {
  let factory: FakeAdbClientFactory;

  const testDevice: BootedDevice = {
    deviceId: "emulator-5554",
    name: "Pixel_6_API_34",
    platform: "android",
  };

  beforeEach(() => {
    factory = new FakeAdbClientFactory();
  });

  describe("create", () => {
    it("returns the shared FakeAdbClient by default", () => {
      const client1 = factory.create(testDevice);
      const client2 = factory.create(testDevice);

      expect(client1).toBe(client2);
      expect(client1).toBe(factory.getFakeClient());
    });

    it("records all create() calls", () => {
      factory.create(testDevice);
      factory.create(null);
      factory.create();

      const calls = factory.getCalls();
      expect(calls).toHaveLength(3);
      expect(calls[0].device).toEqual(testDevice);
      expect(calls[1].device).toBeNull();
      expect(calls[2].device).toBeNull();
    });
  });

  describe("useSeparateClientsPerDevice", () => {
    it("returns different clients for different devices", () => {
      factory.useSeparateClientsPerDevice();

      const device2: BootedDevice = {
        deviceId: "emulator-5556",
        name: "Pixel_7_API_34",
        platform: "android",
      };

      const client1 = factory.create(testDevice);
      const client2 = factory.create(device2);

      expect(client1).not.toBe(client2);
    });

    it("returns the same client for the same device", () => {
      factory.useSeparateClientsPerDevice();

      const client1 = factory.create(testDevice);
      const client2 = factory.create(testDevice);

      expect(client1).toBe(client2);
    });
  });

  describe("wasCalledForDevice", () => {
    it("returns true if device was used", () => {
      factory.create(testDevice);

      expect(factory.wasCalledForDevice("emulator-5554")).toBe(true);
      expect(factory.wasCalledForDevice("emulator-5556")).toBe(false);
    });
  });

  describe("with custom FakeAdbClient", () => {
    it("uses the provided fake client", () => {
      const customFake = new FakeAdbClient();
      factory = new FakeAdbClientFactory(customFake);

      const client = factory.create(testDevice);
      expect(client).toBe(customFake);
    });
  });

  describe("reset", () => {
    it("clears all state", () => {
      factory.create(testDevice);
      factory.useSeparateClientsPerDevice();
      factory.create(testDevice);

      factory.reset();

      expect(factory.getCalls()).toHaveLength(0);
      expect(factory.getCallCount()).toBe(0);
    });
  });
});

describe("FakeAdbClientFactory integration", () => {
  it("can be used to test code that creates ADB clients", async () => {
    // Example: Testing code that needs ADB functionality
    const factory = new FakeAdbClientFactory();
    const fakeClient = factory.getFakeClient();

    // Configure the fake to return expected results
    fakeClient.setCommandResult(
      "shell dumpsys meminfo com.example",
      "Java Heap: 50000\nNative Heap: 30000\nTOTAL: 100000"
    );

    // Create a client through the factory
    const client = factory.create({
      deviceId: "test-device",
      name: "Test Device",
      platform: "android",
    });

    // Execute command through the client
    const result = await client.executeCommand("shell dumpsys meminfo com.example");

    expect(result.stdout).toContain("Java Heap");
    expect(factory.getCallCount()).toBe(1);
  });
});
