import { expect, describe, test, beforeEach } from "bun:test";
import { DemoMode } from "../../../src/features/utility/DemoMode";
import { FakeSimctl } from "../../fakes/FakeSimctl";
import { BootedDevice } from "../../../src/models";

describe("DemoMode (iOS)", function() {
  let device: BootedDevice;
  let simctl: FakeSimctl;

  beforeEach(function() {
    device = {
      deviceId: "ios-sim-1",
      name: "iPhone Simulator",
      platform: "ios",
      source: "local"
    };

    simctl = new FakeSimctl();
    simctl.setIsAvailable(true);
    simctl.setDeviceInfo(device.deviceId, {
      udid: device.deviceId,
      name: device.name,
      state: "Booted",
      isAvailable: true
    });
  });

  test("should apply status bar overrides via simctl", async function() {
    const demoMode = new DemoMode(device, null, simctl);
    const result = await demoMode.execute({
      time: "0930",
      batteryLevel: 80,
      batteryPlugged: true,
      wifiLevel: 2,
      mobileDataType: "lte",
      mobileSignalLevel: 3
    });

    expect(result.success).toBe(true);

    const calls = simctl.getMethodCalls("executeCommand");
    expect(calls).toHaveLength(1);

    const command = String(calls[0].command);
    expect(command).toContain(`status_bar ${device.deviceId} override`);
    expect(command).toContain("--time 09:30");
    expect(command).toContain("--batteryLevel 80");
    expect(command).toContain("--batteryState charging");
    expect(command).toContain("--wifiMode active");
    expect(command).toContain("--wifiBars 2");
    expect(command).toContain("--cellularMode active");
    expect(command).toContain("--cellularBars 3");
    expect(command).toContain("--dataNetwork lte");
  });

  test("should clear status bar overrides via simctl", async function() {
    const demoMode = new DemoMode(device, null, simctl);
    const result = await demoMode.exitDemoMode();

    expect(result.success).toBe(true);

    const calls = simctl.getMethodCalls("executeCommand");
    expect(calls).toHaveLength(1);
    expect(String(calls[0].command)).toBe(`status_bar ${device.deviceId} clear`);
  });

  test("should return failure when simctl is unavailable", async function() {
    simctl.setIsAvailable(false);

    const demoMode = new DemoMode(device, null, simctl);
    const result = await demoMode.execute();

    expect(result.success).toBe(false);
    expect(result.error).toContain("simctl is not available");
    expect(simctl.getMethodCalls("executeCommand")).toHaveLength(0);
  });
});
