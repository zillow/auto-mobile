import { beforeEach, describe, expect, test } from "bun:test";
import { Keyboard } from "../../../src/features/action/Keyboard";
import { BootedDevice, ViewHierarchyResult } from "../../../src/models";
import { FakeAdbExecutor } from "../../fakes/FakeAdbExecutor";
import { FakeKeyboardHierarchyProvider } from "../../fakes/FakeKeyboardHierarchyProvider";
import { FakeTimer } from "../../fakes/FakeTimer";

describe("Keyboard", () => {
  let fakeAdb: FakeAdbExecutor;
  let fakeHierarchy: FakeKeyboardHierarchyProvider;
  let fakeTimer: FakeTimer;

  const testDevice: BootedDevice = {
    deviceId: "test-device",
    platform: "android",
    name: "Test Device"
  };

  const baseHierarchy = (): ViewHierarchyResult => ({
    hierarchy: {
      node: {
        $: {}
      }
    }
  });

  const keyboardWindowHierarchy = (): ViewHierarchyResult => ({
    ...baseHierarchy(),
    windows: [
      {
        type: 2,
        bounds: { left: 0, top: 1200, right: 1080, bottom: 1920 }
      }
    ]
  });

  const keyboardNodeHierarchy = (): ViewHierarchyResult => ({
    hierarchy: {
      node: {
        $: {
          "content-desc": "Delete"
        }
      }
    }
  });

  const focusedInputHierarchy = (): ViewHierarchyResult => ({
    hierarchy: {
      node: {
        $: {
          focused: "true",
          class: "android.widget.EditText",
          bounds: "[10,20][210,120]"
        }
      }
    }
  });

  beforeEach(() => {
    fakeAdb = new FakeAdbExecutor();
    fakeHierarchy = new FakeKeyboardHierarchyProvider();
    fakeTimer = new FakeTimer();
    fakeTimer.enableAutoAdvance();
  });

  test("detect returns bounds from input method window", async () => {
    fakeHierarchy.setResults([keyboardWindowHierarchy()]);
    const keyboard = new Keyboard(testDevice, fakeAdb, fakeHierarchy, fakeTimer);

    const result = await keyboard.execute("detect");

    expect(result.success).toBe(true);
    expect(result.open).toBe(true);
    expect(result.bounds).toEqual([
      { left: 0, top: 1200, right: 1080, bottom: 1920 }
    ]);
  });

  test("detect falls back to hierarchy when window info is missing", async () => {
    fakeHierarchy.setResults([keyboardNodeHierarchy()]);
    const keyboard = new Keyboard(testDevice, fakeAdb, fakeHierarchy, fakeTimer);

    const result = await keyboard.execute("detect");

    expect(result.success).toBe(true);
    expect(result.open).toBe(true);
    expect(result.bounds).toBeUndefined();
  });

  test("open taps focused input when keyboard is closed", async () => {
    fakeHierarchy.setResults([focusedInputHierarchy(), keyboardWindowHierarchy()]);
    const keyboard = new Keyboard(testDevice, fakeAdb, fakeHierarchy, fakeTimer);

    const result = await keyboard.execute("open");

    expect(result.success).toBe(true);
    expect(result.open).toBe(true);
    expect(fakeAdb.wasCommandExecuted("shell input tap")).toBe(true);
  });

  test("open is idempotent when keyboard is already open", async () => {
    fakeHierarchy.setResults([keyboardWindowHierarchy()]);
    const keyboard = new Keyboard(testDevice, fakeAdb, fakeHierarchy, fakeTimer);

    const result = await keyboard.execute("open");

    expect(result.success).toBe(true);
    expect(result.open).toBe(true);
    expect(fakeAdb.getExecutedCommands().length).toBe(0);
  });

  test("close sends back keyevent when keyboard is open", async () => {
    fakeHierarchy.setResults([keyboardWindowHierarchy(), baseHierarchy()]);
    const keyboard = new Keyboard(testDevice, fakeAdb, fakeHierarchy, fakeTimer);

    const result = await keyboard.execute("close");

    expect(result.success).toBe(true);
    expect(result.open).toBe(false);
    expect(fakeAdb.wasCommandExecuted("shell input keyevent KEYCODE_BACK")).toBe(true);
  });
});
