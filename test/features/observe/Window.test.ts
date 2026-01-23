import { beforeEach, describe, expect, test } from "bun:test";
import { Window } from "../../../src/features/observe/Window";
import { FakeAdbExecutor } from "../../fakes/FakeAdbExecutor";
import { ExecResult } from "../../../src/models/ExecResult";
import { BootedDevice } from "../../../src/models/DeviceInfo";
import fs from "fs";
import path from "path";

describe("Window", () => {
  let window: Window;
  let fakeAdb: FakeAdbExecutor;
  let mockDevice: BootedDevice;

  beforeEach(() => {
    mockDevice = {
      deviceId: "test-device",
      name: "Test Device",
      platform: "android"
    };
    fakeAdb = new FakeAdbExecutor();
    window = new Window(mockDevice, fakeAdb as any);
    // Clear cache before each test to prevent stale results
    window.clearCache();
  });

  describe("constructor", () => {
    test("should create instance with provided deviceId and adb", () => {
      const mockDevice: BootedDevice = {
        deviceId: "test-device",
        name: "Test Device",
        platform: "android"
      };
      const customAdb = new FakeAdbExecutor();
      const windowInstance = new Window(mockDevice, customAdb as any);
      expect(windowInstance).toBeInstanceOf(Window);
    });

    test("should create instance with default values when no parameters provided", () => {
      const mockDevice: BootedDevice = {
        deviceId: "default-device",
        name: "Default Device",
        platform: "android"
      };
      // Pass FakeAdbExecutor to avoid creating real AdbClient
      const defaultFakeAdb = new FakeAdbExecutor();
      const windowInstance = new Window(mockDevice, defaultFakeAdb as any);
      expect(windowInstance).toBeInstanceOf(Window);
    });
  });

  describe("getActive", () => {
    test("should parse package name and activity name correctly", async () => {
      const dumpsysOutput = `
        imeControlTarget in display# 0 Window{12345678 u0 com.example.app/com.example.app.MainActivity}
        mLayoutSeq=123
      `;

      fakeAdb.setDefaultResponse({
        stdout: dumpsysOutput,
        stderr: "",
        toString: () => dumpsysOutput,
        trim: () => dumpsysOutput.trim(),
        includes: (str: string) => dumpsysOutput.includes(str)
      } as ExecResult);

      const result = await window.getActive(true);

      expect(result.appId).toBe("com.example.app");
      expect(result.activityName).toBe("com.example.app.MainActivity");
      expect(result.layoutSeqSum).toBe(123);
    });

    test("should handle activity names with special characters", async () => {
      const dumpsysOutput = `
        imeControlTarget in display# 0 Window{abc123 u0 com.example-app/com.example.app.MainActivity$Inner}
        mLayoutSeq=321
      `;

      fakeAdb.setDefaultResponse({
        stdout: dumpsysOutput,
        stderr: "",
        toString: () => dumpsysOutput,
        trim: () => dumpsysOutput.trim(),
        includes: (str: string) => dumpsysOutput.includes(str)
      } as ExecResult);

      const result = await window.getActive(true);

      expect(result.appId).toBe("com.example-app");
      expect(result.activityName).toBe("com.example.app.MainActivity$Inner");
      expect(result.layoutSeqSum).toBe(321);
    });

    test("should handle multiple layout sequence values", async () => {
      const dumpsysOutput = `
        imeControlTarget in display# 0 Window{12345678 u0 com.test.app/com.test.MainActivity}
        mLayoutSeq=123
        mLayoutSeq=456
        mLayoutSeq=789
      `;

      fakeAdb.setDefaultResponse({
        stdout: dumpsysOutput,
        stderr: "",
        toString: () => dumpsysOutput,
        trim: () => dumpsysOutput.trim(),
        includes: (str: string) => dumpsysOutput.includes(str)
      } as ExecResult);

      const result = await window.getActive(true);

      expect(result.appId).toBe("com.test.app");
      expect(result.activityName).toBe("com.test.MainActivity");
      expect(result.layoutSeqSum).toBe(1368); // 123 + 456 + 789
    });

    test("should handle missing window info and return default values", async () => {
      const dumpsysOutput = `
        Some other output without window info
        mLayoutSeq=100
      `;

      fakeAdb.setDefaultResponse({
        stdout: dumpsysOutput,
        stderr: "",
        toString: () => dumpsysOutput,
        trim: () => dumpsysOutput.trim(),
        includes: (str: string) => dumpsysOutput.includes(str)
      } as ExecResult);

      const result = await window.getActive(true);

      expect(result.appId).toBe("");
      expect(result.activityName).toBe("");
      expect(result.layoutSeqSum).toBe(100);
    });

    test("should handle missing layout sequence and return zero", async () => {
      const dumpsysOutput = `
        imeControlTarget in display# 0 Window{12345678 u0 com.example.app/com.example.app.MainActivity}
        Some other content without mLayoutSeq
      `;

      fakeAdb.setDefaultResponse({
        stdout: dumpsysOutput,
        stderr: "",
        toString: () => dumpsysOutput,
        trim: () => dumpsysOutput.trim(),
        includes: (str: string) => dumpsysOutput.includes(str)
      } as ExecResult);

      const result = await window.getActive(true);

      expect(result.appId).toBe("com.example.app");
      expect(result.activityName).toBe("com.example.app.MainActivity");
      expect(result.layoutSeqSum).toBe(0);
    });

    test("should handle non-numeric layout sequence values", async () => {
      const dumpsysOutput = `
        imeControlTarget in display# 0 Window{12345678 u0 com.example.app/com.example.app.MainActivity}
        mLayoutSeq=abc
        mLayoutSeq=123
        mLayoutSeq=def
        mLayoutSeq=456
      `;

      fakeAdb.setDefaultResponse({
        stdout: dumpsysOutput,
        stderr: "",
        toString: () => dumpsysOutput,
        trim: () => dumpsysOutput.trim(),
        includes: (str: string) => dumpsysOutput.includes(str)
      } as ExecResult);

      const result = await window.getActive(true);

      expect(result.appId).toBe("com.example.app");
      expect(result.activityName).toBe("com.example.app.MainActivity");
      expect(result.layoutSeqSum).toBe(579); // 123 + 456 (ignores non-numeric values)
    });

    test("should handle adb command failure gracefully", async () => {
      // Create a custom fake that throws an error
      const errorFakeAdb = new (class extends FakeAdbExecutor {
        async executeCommand(): Promise<ExecResult> {
          throw new Error("ADB command failed");
        }
      })();
      const windowWithError = new Window(mockDevice, errorFakeAdb as any);

      const result = await windowWithError.getActive(true);

      expect(result.appId).toBe("");
      expect(result.activityName).toBe("");
      expect(result.layoutSeqSum).toBe(0);
    });

    test("should handle empty dumpsys output", async () => {
      fakeAdb.setDefaultResponse({
        stdout: "",
        stderr: "",
        toString: () => "",
        trim: () => "",
        includes: (str: string) => false
      } as ExecResult);

      const result = await window.getActive(true);

      expect(result.appId).toBe("");
      expect(result.activityName).toBe("");
      expect(result.layoutSeqSum).toBe(0);
    });

    test("should parse Pop-Up Window and extract activity from mActivityRecord", async () => {
      // Read the actual dumpsys output with Pop-Up Window
      const dumpsysOutput = fs.readFileSync(
        path.join(__dirname, "windowDumps", "active-window-with-popup.log"),
        "utf8"
      );

      fakeAdb.setDefaultResponse({
        stdout: dumpsysOutput,
        stderr: "",
        toString: () => dumpsysOutput,
        trim: () => dumpsysOutput.trim(),
        includes: (str: string) => dumpsysOutput.includes(str)
      } as ExecResult);

      const result = await window.getActive(true);

      // Should extract the package and activity from the mActivityRecord line within the Pop-Up Window block
      expect(result.appId).toBe("dev.jasonpearson.automobile.playground");
      expect(result.activityName).toBe("dev.jasonpearson.android.appshell.MainTabActivity");
      expect(result.layoutSeqSum).toBeGreaterThan(0);
    });

    test("should handle Pop-Up Window when imeControlTarget doesn't have package/activity format", async () => {
      const dumpsysOutput = `
        imeLayeringTarget in display# 0 Window{ddf8489 u0 Pop-Up Window}
        imeInputTarget in display# 0 Window{ddf8489 u0 Pop-Up Window}
        imeControlTarget in display# 0 Window{ddf8489 u0 Pop-Up Window}

        Window #9 Window{ddf8489 u0 Pop-Up Window}:
          mDisplayId=0 rootTaskId=8 mSession=Session{8b3234c 4199:u0a10207}
          mOwnerUid=10207 showForAllUsers=false package=dev.jasonpearson.automobile.playground appop=NONE
          mActivityRecord=ActivityRecord{5cd319f u0 dev.jasonpearson.automobile.playground/dev.jasonpearson.android.appshell.MainTabActivity t8}
          mViewVisibility=0x0 mHaveFrame=true mObscured=false

        Window #10 Window{10634fe u0 dev.jasonpearson.automobile.playground/dev.jasonpearson.android.appshell.MainTabActivity}:
          mDisplayId=0 rootTaskId=8
          mLayoutSeq=258
      `;

      fakeAdb.setDefaultResponse({
        stdout: dumpsysOutput,
        stderr: "",
        toString: () => dumpsysOutput,
        trim: () => dumpsysOutput.trim(),
        includes: (str: string) => dumpsysOutput.includes(str)
      } as ExecResult);

      const result = await window.getActive(true);

      expect(result.appId).toBe("dev.jasonpearson.automobile.playground");
      expect(result.activityName).toBe("dev.jasonpearson.android.appshell.MainTabActivity");
      expect(result.layoutSeqSum).toBe(258);
    });

    test("should fall back to visible app windows when Pop-Up Window parsing fails", async () => {
      const dumpsysOutput = `
        imeControlTarget in display# 0 Window{ddf8489 u0 Pop-Up Window}

        Window #9 Window{ddf8489 u0 Pop-Up Window}:
          mDisplayId=0 rootTaskId=8
          // No mActivityRecord line
          mViewVisibility=0x0 mHaveFrame=true

        Window #10 Window{10634fe u0 com.example.testapp/com.example.MainActivity}:
          mDisplayId=0 rootTaskId=8
          mViewVisibility=0x0 mHaveFrame=true mObscured=false
          isOnScreen=true
          isVisible=true
          mLayoutSeq=123
      `;

      fakeAdb.setDefaultResponse({
        stdout: dumpsysOutput,
        stderr: "",
        toString: () => dumpsysOutput,
        trim: () => dumpsysOutput.trim(),
        includes: (str: string) => dumpsysOutput.includes(str)
      } as ExecResult);

      const result = await window.getActive(true);

      expect(result.appId).toBe("com.example.testapp");
      expect(result.activityName).toBe("com.example.MainActivity");
      expect(result.layoutSeqSum).toBe(123);
    });

    test("should fall back to BASE_APPLICATION pattern when other methods fail", async () => {
      const dumpsysOutput = `
        imeControlTarget in display# 0 Window{ddf8489 u0 Pop-Up Window}

        Window #9 Window{ddf8489 u0 Pop-Up Window}:
          mDisplayId=0 rootTaskId=8
          // No mActivityRecord line
          mViewVisibility=0x0 mHaveFrame=true

        Window #10 Window{10634fe u0 com.example.testapp/com.example.MainActivity}:
          mDisplayId=0 rootTaskId=8
          ty=BASE_APPLICATION
          mLayoutSeq=456
      `;

      fakeAdb.setDefaultResponse({
        stdout: dumpsysOutput,
        stderr: "",
        toString: () => dumpsysOutput,
        trim: () => dumpsysOutput.trim(),
        includes: (str: string) => dumpsysOutput.includes(str)
      } as ExecResult);

      const result = await window.getActive(true);

      expect(result.appId).toBe("com.example.testapp");
      expect(result.activityName).toBe("com.example.MainActivity");
      expect(result.layoutSeqSum).toBe(456);
    });
  });

  describe("getActiveHash", () => {
    test("should generate different hashes for different window states", async () => {
      // First UI state with one visible window
      const firstState = `
        Window #1 Window{a1b2c3 statusBar} isVisible=true
        Window #2 Window{d4e5f6 mainActivity} isVisible=true
        mLayoutSeq=123
      `;

      // Second UI state with an additional popup window
      const secondState = `
        Window #1 Window{a1b2c3 statusBar} isVisible=true
        Window #2 Window{d4e5f6 mainActivity} isVisible=true
        Window #3 Window{g7h8i9 popupWindow} isVisible=true
        mLayoutSeq=124
      `;

      // Get hash for first state
      fakeAdb.setDefaultResponse({
        stdout: firstState,
        stderr: "",
        toString: () => firstState,
        trim: () => firstState.trim(),
        includes: (str: string) => firstState.includes(str)
      } as ExecResult);
      const firstHash = await window.getActiveHash();

      // Reset fake and set up for second state
      fakeAdb.clearHistory();
      fakeAdb.setDefaultResponse({
        stdout: secondState,
        stderr: "",
        toString: () => secondState,
        trim: () => secondState.trim(),
        includes: (str: string) => secondState.includes(str)
      } as ExecResult);
      const secondHash = await window.getActiveHash();

      // Verify that the hashes are different
      expect(firstHash).not.toBe(secondHash);
    });

    test("should generate the same hash for the same window state", async () => {
      // Same UI state returned twice
      const uiState = `
        Window #1 Window{a1b2c3 statusBar} isVisible=true
        Window #2 Window{d4e5f6 mainActivity} isVisible=true
        mLayoutSeq=123
      `;

      // Set up fake to return the same output
      fakeAdb.setDefaultResponse({
        stdout: uiState,
        stderr: "",
        toString: () => uiState,
        trim: () => uiState.trim(),
        includes: (str: string) => uiState.includes(str)
      } as ExecResult);

      // Get hashes twice
      const firstHash = await window.getActiveHash();
      const secondHash = await window.getActiveHash();

      // Verify that the hashes are the same
      expect(firstHash).toBe(secondHash);
    });

    test("should ignore invisible windows", async () => {
      // UI state with a mix of visible and invisible windows
      const uiState = `
        Window #1 Window{a1b2c3 statusBar} isVisible=true
        Window #2 Window{d4e5f6 mainActivity} isVisible=true
        Window #3 Window{g7h8i9 hiddenWindow} isVisible=false
        mLayoutSeq=123
      `;

      // UI state with the same visible windows but different invisible window
      const sameVisibleState = `
        Window #1 Window{a1b2c3 statusBar} isVisible=true
        Window #2 Window{d4e5f6 mainActivity} isVisible=true
        Window #3 Window{j0k1l2 differentHiddenWindow} isVisible=false
        mLayoutSeq=123
      `;

      // Get hash for first state
      fakeAdb.setDefaultResponse({
        stdout: uiState,
        stderr: "",
        toString: () => uiState,
        trim: () => uiState.trim(),
        includes: (str: string) => uiState.includes(str)
      } as ExecResult);
      const firstHash = await window.getActiveHash();

      // Reset fake and set up for same visible state
      fakeAdb.clearHistory();
      fakeAdb.setDefaultResponse({
        stdout: sameVisibleState,
        stderr: "",
        toString: () => sameVisibleState,
        trim: () => sameVisibleState.trim(),
        includes: (str: string) => sameVisibleState.includes(str)
      } as ExecResult);
      const secondHash = await window.getActiveHash();

      // Verify that the hashes are the same since only invisible windows differ
      expect(firstHash).toBe(secondHash);
    });

    test("should handle transaction sequence changes", async () => {
      // Same windows but different transaction sequence
      const firstState = `
        Window #1 Window{a1b2c3 statusBar} isVisible=true
        Window #2 Window{d4e5f6 mainActivity} isVisible=true
        mLayoutSeq=123
      `;

      const secondState = `
        Window #1 Window{a1b2c3 statusBar} isVisible=true
        Window #2 Window{d4e5f6 mainActivity} isVisible=true
        mLayoutSeq=124
      `;

      // Get hash for first state
      fakeAdb.setDefaultResponse({
        stdout: firstState,
        stderr: "",
        toString: () => firstState,
        trim: () => firstState.trim(),
        includes: (str: string) => firstState.includes(str)
      } as ExecResult);
      const firstHash = await window.getActiveHash();

      // Reset fake and set up for second state
      fakeAdb.clearHistory();
      fakeAdb.setDefaultResponse({
        stdout: secondState,
        stderr: "",
        toString: () => secondState,
        trim: () => secondState.trim(),
        includes: (str: string) => secondState.includes(str)
      } as ExecResult);
      const secondHash = await window.getActiveHash();

      // Verify that the hashes are different due to transaction sequence change
      expect(firstHash).not.toBe(secondHash);
    });

    test("should return consistent hash format", async () => {
      const uiState = `
        imeControlTarget in display# 0 Window{12345678 u0 com.example.app/com.example.app.MainActivity}
        mLayoutSeq=123
      `;

      fakeAdb.setDefaultResponse({
        stdout: uiState,
        stderr: "",
        toString: () => uiState,
        trim: () => uiState.trim(),
        includes: (str: string) => uiState.includes(str)
      } as ExecResult);

      const hash = await window.getActiveHash();

      // MD5 hash should be 32 characters long and contain only hexadecimal characters
      expect(hash).toMatch(/^[a-f0-9]{32}$/);
    });
  });
});
