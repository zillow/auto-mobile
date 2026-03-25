import { expect, describe, test, beforeEach, spyOn } from "bun:test";
import { Clipboard } from "../../../src/features/action/Clipboard";
import { BootedDevice } from "../../../src/models";
import { CtrlProxyClient } from "../../../src/features/observe/ios";
import { FakeIOSCtrlProxy } from "../../fakes/FakeIOSCtrlProxy";

describe("Clipboard iOS", () => {
  let clipboard: Clipboard;
  let mockDevice: BootedDevice;
  let fakeIOSCtrlProxy: FakeIOSCtrlProxy;

  beforeEach(() => {
    mockDevice = {
      name: "Test iPhone",
      platform: "ios",
      deviceId: "test-iphone"
    };

    fakeIOSCtrlProxy = new FakeIOSCtrlProxy();

    // Mock CtrlProxyClient.getInstance to return our fake
    spyOn(CtrlProxyClient, "getInstance").mockReturnValue(
      fakeIOSCtrlProxy as unknown as CtrlProxyClient
    );

    clipboard = new Clipboard(mockDevice);
  });

  test("get returns clipboard text", async () => {
    fakeIOSCtrlProxy.setClipboardResult({
      success: true,
      action: "get",
      text: "hello world",
      totalTimeMs: 10,
    });

    const result = await clipboard.execute("get");

    expect(result.success).toBe(true);
    expect(result.action).toBe("get");
    expect(result.text).toBe("hello world");
    expect(result.method).toBe("a11y");
  });

  test("copy sends text to clipboard", async () => {
    fakeIOSCtrlProxy.setClipboardResult({
      success: true,
      action: "copy",
      totalTimeMs: 10,
    });

    const result = await clipboard.execute("copy", "test text");

    expect(result.success).toBe(true);
    expect(result.action).toBe("copy");

    const history = fakeIOSCtrlProxy.getClipboardHistory();
    expect(history).toHaveLength(1);
    expect(history[0].action).toBe("copy");
    expect(history[0].text).toBe("test text");
  });

  test("copy without text returns error", async () => {
    const result = await clipboard.execute("copy");

    expect(result.success).toBe(false);
    expect(result.error).toContain("Text is required");
  });

  test("clear clipboard succeeds", async () => {
    fakeIOSCtrlProxy.setClipboardResult({
      success: true,
      action: "clear",
      totalTimeMs: 10,
    });

    const result = await clipboard.execute("clear");

    expect(result.success).toBe(true);
    expect(result.action).toBe("clear");
  });

  test("paste clipboard succeeds", async () => {
    fakeIOSCtrlProxy.setClipboardResult({
      success: true,
      action: "paste",
      totalTimeMs: 10,
    });

    const result = await clipboard.execute("paste");

    expect(result.success).toBe(true);
    expect(result.action).toBe("paste");
  });

  test("returns error when CtrlProxy fails", async () => {
    fakeIOSCtrlProxy.setClipboardResult({
      success: false,
      action: "get",
      totalTimeMs: 10,
      error: "Clipboard access denied",
    });

    const result = await clipboard.execute("get");

    expect(result.success).toBe(false);
    expect(result.error).toBe("Clipboard access denied");
  });

  test("get returns success with undefined text when clipboard empty", async () => {
    fakeIOSCtrlProxy.setClipboardResult({
      success: true,
      action: "get",
      text: undefined,
      totalTimeMs: 10,
    });

    const result = await clipboard.execute("get");

    expect(result.success).toBe(true);
    expect(result.text).toBeUndefined();
  });
});
