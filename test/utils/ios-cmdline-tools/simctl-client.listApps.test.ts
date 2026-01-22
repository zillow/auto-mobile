import { describe, expect, test } from "bun:test";
import { SimCtlClient } from "../../../src/utils/ios-cmdline-tools/SimCtlClient";
import { BootedDevice } from "../../../src/models";
import { createExecResult } from "../../../src/utils/execResult";

const createHostControlRunner = () => ({
  isAvailable: async () => false,
  isRunningInDocker: () => false,
  runSimctl: async () => {
    throw new Error("Host control should not be used in tests");
  },
  shouldUseHostControl: () => false
});

describe("SimCtlClient listApps", () => {
  test("uses --all to include system apps when supported", async () => {
    const device: BootedDevice = {
      deviceId: "ios-device-123",
      name: "iOS Device",
      platform: "ios",
      source: "local"
    };
    const execCalls: string[] = [];
    const execAsync = async (file: string, args: string[]) => {
      execCalls.push(`${file} ${args.join(" ")}`);
      if (args.join(" ") === "simctl --version") {
        return createExecResult("simctl version 1.0.0", "");
      }
      if (args.join(" ") === "simctl listapps ios-device-123 --all") {
        const payload = JSON.stringify({
          "com.apple.Preferences": { bundleName: "Settings" }
        });
        return createExecResult(payload, "");
      }
      return createExecResult("{}", "");
    };

    const simctl = new SimCtlClient(device, execAsync, createHostControlRunner());
    const apps = await simctl.listApps();

    expect(execCalls).toContain("xcrun simctl listapps ios-device-123 --all");
    expect(apps).toEqual([{ bundleId: "com.apple.Preferences", bundleName: "Settings" }]);
  });

  test("falls back to default listapps when --all is unsupported", async () => {
    const device: BootedDevice = {
      deviceId: "ios-device-456",
      name: "iOS Device",
      platform: "ios",
      source: "local"
    };
    const execCalls: string[] = [];
    const execAsync = async (file: string, args: string[]) => {
      execCalls.push(`${file} ${args.join(" ")}`);
      if (args.join(" ") === "simctl --version") {
        return createExecResult("simctl version 1.0.0", "");
      }
      if (args.join(" ") === "simctl listapps ios-device-456 --all") {
        throw new Error("unknown option: --all");
      }
      if (args.join(" ") === "simctl listapps ios-device-456") {
        const payload = JSON.stringify({
          "com.apple.Fitness": { bundleName: "Fitness" }
        });
        return createExecResult(payload, "");
      }
      return createExecResult("{}", "");
    };

    const simctl = new SimCtlClient(device, execAsync, createHostControlRunner());
    const apps = await simctl.listApps();

    expect(execCalls).toContain("xcrun simctl listapps ios-device-456 --all");
    expect(execCalls).toContain("xcrun simctl listapps ios-device-456");
    expect(apps).toEqual([{ bundleId: "com.apple.Fitness", bundleName: "Fitness" }]);
  });
});
