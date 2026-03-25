import { describe, expect, test, beforeEach } from "bun:test";
import { SystemConfigurationManager } from "../../../src/features/utility/SystemConfigurationManager";
import { FakeAdbClientFactory } from "../../fakes/FakeAdbClientFactory";
import { FakeAdbClient } from "../../fakes/FakeAdbClient";
import { FakeProcessExecutor } from "../../fakes/FakeProcessExecutor";
import type { BootedDevice, ExecResult } from "../../../src/models";

const IOS_SIMULATOR: BootedDevice = {
  deviceId: "A1B2C3D4-E5F6-7890-ABCD-EF1234567890",
  name: "iPhone 15 Pro",
  platform: "ios"
};

const IOS_PHYSICAL: BootedDevice = {
  deviceId: "00008130-001234567890abcd",
  name: "iPhone 15 Pro",
  platform: "ios"
};

const ANDROID_DEVICE: BootedDevice = {
  deviceId: "emulator-5554",
  name: "Pixel 7",
  platform: "android"
};

function execResult(stdout: string, stderr = ""): ExecResult {
  return {
    stdout,
    stderr,
    toString: () => stdout,
    trim: () => stdout.trim(),
    includes: (s: string) => stdout.includes(s)
  };
}

describe("SystemConfigurationManager", () => {
  let fakeAdbClient: FakeAdbClient;
  let fakeAdbFactory: FakeAdbClientFactory;
  let fakeExec: FakeProcessExecutor;

  beforeEach(() => {
    fakeAdbClient = new FakeAdbClient();
    fakeAdbFactory = new FakeAdbClientFactory(fakeAdbClient);
    fakeExec = new FakeProcessExecutor();
  });

  // --- iOS Simulator: setLocale ---

  describe("iOS simulator setLocale", () => {
    test("writes AppleLocale via defaults write", async () => {
      fakeExec.setDefaultResponse(execResult(""));
      const mgr = new SystemConfigurationManager(IOS_SIMULATOR, fakeAdbFactory, fakeExec);
      const result = await mgr.setLocale("ja-JP");

      expect(result.success).toBe(true);
      expect(result.languageTag).toBe("ja-JP");
      expect(result.method).toBe("defaults write AppleLocale");
      expect(
        fakeExec.wasCommandExecuted(
          `xcrun simctl spawn ${IOS_SIMULATOR.deviceId} defaults write .GlobalPreferences AppleLocale ja_JP`
        )
      ).toBe(true);
    });

    test("converts BCP-47 hyphens to underscores for Apple format", async () => {
      fakeExec.setDefaultResponse(execResult(""));
      const mgr = new SystemConfigurationManager(IOS_SIMULATOR, fakeAdbFactory, fakeExec);
      await mgr.setLocale("en-US");

      expect(
        fakeExec.wasCommandExecuted("AppleLocale en_US")
      ).toBe(true);
    });

    test("reads previous locale before writing", async () => {
      fakeExec.setCommandResponse("defaults read .GlobalPreferences AppleLocale", execResult("en_US\n"));
      const mgr = new SystemConfigurationManager(IOS_SIMULATOR, fakeAdbFactory, fakeExec);
      const result = await mgr.setLocale("ja-JP");

      expect(result.success).toBe(true);
      expect(result.previousLanguageTag).toBe("en_US");
    });

    test("returns error for empty languageTag", async () => {
      const mgr = new SystemConfigurationManager(IOS_SIMULATOR, fakeAdbFactory, fakeExec);
      const result = await mgr.setLocale("  ");

      expect(result.success).toBe(false);
      expect(result.error).toBe("languageTag must be a non-empty string");
    });

    test("returns error for physical iOS device", async () => {
      const mgr = new SystemConfigurationManager(IOS_PHYSICAL, fakeAdbFactory, fakeExec);
      const result = await mgr.setLocale("ja-JP");

      expect(result.success).toBe(false);
      expect(result.error).toBe("Localization changes are only supported on iOS Simulator.");
      expect(fakeExec.getExecutedCommands()).toHaveLength(0);
    });

    test("returns error when defaults write fails", async () => {
      fakeExec.setCommandResponse("defaults read", execResult(""));
      fakeExec.setCommandResponse("defaults write", execResult("", "error"));
      // Override to throw
      const originalExec = fakeExec.exec.bind(fakeExec);
      fakeExec.exec = async (command, options) => {
        if (command.includes("defaults write .GlobalPreferences AppleLocale")) {
          throw new Error("simctl failed");
        }
        return originalExec(command, options);
      };

      const mgr = new SystemConfigurationManager(IOS_SIMULATOR, fakeAdbFactory, fakeExec);
      const result = await mgr.setLocale("ja-JP");

      expect(result.success).toBe(false);
      expect(result.error).toContain("Failed to set locale");
    });
  });

  // --- iOS Simulator: setTimeZone ---

  describe("iOS simulator setTimeZone", () => {
    test("disables auto-timezone then writes AppleTimeZone", async () => {
      fakeExec.setDefaultResponse(execResult(""));
      const mgr = new SystemConfigurationManager(IOS_SIMULATOR, fakeAdbFactory, fakeExec);
      const result = await mgr.setTimeZone("Asia/Tokyo");

      expect(result.success).toBe(true);
      expect(result.zoneId).toBe("Asia/Tokyo");

      const commands = fakeExec.getExecutedCommands();
      const autoTzIndex = commands.findIndex(c => c.includes("AutomaticTimeZoneSetting"));
      const writeIndex = commands.findIndex(c => c.includes("AppleTimeZone") && c.includes("defaults write"));
      expect(autoTzIndex).toBeGreaterThanOrEqual(0);
      expect(writeIndex).toBeGreaterThan(autoTzIndex);
    });

    test("disables auto-timezone with correct command", async () => {
      fakeExec.setDefaultResponse(execResult(""));
      const mgr = new SystemConfigurationManager(IOS_SIMULATOR, fakeAdbFactory, fakeExec);
      await mgr.setTimeZone("America/New_York");

      expect(
        fakeExec.wasCommandExecuted(
          `xcrun simctl spawn ${IOS_SIMULATOR.deviceId} defaults write com.apple.mobiletimerd AutomaticTimeZoneSetting -bool NO`
        )
      ).toBe(true);
    });

    test("reads previous timezone before writing", async () => {
      fakeExec.setCommandResponse("defaults read .GlobalPreferences AppleTimeZone", execResult("America/Los_Angeles\n"));
      const mgr = new SystemConfigurationManager(IOS_SIMULATOR, fakeAdbFactory, fakeExec);
      const result = await mgr.setTimeZone("Asia/Tokyo");

      expect(result.success).toBe(true);
      expect(result.previousZoneId).toBe("America/Los_Angeles");
    });

    test("returns error for empty zoneId", async () => {
      const mgr = new SystemConfigurationManager(IOS_SIMULATOR, fakeAdbFactory, fakeExec);
      const result = await mgr.setTimeZone("  ");

      expect(result.success).toBe(false);
      expect(result.error).toBe("zoneId must be a non-empty string");
    });

    test("returns error for physical iOS device", async () => {
      const mgr = new SystemConfigurationManager(IOS_PHYSICAL, fakeAdbFactory, fakeExec);
      const result = await mgr.setTimeZone("Asia/Tokyo");

      expect(result.success).toBe(false);
      expect(result.error).toBe("Localization changes are only supported on iOS Simulator.");
    });
  });

  // --- iOS Simulator: set24HourFormat ---

  describe("iOS simulator set24HourFormat", () => {
    test("writes AppleICUForce24HourTime YES for 24h", async () => {
      fakeExec.setDefaultResponse(execResult(""));
      const mgr = new SystemConfigurationManager(IOS_SIMULATOR, fakeAdbFactory, fakeExec);
      const result = await mgr.set24HourFormat(true);

      expect(result.success).toBe(true);
      expect(result.enabled).toBe(true);
      expect(
        fakeExec.wasCommandExecuted(
          `xcrun simctl spawn ${IOS_SIMULATOR.deviceId} defaults write .GlobalPreferences AppleICUForce24HourTime -bool YES`
        )
      ).toBe(true);
    });

    test("writes AppleICUForce24HourTime NO for 12h", async () => {
      fakeExec.setDefaultResponse(execResult(""));
      const mgr = new SystemConfigurationManager(IOS_SIMULATOR, fakeAdbFactory, fakeExec);
      const result = await mgr.set24HourFormat(false);

      expect(result.success).toBe(true);
      expect(result.enabled).toBe(false);
      expect(
        fakeExec.wasCommandExecuted("AppleICUForce24HourTime -bool NO")
      ).toBe(true);
    });

    test("reads previous format before writing", async () => {
      fakeExec.setCommandResponse("defaults read .GlobalPreferences AppleICUForce24HourTime", execResult("1\n"));
      const mgr = new SystemConfigurationManager(IOS_SIMULATOR, fakeAdbFactory, fakeExec);
      const result = await mgr.set24HourFormat(false);

      expect(result.success).toBe(true);
      expect(result.previousFormat).toBe("24");
    });

    test("returns error for physical iOS device", async () => {
      const mgr = new SystemConfigurationManager(IOS_PHYSICAL, fakeAdbFactory, fakeExec);
      const result = await mgr.set24HourFormat(true);

      expect(result.success).toBe(false);
      expect(result.error).toBe("Localization changes are only supported on iOS Simulator.");
    });
  });

  // --- iOS Simulator: setTextDirection ---

  describe("iOS simulator setTextDirection", () => {
    test("returns unsupported error for iOS", async () => {
      const mgr = new SystemConfigurationManager(IOS_SIMULATOR, fakeAdbFactory, fakeExec);
      const result = await mgr.setTextDirection(true);

      expect(result.success).toBe(false);
      expect(result.error).toContain("Text direction is not supported on iOS");
      expect(fakeExec.getExecutedCommands()).toHaveLength(0);
    });
  });

  // --- iOS Simulator: getLocalizationSettings ---

  describe("iOS simulator getLocalizationSettings", () => {
    test("reads all settings via defaults read", async () => {
      fakeExec.setCommandResponse("defaults read .GlobalPreferences AppleLocale", execResult("ja_JP\n"));
      fakeExec.setCommandResponse("defaults read .GlobalPreferences AppleTimeZone", execResult("Asia/Tokyo\n"));
      fakeExec.setCommandResponse("defaults read .GlobalPreferences AppleICUForce24HourTime", execResult("1\n"));
      const mgr = new SystemConfigurationManager(IOS_SIMULATOR, fakeAdbFactory, fakeExec);
      const result = await mgr.getLocalizationSettings();

      expect(result.success).toBe(true);
      expect(result.locale).toBe("ja_JP");
      expect(result.timeZone).toBe("Asia/Tokyo");
      expect(result.timeFormat).toBe("24");
      expect(result.textDirection).toBeNull();
    });

    test("returns error for physical iOS device", async () => {
      const mgr = new SystemConfigurationManager(IOS_PHYSICAL, fakeAdbFactory, fakeExec);
      const result = await mgr.getLocalizationSettings();

      expect(result.success).toBe(false);
      expect(result.error).toBe("Localization changes are only supported on iOS Simulator.");
    });

    test("handles missing values gracefully", async () => {
      fakeExec.setDefaultResponse(execResult(""));
      const mgr = new SystemConfigurationManager(IOS_SIMULATOR, fakeAdbFactory, fakeExec);
      const result = await mgr.getLocalizationSettings();

      expect(result.success).toBe(true);
      expect(result.locale).toBeNull();
      expect(result.timeZone).toBeNull();
      expect(result.timeFormat).toBeNull();
    });
  });

  // --- iOS Simulator: getCalendarSystem ---

  describe("iOS simulator getCalendarSystem", () => {
    test("reads AppleCalendar when available", async () => {
      fakeExec.setCommandResponse("defaults read .GlobalPreferences AppleCalendar", execResult("japanese\n"));
      const mgr = new SystemConfigurationManager(IOS_SIMULATOR, fakeAdbFactory, fakeExec);
      const result = await mgr.getCalendarSystem();

      expect(result.success).toBe(true);
      expect(result.calendarSystem).toBe("japanese");
    });

    test("falls back to default calendar system", async () => {
      fakeExec.setDefaultResponse(execResult(""));
      const mgr = new SystemConfigurationManager(IOS_SIMULATOR, fakeAdbFactory, fakeExec);
      const result = await mgr.getCalendarSystem();

      expect(result.success).toBe(true);
      expect(result.calendarSystem).toBe("gregory");
      expect(result.source).toBe("default");
    });

    test("returns error for physical iOS device", async () => {
      const mgr = new SystemConfigurationManager(IOS_PHYSICAL, fakeAdbFactory, fakeExec);
      const result = await mgr.getCalendarSystem();

      expect(result.success).toBe(false);
      expect(result.error).toBe("Localization changes are only supported on iOS Simulator.");
    });
  });

  // --- Android: existing behavior unchanged ---

  describe("Android setLocale still works", () => {
    test("uses adb commands for Android", async () => {
      fakeAdbClient.setCommandResult("shell getprop ro.build.version.sdk", "33");
      const mgr = new SystemConfigurationManager(ANDROID_DEVICE, fakeAdbFactory, fakeExec);
      const result = await mgr.setLocale("en-US");

      expect(result.success).toBe(true);
      expect(fakeExec.getExecutedCommands()).toHaveLength(0);
      expect(fakeAdbClient.wasCommandExecuted("cmd locale set-locales en-US")).toBe(true);
    });
  });

  describe("Android setTimeZone still works", () => {
    test("uses adb commands for Android", async () => {
      const mgr = new SystemConfigurationManager(ANDROID_DEVICE, fakeAdbFactory, fakeExec);
      const result = await mgr.setTimeZone("America/New_York");

      expect(result.success).toBe(true);
      expect(fakeExec.getExecutedCommands()).toHaveLength(0);
      expect(fakeAdbClient.wasCommandExecuted("setprop persist.sys.timezone America/New_York")).toBe(true);
    });
  });
});
