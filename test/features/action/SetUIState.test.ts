import { beforeEach, describe, expect, test } from "bun:test";
import { SetUIState } from "../../../src/features/action/SetUIState";
import { BootedDevice, Element, ObserveResult, ViewHierarchyResult } from "../../../src/models";
import { FakeTimer } from "../../fakes/FakeTimer";
import {
  FakeTapOnElement,
  FakeInputText,
  FakeClearText,
  FakeSwipeOn,
  FakeObserveScreenForSetUIState,
  FakeFieldTypeDetector
} from "../../fakes/FakeSetUIStateDependencies";

describe("SetUIState", () => {
  const device: BootedDevice = {
    name: "test-device",
    platform: "android",
    deviceId: "device-1"
  };

  let fakeTap: FakeTapOnElement;
  let fakeInput: FakeInputText;
  let fakeClear: FakeClearText;
  let fakeSwipe: FakeSwipeOn;
  let fakeObserve: FakeObserveScreenForSetUIState;
  let fakeFieldTypeDetector: FakeFieldTypeDetector;
  let fakeTimer: FakeTimer;

  const createHierarchyWithElement = (element: Partial<Element>): ViewHierarchyResult => ({
    hierarchy: {
      node: [{
        $: {
          bounds: "[0,0][100,50]",
          ...element
        }
      }]
    }
  });

  const createObserveResult = (hierarchy?: ViewHierarchyResult): ObserveResult => ({
    updatedAt: Date.now(),
    screenSize: { width: 1080, height: 1920 },
    systemInsets: { top: 0, right: 0, bottom: 0, left: 0 },
    viewHierarchy: hierarchy
  });

  const createSetUIState = () => {
    return new SetUIState(device, null, {
      tapOnElement: fakeTap,
      inputText: fakeInput,
      clearText: fakeClear,
      swipeOn: fakeSwipe,
      observeScreen: fakeObserve,
      fieldTypeDetector: fakeFieldTypeDetector,
      timer: fakeTimer
    });
  };

  beforeEach(() => {
    fakeTap = new FakeTapOnElement();
    fakeInput = new FakeInputText();
    fakeClear = new FakeClearText();
    fakeSwipe = new FakeSwipeOn();
    fakeObserve = new FakeObserveScreenForSetUIState();
    fakeFieldTypeDetector = new FakeFieldTypeDetector();
    fakeTimer = new FakeTimer();
    fakeTimer.enableAutoAdvance();
  });

  describe("text field handling", () => {
    test("sets text field value with tap, clear, and input", async () => {
      const initialHierarchy = createHierarchyWithElement({
        "resource-id": "username",
        "text": "",
        "class": "android.widget.EditText"
      });
      const updatedHierarchy = createHierarchyWithElement({
        "resource-id": "username",
        "text": "john@example.com",
        "class": "android.widget.EditText"
      });

      let observeCallCount = 0;
      fakeObserve.setResultFactory(() => {
        observeCallCount++;
        if (observeCallCount <= 1) {
          return createObserveResult(initialHierarchy);
        }
        return createObserveResult(updatedHierarchy);
      });
      fakeFieldTypeDetector.setFieldType("username", "text");

      const setUIState = createSetUIState();
      const result = await setUIState.execute({
        fields: [{ selector: { elementId: "username" }, value: "john@example.com" }]
      });

      expect(result.success).toBe(true);
      expect(result.fields).toHaveLength(1);
      expect(result.fields[0].success).toBe(true);
      expect(result.fields[0].fieldType).toBe("text");

      // Verify tap was called for focus
      expect(fakeTap.getCallCount()).toBeGreaterThanOrEqual(1);
      expect(fakeTap.getCalls()[0].options.action).toBe("tap");

      // Verify clear was called
      expect(fakeClear.getCallCount()).toBe(1);

      // Verify input was called
      expect(fakeInput.getCallCount()).toBe(1);
      expect(fakeInput.getCalls()[0].text).toBe("john@example.com");
    });

    test("skips text field when already has correct value", async () => {
      const hierarchy = createHierarchyWithElement({
        "resource-id": "username",
        "text": "john@example.com",
        "class": "android.widget.EditText"
      });
      fakeObserve.setResult(createObserveResult(hierarchy));
      fakeFieldTypeDetector.setFieldType("username", "text");
      fakeFieldTypeDetector.setTextValue("username", "john@example.com");

      const setUIState = createSetUIState();
      const result = await setUIState.execute({
        fields: [{ selector: { elementId: "username" }, value: "john@example.com" }]
      });

      expect(result.success).toBe(true);
      expect(result.fields[0].success).toBe(true);
      expect(result.fields[0].skipped).toBe(true);

      // No tap, clear, or input should be called
      expect(fakeTap.getCallCount()).toBe(0);
      expect(fakeClear.getCallCount()).toBe(0);
      expect(fakeInput.getCallCount()).toBe(0);
    });
  });

  describe("checkbox handling", () => {
    test("taps checkbox when state needs to change", async () => {
      const initialHierarchy = createHierarchyWithElement({
        "resource-id": "remember_me",
        "class": "android.widget.CheckBox",
        "checkable": "true" as any,
        "checked": "false" as any
      });
      const updatedHierarchy = createHierarchyWithElement({
        "resource-id": "remember_me",
        "class": "android.widget.CheckBox",
        "checkable": "true" as any,
        "checked": "true" as any
      });

      let observeCallCount = 0;
      fakeObserve.setResultFactory(() => {
        observeCallCount++;
        if (observeCallCount <= 1) {
          return createObserveResult(initialHierarchy);
        }
        return createObserveResult(updatedHierarchy);
      });
      fakeFieldTypeDetector.setFieldType("remember_me", "checkbox");

      const setUIState = createSetUIState();
      const result = await setUIState.execute({
        fields: [{ selector: { elementId: "remember_me" }, selected: true }]
      });

      expect(result.success).toBe(true);
      expect(result.fields[0].success).toBe(true);
      expect(result.fields[0].fieldType).toBe("checkbox");

      // Verify tap was called to toggle
      expect(fakeTap.getCallCount()).toBe(1);
    });

    test("skips checkbox when already has correct state", async () => {
      const hierarchy = createHierarchyWithElement({
        "resource-id": "remember_me",
        "class": "android.widget.CheckBox",
        "checkable": "true" as any,
        "checked": "true" as any
      });
      fakeObserve.setResult(createObserveResult(hierarchy));
      fakeFieldTypeDetector.setFieldType("remember_me", "checkbox");
      fakeFieldTypeDetector.setChecked("remember_me", true);

      const setUIState = createSetUIState();
      const result = await setUIState.execute({
        fields: [{ selector: { elementId: "remember_me" }, selected: true }]
      });

      expect(result.success).toBe(true);
      expect(result.fields[0].success).toBe(true);
      expect(result.fields[0].skipped).toBe(true);

      // No tap should be called
      expect(fakeTap.getCallCount()).toBe(0);
    });
  });

  describe("toggle handling", () => {
    test("taps toggle when state needs to change", async () => {
      const initialHierarchy = createHierarchyWithElement({
        "resource-id": "dark_mode",
        "class": "android.widget.Switch",
        "checkable": "true" as any,
        "checked": "true" as any
      });
      const updatedHierarchy = createHierarchyWithElement({
        "resource-id": "dark_mode",
        "class": "android.widget.Switch",
        "checkable": "true" as any,
        "checked": "false" as any
      });

      let observeCallCount = 0;
      fakeObserve.setResultFactory(() => {
        observeCallCount++;
        if (observeCallCount <= 1) {
          return createObserveResult(initialHierarchy);
        }
        return createObserveResult(updatedHierarchy);
      });
      fakeFieldTypeDetector.setFieldType("dark_mode", "toggle");

      const setUIState = createSetUIState();
      const result = await setUIState.execute({
        fields: [{ selector: { elementId: "dark_mode" }, selected: false }]
      });

      expect(result.success).toBe(true);
      expect(result.fields[0].success).toBe(true);
      expect(result.fields[0].fieldType).toBe("toggle");

      // Verify tap was called to toggle off
      expect(fakeTap.getCallCount()).toBe(1);
    });
  });

  describe("dropdown handling", () => {
    test("opens dropdown and selects value", async () => {
      const initialHierarchy = createHierarchyWithElement({
        "resource-id": "country",
        "text": "Select Country",
        "class": "android.widget.Spinner"
      });
      const updatedHierarchy = createHierarchyWithElement({
        "resource-id": "country",
        "text": "United States",
        "class": "android.widget.Spinner"
      });

      let observeCallCount = 0;
      fakeObserve.setResultFactory(() => {
        observeCallCount++;
        if (observeCallCount <= 1) {
          return createObserveResult(initialHierarchy);
        }
        return createObserveResult(updatedHierarchy);
      });
      fakeFieldTypeDetector.setFieldType("country", "dropdown");

      const setUIState = createSetUIState();
      const result = await setUIState.execute({
        fields: [{ selector: { elementId: "country" }, value: "United States" }]
      });

      expect(result.success).toBe(true);
      expect(result.fields[0].success).toBe(true);
      expect(result.fields[0].fieldType).toBe("dropdown");

      // Verify first tap to open dropdown
      expect(fakeTap.getCallCount()).toBe(2);
      expect(fakeTap.getCalls()[0].options.elementId).toBe("country");
      // Second tap selects the value
      expect(fakeTap.getCalls()[1].options.text).toBe("United States");
    });
  });

  describe("scroll to find", () => {
    test("scrolls to find element when not visible", async () => {
      // First observation has no element, after scroll it appears
      let callCount = 0;
      fakeObserve.setResultFactory(() => {
        callCount++;
        if (callCount <= 1) {
          return createObserveResult({ hierarchy: { node: [] } });
        }
        return createObserveResult(createHierarchyWithElement({
          "resource-id": "hidden_field",
          "text": "found!",
          "class": "android.widget.EditText"
        }));
      });

      fakeFieldTypeDetector.setFieldType("hidden_field", "text");
      fakeFieldTypeDetector.setTextValue("hidden_field", "found!");

      const setUIState = createSetUIState();
      const result = await setUIState.execute({
        fields: [{ selector: { elementId: "hidden_field" }, value: "found!" }]
      });

      expect(result.success).toBe(true);
      expect(fakeSwipe.getCallCount()).toBeGreaterThanOrEqual(1);
    });

    test("respects scrollDirection option", async () => {
      // First observation: empty, second: element appears after scroll
      let callCount = 0;
      fakeObserve.setResultFactory(() => {
        callCount++;
        if (callCount <= 1) {
          return createObserveResult({ hierarchy: { node: [] } });
        }
        return createObserveResult(createHierarchyWithElement({
          "resource-id": "field",
          "text": "test",
          "class": "android.widget.EditText"
        }));
      });

      fakeFieldTypeDetector.setFieldType("field", "text");
      fakeFieldTypeDetector.setTextValue("field", "test");

      const setUIState = createSetUIState();
      await setUIState.execute({
        fields: [{ selector: { elementId: "field" }, value: "test" }],
        scrollDirection: "up"
      });

      // First scroll should be in the specified direction
      expect(fakeSwipe.getCalls()[0].options.direction).toBe("up");
    });
  });

  describe("retry logic", () => {
    test("retries up to maxRetries on failure", async () => {
      const hierarchy = createHierarchyWithElement({
        "resource-id": "field",
        "text": "",
        "class": "android.widget.EditText"
      });
      fakeObserve.setResult(createObserveResult(hierarchy));
      fakeFieldTypeDetector.setFieldType("field", "text");

      // Configure tap to fail
      fakeTap.setDefaultResult({
        success: false,
        action: "tap",
        element: { bounds: { left: 0, top: 0, right: 100, bottom: 50 } },
        error: "Element not clickable"
      });

      const setUIState = createSetUIState();
      const result = await setUIState.execute({
        fields: [{ selector: { elementId: "field" }, value: "test" }]
      });

      expect(result.success).toBe(false);
      expect(result.fields[0].attempts).toBe(3);
      expect(result.fields[0].error).toContain("Failed to tap");
    });

    test("refreshes view hierarchy between retries when element not found", async () => {
      // Element appears after first call (simulating async load)
      let observeCallCount = 0;
      fakeObserve.setResultFactory(() => {
        observeCallCount++;
        if (observeCallCount <= 1) {
          // First call: element not present
          return createObserveResult({ hierarchy: { node: [] } });
        }
        // Subsequent calls: element appears
        return createObserveResult(createHierarchyWithElement({
          "resource-id": "async_field",
          "text": "loaded!",
          "class": "android.widget.EditText"
        }));
      });

      fakeFieldTypeDetector.setFieldType("async_field", "text");
      fakeFieldTypeDetector.setTextValue("async_field", "loaded!");

      const setUIState = createSetUIState();
      const result = await setUIState.execute({
        fields: [{ selector: { elementId: "async_field" }, value: "loaded!" }]
      });

      expect(result.success).toBe(true);
      expect(result.fields[0].success).toBe(true);
      // Observe should have been called multiple times to refresh hierarchy
      expect(observeCallCount).toBeGreaterThan(1);
    });
  });

  describe("fail fast", () => {
    test("stops processing fields on first failure", async () => {
      const hierarchy = createHierarchyWithElement({
        "resource-id": "field1",
        "text": "",
        "class": "android.widget.EditText"
      });
      fakeObserve.setResult(createObserveResult(hierarchy));
      fakeFieldTypeDetector.setFieldType("field1", "text");

      // Configure tap to fail
      fakeTap.setDefaultResult({
        success: false,
        action: "tap",
        element: { bounds: { left: 0, top: 0, right: 100, bottom: 50 } },
        error: "Element not clickable"
      });

      const setUIState = createSetUIState();
      const result = await setUIState.execute({
        fields: [
          { selector: { elementId: "field1" }, value: "test1" },
          { selector: { elementId: "field2" }, value: "test2" }
        ]
      });

      expect(result.success).toBe(false);
      // field1 processed (failed after 3 retries)
      expect(result.fields[0].success).toBe(false);
      expect(result.fields[0].attempts).toBe(3);
      expect(result.error).toContain("Failed to tap");
    });
  });

  describe("password fields", () => {
    test("auto-detects password fields and skips verification", async () => {
      fakeObserve.setResult(createObserveResult(createHierarchyWithElement({
        "resource-id": "password",
        "text": "",
        "class": "android.widget.EditText",
        "password": "true"
      })));

      fakeFieldTypeDetector.setFieldType("password", "text");
      fakeFieldTypeDetector.setIsPasswordField("password", true);

      const setUIState = createSetUIState();
      const result = await setUIState.execute({
        fields: [{ selector: { elementId: "password" }, value: "secret123" }]
      });

      expect(result.success).toBe(true);
      // The field should NOT have verified=true because it's a password
      expect(result.fields[0].verified).toBeUndefined();
    });
  });

  describe("multiple fields", () => {
    test("processes fields in screen order", async () => {
      const initialHierarchy: ViewHierarchyResult = {
        hierarchy: {
          node: [
            { $: { "bounds": "[0,0][100,50]", "resource-id": "username", "text": "", "class": "android.widget.EditText" } },
            { $: { "bounds": "[0,60][100,110]", "resource-id": "password", "text": "", "class": "android.widget.EditText", "password": "true" } },
            { $: { "bounds": "[0,120][100,170]", "resource-id": "remember", "class": "android.widget.CheckBox", "checkable": "true", "checked": "false" } }
          ]
        }
      };
      const updatedHierarchy: ViewHierarchyResult = {
        hierarchy: {
          node: [
            { $: { "bounds": "[0,0][100,50]", "resource-id": "username", "text": "user@test.com", "class": "android.widget.EditText" } },
            { $: { "bounds": "[0,60][100,110]", "resource-id": "password", "text": "", "class": "android.widget.EditText", "password": "true" } },
            { $: { "bounds": "[0,120][100,170]", "resource-id": "remember", "class": "android.widget.CheckBox", "checkable": "true", "checked": "true" } }
          ]
        }
      };

      let observeCallCount = 0;
      fakeObserve.setResultFactory(() => {
        observeCallCount++;
        if (observeCallCount <= 1) {
          return createObserveResult(initialHierarchy);
        }
        return createObserveResult(updatedHierarchy);
      });

      fakeFieldTypeDetector.setFieldType("username", "text");
      fakeFieldTypeDetector.setFieldType("password", "text");
      fakeFieldTypeDetector.setFieldType("remember", "checkbox");
      fakeFieldTypeDetector.setIsPasswordField("password", true);

      const setUIState = createSetUIState();
      const result = await setUIState.execute({
        fields: [
          { selector: { elementId: "username" }, value: "user@test.com" },
          { selector: { elementId: "password" }, value: "pass123" },
          { selector: { elementId: "remember" }, selected: true }
        ]
      });

      expect(result.success).toBe(true);
      expect(result.fields).toHaveLength(3);
      expect(result.fields.every(f => f.success)).toBe(true);

      // Verify input texts were in order
      const inputCalls = fakeInput.getCalls();
      expect(inputCalls[0].text).toBe("user@test.com");
      expect(inputCalls[1].text).toBe("pass123");
    });

    test("processes fields in screen order regardless of provided order", async () => {
      const initialHierarchy: ViewHierarchyResult = {
        hierarchy: {
          node: [
            { $: { "bounds": "[0,0][100,50]", "resource-id": "top_field", "text": "", "class": "android.widget.EditText" } },
            { $: { "bounds": "[0,200][100,250]", "resource-id": "bottom_field", "text": "", "class": "android.widget.EditText" } }
          ]
        }
      };
      const updatedHierarchy: ViewHierarchyResult = {
        hierarchy: {
          node: [
            { $: { "bounds": "[0,0][100,50]", "resource-id": "top_field", "text": "first", "class": "android.widget.EditText" } },
            { $: { "bounds": "[0,200][100,250]", "resource-id": "bottom_field", "text": "second", "class": "android.widget.EditText" } }
          ]
        }
      };

      let observeCallCount = 0;
      fakeObserve.setResultFactory(() => {
        observeCallCount++;
        if (observeCallCount <= 1) {
          return createObserveResult(initialHierarchy);
        }
        return createObserveResult(updatedHierarchy);
      });

      fakeFieldTypeDetector.setFieldType("top_field", "text");
      fakeFieldTypeDetector.setFieldType("bottom_field", "text");

      const setUIState = createSetUIState();
      const result = await setUIState.execute({
        fields: [
          // Provided in reverse screen order
          { selector: { elementId: "bottom_field" }, value: "second" },
          { selector: { elementId: "top_field" }, value: "first" }
        ]
      });

      expect(result.success).toBe(true);
      expect(result.fields).toHaveLength(2);

      // Even though bottom_field was listed first, top_field (bounds.top=0) should be filled first
      const inputCalls = fakeInput.getCalls();
      expect(inputCalls[0].text).toBe("first");   // top_field processed first
      expect(inputCalls[1].text).toBe("second");   // bottom_field processed second
    });
  });

  describe("text selector", () => {
    test("finds element by text selector", async () => {
      const initialHierarchy = createHierarchyWithElement({
        "text": "Username",
        "content-desc": "Username",
        "class": "android.widget.EditText"
      });
      const updatedHierarchy = createHierarchyWithElement({
        "text": "john",
        "content-desc": "Username",
        "class": "android.widget.EditText"
      });

      let observeCallCount = 0;
      fakeObserve.setResultFactory(() => {
        observeCallCount++;
        if (observeCallCount <= 1) {
          return createObserveResult(initialHierarchy);
        }
        return createObserveResult(updatedHierarchy);
      });
      fakeFieldTypeDetector.setFieldType("Username", "text");

      const setUIState = createSetUIState();
      const result = await setUIState.execute({
        fields: [{ selector: { text: "Username" }, value: "john" }]
      });

      expect(result.success).toBe(true);
      expect(result.fields[0].success).toBe(true);
    });
  });

  describe("unprocessed fields", () => {
    test("reports unprocessed fields when not found after scrolling", async () => {
      // Element never appears
      fakeObserve.setResult(createObserveResult({ hierarchy: { node: [] } }));

      const setUIState = createSetUIState();
      const result = await setUIState.execute({
        fields: [{ selector: { elementId: "nonexistent" }, value: "test" }]
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("Fields not found after scrolling");
      expect(result.error).toContain("nonexistent");
    });
  });
});
