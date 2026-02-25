import { describe, test, expect, beforeEach } from "bun:test";
import { checkWorkProfileAccessibility } from "../../../src/doctor/checks/automobile";
import { FakeAdbExecutor } from "../../fakes/FakeAdbExecutor";
import type { BootedDevice, AndroidUser } from "../../../src/models";
import type { AdbClientFactory } from "../../../src/utils/android-cmdline-tools/AdbClientFactory";

describe("checkWorkProfileAccessibility", () => {
  let fakeAdb: FakeAdbExecutor;
  let fakeFactory: AdbClientFactory;

  beforeEach(() => {
    fakeAdb = new FakeAdbExecutor();
    fakeFactory = {
      create: () => fakeAdb
    };
  });

  test("returns skip when no devices connected", async () => {
    fakeAdb.setDevices([]);

    const result = await checkWorkProfileAccessibility(fakeFactory);

    expect(result.status).toBe("skip");
    expect(result.message).toBe("No Android devices connected");
  });

  test("returns pass when no work profiles exist", async () => {
    const device: BootedDevice = {
      name: "emulator-5554",
      platform: "android",
      deviceId: "emulator-5554"
    };
    fakeAdb.setDevices([device]);

    // Only primary user (userId 0, flags 0x13 = 19)
    const users: AndroidUser[] = [
      { userId: 0, name: "Owner", flags: 0x13, running: true }
    ];
    fakeAdb.setUsers(users);

    const result = await checkWorkProfileAccessibility(fakeFactory);

    expect(result.status).toBe("pass");
    expect(result.message).toBe("No work profiles detected");
  });

  test("returns pass when work profile has accessibility service enabled", async () => {
    const device: BootedDevice = {
      name: "emulator-5554",
      platform: "android",
      deviceId: "emulator-5554"
    };
    fakeAdb.setDevices([device]);

    // Primary user + work profile (userId 10, flags 0x30 = 48 includes FLAG_MANAGED_PROFILE)
    const users: AndroidUser[] = [
      { userId: 0, name: "Owner", flags: 0x13, running: true },
      { userId: 10, name: "Work profile", flags: 0x30, running: true }
    ];
    fakeAdb.setUsers(users);

    // Work profile has accessibility service enabled
    fakeAdb.setCommandResponse(
      "settings --user 10 get secure enabled_accessibility_services",
      {
        stdout: "dev.jasonpearson.automobile.ctrlproxy/dev.jasonpearson.automobile.ctrlproxy.CtrlProxy",
        stderr: "",
        toString: () => "dev.jasonpearson.automobile.ctrlproxy/dev.jasonpearson.automobile.ctrlproxy.CtrlProxy",
        trim: () => "dev.jasonpearson.automobile.ctrlproxy/dev.jasonpearson.automobile.ctrlproxy.CtrlProxy",
        includes: (s: string) => "dev.jasonpearson.automobile.ctrlproxy/dev.jasonpearson.automobile.ctrlproxy.CtrlProxy".includes(s)
      }
    );

    const result = await checkWorkProfileAccessibility(fakeFactory);

    expect(result.status).toBe("pass");
    expect(result.message).toBe("Accessibility service enabled for 1 work profile(s)");
  });

  test("returns warn when work profile is missing accessibility service", async () => {
    const device: BootedDevice = {
      name: "emulator-5554",
      platform: "android",
      deviceId: "emulator-5554"
    };
    fakeAdb.setDevices([device]);

    // Primary user + work profile
    const users: AndroidUser[] = [
      { userId: 0, name: "Owner", flags: 0x13, running: true },
      { userId: 10, name: "Work profile", flags: 0x30, running: true }
    ];
    fakeAdb.setUsers(users);

    // Work profile does NOT have accessibility service enabled
    fakeAdb.setCommandResponse(
      "settings --user 10 get secure enabled_accessibility_services",
      {
        stdout: "null",
        stderr: "",
        toString: () => "null",
        trim: () => "null",
        includes: (s: string) => "null".includes(s)
      }
    );

    const result = await checkWorkProfileAccessibility(fakeFactory);

    expect(result.status).toBe("warn");
    expect(result.message).toContain("Work profile (user 10)");
    expect(result.recommendation).toContain("accessibility service needs to be enabled");
  });

  test("does not warn for non-running work profiles", async () => {
    const device: BootedDevice = {
      name: "emulator-5554",
      platform: "android",
      deviceId: "emulator-5554"
    };
    fakeAdb.setDevices([device]);

    // Work profile exists but is not running
    const users: AndroidUser[] = [
      { userId: 0, name: "Owner", flags: 0x13, running: true },
      { userId: 10, name: "Work profile", flags: 0x30, running: false }
    ];
    fakeAdb.setUsers(users);

    const result = await checkWorkProfileAccessibility(fakeFactory);

    expect(result.status).toBe("pass");
    expect(result.message).toBe("No work profiles detected");
  });

  test("handles multiple work profiles with mixed accessibility status", async () => {
    const device: BootedDevice = {
      name: "emulator-5554",
      platform: "android",
      deviceId: "emulator-5554"
    };
    fakeAdb.setDevices([device]);

    // Two work profiles
    const users: AndroidUser[] = [
      { userId: 0, name: "Owner", flags: 0x13, running: true },
      { userId: 10, name: "Work profile 1", flags: 0x30, running: true },
      { userId: 11, name: "Work profile 2", flags: 0x30, running: true }
    ];
    fakeAdb.setUsers(users);

    // First work profile has service enabled
    fakeAdb.setCommandResponse(
      "settings --user 10 get secure enabled_accessibility_services",
      {
        stdout: "dev.jasonpearson.automobile.ctrlproxy/dev.jasonpearson.automobile.ctrlproxy.CtrlProxy",
        stderr: "",
        toString: () => "dev.jasonpearson.automobile.ctrlproxy/dev.jasonpearson.automobile.ctrlproxy.CtrlProxy",
        trim: () => "dev.jasonpearson.automobile.ctrlproxy/dev.jasonpearson.automobile.ctrlproxy.CtrlProxy",
        includes: (s: string) => "dev.jasonpearson.automobile.ctrlproxy/dev.jasonpearson.automobile.ctrlproxy.CtrlProxy".includes(s)
      }
    );

    // Second work profile does NOT have service enabled
    fakeAdb.setCommandResponse(
      "settings --user 11 get secure enabled_accessibility_services",
      {
        stdout: "",
        stderr: "",
        toString: () => "",
        trim: () => "",
        includes: (s: string) => "".includes(s)
      }
    );

    const result = await checkWorkProfileAccessibility(fakeFactory);

    expect(result.status).toBe("warn");
    expect(result.message).toContain("Work profile 2 (user 11)");
    expect(result.message).not.toContain("Work profile 1");
  });
});
