import { describe, it, expect } from "bun:test";
import { FakeDeviceMetadataSource } from "./FakeDeviceMetadataSource";
import type { DeviceMetadata } from "../../src/features/observe/interfaces/DeviceMetadataSource";

describe("FakeDeviceMetadataSource", () => {
  const sampleMetadata: DeviceMetadata = {
    screenWidth: 1080,
    screenHeight: 2400,
    density: 440,
    rotation: 0,
    sdkInt: 34,
    deviceModel: "Pixel 8",
    isEmulator: false,
    wakefulness: "Awake",
    foregroundActivity: "com.example.app/.MainActivity",
  };

  it("returns null by default", async () => {
    const fake = new FakeDeviceMetadataSource();
    expect(await fake.getDeviceMetadata()).toBeNull();
  });

  it("returns configured metadata", async () => {
    const fake = new FakeDeviceMetadataSource();
    fake.setMetadata(sampleMetadata);
    const result = await fake.getDeviceMetadata();
    expect(result).toEqual(sampleMetadata);
  });

  it("records call count", async () => {
    const fake = new FakeDeviceMetadataSource();
    expect(fake.getCallCount()).toBe(0);
    await fake.getDeviceMetadata();
    await fake.getDeviceMetadata();
    expect(fake.getCallCount()).toBe(2);
  });

  it("resets recorded calls", async () => {
    const fake = new FakeDeviceMetadataSource();
    await fake.getDeviceMetadata();
    fake.reset();
    expect(fake.getCallCount()).toBe(0);
  });

  it("can switch from null to metadata", async () => {
    const fake = new FakeDeviceMetadataSource();
    expect(await fake.getDeviceMetadata()).toBeNull();
    fake.setMetadata(sampleMetadata);
    expect(await fake.getDeviceMetadata()).toEqual(sampleMetadata);
  });

  it("can switch back to null", async () => {
    const fake = new FakeDeviceMetadataSource();
    fake.setMetadata(sampleMetadata);
    fake.setMetadata(null);
    expect(await fake.getDeviceMetadata()).toBeNull();
  });
});
