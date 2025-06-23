import { expect } from "chai";
import { describe, it, beforeEach } from "mocha";
import { Window } from "../../../src/features/observe/Window";
import sinon from "sinon";
import { AdbUtils } from "../../../src/utils/adb";
import { ExecResult } from "../../../src/models/ExecResult";
import fs from "fs";
import path from "path";

describe("Window", () => {
  let window: Window;
  let adbStub: sinon.SinonStubbedInstance<AdbUtils>;

  beforeEach(() => {
    adbStub = sinon.createStubInstance(AdbUtils);
    window = new Window(null, adbStub as unknown as AdbUtils);
  });

  describe("constructor", () => {
    it("should create instance with provided deviceId and adb", () => {
      const deviceId = "test-device";
      const customAdb = sinon.createStubInstance(AdbUtils);
      const windowInstance = new Window(deviceId, customAdb as unknown as AdbUtils);
      expect(windowInstance).to.be.instanceOf(Window);
    });

    it("should create instance with default values when no parameters provided", () => {
      const windowInstance = new Window();
      expect(windowInstance).to.be.instanceOf(Window);
    });
  });

  describe("getActive", () => {
    it("should parse package name and activity name correctly", async () => {
      const dumpsysOutput = `
        imeControlTarget in display# 0 Window{12345678 u0 com.example.app/com.example.app.MainActivity}
        mLayoutSeq=123
      `;

      adbStub.executeCommand.resolves({
        stdout: dumpsysOutput,
        stderr: "",
        toString: () => dumpsysOutput,
        trim: () => dumpsysOutput.trim(),
        includes: (str: string) => dumpsysOutput.includes(str)
      } as ExecResult);

      const result = await window.getActive();

      expect(result.appId).to.equal("com.example.app");
      expect(result.activityName).to.equal("com.example.app.MainActivity");
      expect(result.layoutSeqSum).to.equal(123);
    });

    it("should handle multiple layout sequence values", async () => {
      const dumpsysOutput = `
        imeControlTarget in display# 0 Window{12345678 u0 com.test.app/com.test.MainActivity}
        mLayoutSeq=123
        mLayoutSeq=456
        mLayoutSeq=789
      `;

      adbStub.executeCommand.resolves({
        stdout: dumpsysOutput,
        stderr: "",
        toString: () => dumpsysOutput,
        trim: () => dumpsysOutput.trim(),
        includes: (str: string) => dumpsysOutput.includes(str)
      } as ExecResult);

      const result = await window.getActive();

      expect(result.appId).to.equal("com.test.app");
      expect(result.activityName).to.equal("com.test.MainActivity");
      expect(result.layoutSeqSum).to.equal(1368); // 123 + 456 + 789
    });

    it("should handle missing window info and return default values", async () => {
      const dumpsysOutput = `
        Some other output without window info
        mLayoutSeq=100
      `;

      adbStub.executeCommand.resolves({
        stdout: dumpsysOutput,
        stderr: "",
        toString: () => dumpsysOutput,
        trim: () => dumpsysOutput.trim(),
        includes: (str: string) => dumpsysOutput.includes(str)
      } as ExecResult);

      const result = await window.getActive();

      expect(result.appId).to.equal("");
      expect(result.activityName).to.equal("");
      expect(result.layoutSeqSum).to.equal(100);
    });

    it("should handle missing layout sequence and return zero", async () => {
      const dumpsysOutput = `
        imeControlTarget in display# 0 Window{12345678 u0 com.example.app/com.example.app.MainActivity}
        Some other content without mLayoutSeq
      `;

      adbStub.executeCommand.resolves({
        stdout: dumpsysOutput,
        stderr: "",
        toString: () => dumpsysOutput,
        trim: () => dumpsysOutput.trim(),
        includes: (str: string) => dumpsysOutput.includes(str)
      } as ExecResult);

      const result = await window.getActive();

      expect(result.appId).to.equal("com.example.app");
      expect(result.activityName).to.equal("com.example.app.MainActivity");
      expect(result.layoutSeqSum).to.equal(0);
    });

    it("should handle non-numeric layout sequence values", async () => {
      const dumpsysOutput = `
        imeControlTarget in display# 0 Window{12345678 u0 com.example.app/com.example.app.MainActivity}
        mLayoutSeq=abc
        mLayoutSeq=123
        mLayoutSeq=def
        mLayoutSeq=456
      `;

      adbStub.executeCommand.resolves({
        stdout: dumpsysOutput,
        stderr: "",
        toString: () => dumpsysOutput,
        trim: () => dumpsysOutput.trim(),
        includes: (str: string) => dumpsysOutput.includes(str)
      } as ExecResult);

      const result = await window.getActive();

      expect(result.appId).to.equal("com.example.app");
      expect(result.activityName).to.equal("com.example.app.MainActivity");
      expect(result.layoutSeqSum).to.equal(579); // 123 + 456 (ignores non-numeric values)
    });

    it("should handle adb command failure gracefully", async () => {
      adbStub.executeCommand.rejects(new Error("ADB command failed"));

      const result = await window.getActive();

      expect(result.appId).to.equal("");
      expect(result.activityName).to.equal("");
      expect(result.layoutSeqSum).to.equal(0);
    });

    it("should handle empty dumpsys output", async () => {
      adbStub.executeCommand.resolves({
        stdout: "",
        stderr: "",
        toString: () => "",
        trim: () => "",
        includes: (str: string) => false
      } as ExecResult);

      const result = await window.getActive();

      expect(result.appId).to.equal("");
      expect(result.activityName).to.equal("");
      expect(result.layoutSeqSum).to.equal(0);
    });

    it("should parse Pop-Up Window and extract activity from mActivityRecord", async () => {
      // Read the actual dumpsys output with Pop-Up Window
      const dumpsysOutput = fs.readFileSync(
        path.join(__dirname, "windowDumps", "active-window-with-popup.log"),
        "utf8"
      );

      adbStub.executeCommand.resolves({
        stdout: dumpsysOutput,
        stderr: "",
        toString: () => dumpsysOutput,
        trim: () => dumpsysOutput.trim(),
        includes: (str: string) => dumpsysOutput.includes(str)
      } as ExecResult);

      const result = await window.getActive();

      // Should extract the package and activity from the mActivityRecord line within the Pop-Up Window block
      expect(result.appId).to.equal("com.zillow.android.zillowmap");
      expect(result.activityName).to.equal("com.zillow.android.appshell.MainTabActivity");
      expect(result.layoutSeqSum).to.be.greaterThan(0);
    });

    it("should handle Pop-Up Window when imeControlTarget doesn't have package/activity format", async () => {
      const dumpsysOutput = `
        imeLayeringTarget in display# 0 Window{ddf8489 u0 Pop-Up Window}
        imeInputTarget in display# 0 Window{ddf8489 u0 Pop-Up Window}
        imeControlTarget in display# 0 Window{ddf8489 u0 Pop-Up Window}

        Window #9 Window{ddf8489 u0 Pop-Up Window}:
          mDisplayId=0 rootTaskId=8 mSession=Session{8b3234c 4199:u0a10207}
          mOwnerUid=10207 showForAllUsers=false package=com.zillow.android.zillowmap appop=NONE
          mActivityRecord=ActivityRecord{5cd319f u0 com.zillow.android.zillowmap/com.zillow.android.appshell.MainTabActivity t8}
          mViewVisibility=0x0 mHaveFrame=true mObscured=false

        Window #10 Window{10634fe u0 com.zillow.android.zillowmap/com.zillow.android.appshell.MainTabActivity}:
          mDisplayId=0 rootTaskId=8
          mLayoutSeq=258
      `;

      adbStub.executeCommand.resolves({
        stdout: dumpsysOutput,
        stderr: "",
        toString: () => dumpsysOutput,
        trim: () => dumpsysOutput.trim(),
        includes: (str: string) => dumpsysOutput.includes(str)
      } as ExecResult);

      const result = await window.getActive();

      expect(result.appId).to.equal("com.zillow.android.zillowmap");
      expect(result.activityName).to.equal("com.zillow.android.appshell.MainTabActivity");
      expect(result.layoutSeqSum).to.equal(258);
    });

    it("should fall back to visible app windows when Pop-Up Window parsing fails", async () => {
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

      adbStub.executeCommand.resolves({
        stdout: dumpsysOutput,
        stderr: "",
        toString: () => dumpsysOutput,
        trim: () => dumpsysOutput.trim(),
        includes: (str: string) => dumpsysOutput.includes(str)
      } as ExecResult);

      const result = await window.getActive();

      expect(result.appId).to.equal("com.example.testapp");
      expect(result.activityName).to.equal("com.example.MainActivity");
      expect(result.layoutSeqSum).to.equal(123);
    });

    it("should fall back to BASE_APPLICATION pattern when other methods fail", async () => {
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

      adbStub.executeCommand.resolves({
        stdout: dumpsysOutput,
        stderr: "",
        toString: () => dumpsysOutput,
        trim: () => dumpsysOutput.trim(),
        includes: (str: string) => dumpsysOutput.includes(str)
      } as ExecResult);

      const result = await window.getActive();

      expect(result.appId).to.equal("com.example.testapp");
      expect(result.activityName).to.equal("com.example.MainActivity");
      expect(result.layoutSeqSum).to.equal(456);
    });
  });

  describe("getActiveHash", () => {
    it("should generate different hashes for different window states", async () => {
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

      // Set up stub to return different outputs for consecutive calls
      adbStub.executeCommand.onFirstCall().resolves({
        stdout: firstState,
        stderr: "",
        toString: () => firstState,
        trim: () => firstState.trim(),
        includes: (str: string) => firstState.includes(str)
      } as ExecResult);

      adbStub.executeCommand.onSecondCall().resolves({
        stdout: secondState,
        stderr: "",
        toString: () => secondState,
        trim: () => secondState.trim(),
        includes: (str: string) => secondState.includes(str)
      } as ExecResult);

      // Get hashes for both states
      const firstHash = await window.getActiveHash();
      const secondHash = await window.getActiveHash();

      // Verify that the hashes are different
      expect(firstHash).to.not.equal(secondHash);
    });

    it("should generate the same hash for the same window state", async () => {
      // Same UI state returned twice
      const uiState = `
        Window #1 Window{a1b2c3 statusBar} isVisible=true
        Window #2 Window{d4e5f6 mainActivity} isVisible=true
        mLayoutSeq=123
      `;

      // Set up stub to return the same output twice
      adbStub.executeCommand.resolves({
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
      expect(firstHash).to.equal(secondHash);
    });

    it("should ignore invisible windows", async () => {
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

      // Set up stub to return different outputs
      adbStub.executeCommand.onFirstCall().resolves({
        stdout: uiState,
        stderr: "",
        toString: () => uiState,
        trim: () => uiState.trim(),
        includes: (str: string) => uiState.includes(str)
      } as ExecResult);

      adbStub.executeCommand.onSecondCall().resolves({
        stdout: sameVisibleState,
        stderr: "",
        toString: () => sameVisibleState,
        trim: () => sameVisibleState.trim(),
        includes: (str: string) => sameVisibleState.includes(str)
      } as ExecResult);

      // Get hashes for both states
      const firstHash = await window.getActiveHash();
      const secondHash = await window.getActiveHash();

      // Verify that the hashes are the same since only invisible windows differ
      expect(firstHash).to.equal(secondHash);
    });

    it("should handle transaction sequence changes", async () => {
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

      // Set up stub to return different outputs
      adbStub.executeCommand.onFirstCall().resolves({
        stdout: firstState,
        stderr: "",
        toString: () => firstState,
        trim: () => firstState.trim(),
        includes: (str: string) => firstState.includes(str)
      } as ExecResult);

      adbStub.executeCommand.onSecondCall().resolves({
        stdout: secondState,
        stderr: "",
        toString: () => secondState,
        trim: () => secondState.trim(),
        includes: (str: string) => secondState.includes(str)
      } as ExecResult);

      // Get hashes for both states
      const firstHash = await window.getActiveHash();
      const secondHash = await window.getActiveHash();

      // Verify that the hashes are different due to transaction sequence change
      expect(firstHash).to.not.equal(secondHash);
    });

    it("should return consistent hash format", async () => {
      const uiState = `
        imeControlTarget in display# 0 Window{12345678 u0 com.example.app/com.example.app.MainActivity}
        mLayoutSeq=123
      `;

      adbStub.executeCommand.resolves({
        stdout: uiState,
        stderr: "",
        toString: () => uiState,
        trim: () => uiState.trim(),
        includes: (str: string) => uiState.includes(str)
      } as ExecResult);

      const hash = await window.getActiveHash();

      // MD5 hash should be 32 characters long and contain only hexadecimal characters
      expect(hash).to.match(/^[a-f0-9]{32}$/);
    });
  });
});
