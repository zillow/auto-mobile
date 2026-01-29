import { describe, expect, test } from "bun:test";
import { FieldTypeDetector } from "../../../src/features/action/FieldTypeDetector";
import { Element } from "../../../src/models";

describe("FieldTypeDetector", () => {
  const detector = new FieldTypeDetector();

  const createElement = (overrides: Partial<Element> = {}): Element => ({
    bounds: { left: 0, top: 0, right: 100, bottom: 50 },
    ...overrides
  });

  describe("detect", () => {
    describe("text field detection", () => {
      test("detects Android EditText as text", () => {
        const element = createElement({
          "class": "android.widget.EditText",
          "focusable": true,
          "clickable": true
        });
        expect(detector.detect(element)).toBe("text");
      });

      test("detects Android TextInputEditText as text", () => {
        const element = createElement({
          "class": "com.google.android.material.textfield.TextInputEditText",
          "focusable": true,
          "clickable": true
        });
        expect(detector.detect(element)).toBe("text");
      });

      test("detects iOS UITextField as text", () => {
        const element = createElement({
          "class": "UITextField",
          "focusable": true,
          "clickable": true
        });
        expect(detector.detect(element)).toBe("text");
      });

      test("detects iOS UITextView as text", () => {
        const element = createElement({
          "class": "UITextView",
          "focusable": true,
          "clickable": true
        });
        expect(detector.detect(element)).toBe("text");
      });

      test("detects focusable + clickable as text fallback", () => {
        const element = createElement({
          "class": "com.custom.TextInput",
          "focusable": true,
          "clickable": true
        });
        expect(detector.detect(element)).toBe("text");
      });
    });

    describe("checkbox detection", () => {
      test("detects Android CheckBox as checkbox", () => {
        const element = createElement({
          "class": "android.widget.CheckBox",
          "checkable": true
        });
        expect(detector.detect(element)).toBe("checkbox");
      });

      test("detects AppCompat CheckBox as checkbox", () => {
        const element = createElement({
          "class": "androidx.appcompat.widget.AppCompatCheckBox",
          "checkable": true
        });
        expect(detector.detect(element)).toBe("checkbox");
      });

      test("detects RadioButton as checkbox", () => {
        const element = createElement({
          "class": "android.widget.RadioButton",
          "checkable": true
        });
        expect(detector.detect(element)).toBe("checkbox");
      });

      test("detects checkable without specific class as checkbox", () => {
        const element = createElement({
          "class": "com.custom.CheckableView",
          "checkable": true
        });
        expect(detector.detect(element)).toBe("checkbox");
      });

      test("detects checkable=true as string", () => {
        const element = createElement({
          "class": "com.custom.View",
          "checkable": "true" as any
        });
        expect(detector.detect(element)).toBe("checkbox");
      });
    });

    describe("toggle detection", () => {
      test("detects Android Switch as toggle", () => {
        const element = createElement({
          "class": "android.widget.Switch",
          "checkable": true
        });
        expect(detector.detect(element)).toBe("toggle");
      });

      test("detects SwitchCompat as toggle", () => {
        const element = createElement({
          "class": "androidx.appcompat.widget.SwitchCompat",
          "checkable": true
        });
        expect(detector.detect(element)).toBe("toggle");
      });

      test("detects SwitchMaterial as toggle", () => {
        const element = createElement({
          "class": "com.google.android.material.switchmaterial.SwitchMaterial",
          "checkable": true
        });
        expect(detector.detect(element)).toBe("toggle");
      });

      test("detects iOS UISwitch as toggle", () => {
        const element = createElement({
          "class": "UISwitch",
          "checkable": true
        });
        expect(detector.detect(element)).toBe("toggle");
      });

      test("detects ToggleButton as toggle", () => {
        const element = createElement({
          "class": "android.widget.ToggleButton",
          "checkable": true
        });
        expect(detector.detect(element)).toBe("toggle");
      });
    });

    describe("dropdown detection", () => {
      test("detects Android Spinner as dropdown", () => {
        const element = createElement({
          "class": "android.widget.Spinner"
        });
        expect(detector.detect(element)).toBe("dropdown");
      });

      test("detects AppCompat Spinner as dropdown", () => {
        const element = createElement({
          "class": "androidx.appcompat.widget.AppCompatSpinner"
        });
        expect(detector.detect(element)).toBe("dropdown");
      });

      test("detects iOS UIPickerView as dropdown", () => {
        const element = createElement({
          "class": "UIPickerView"
        });
        expect(detector.detect(element)).toBe("dropdown");
      });

      test("detects iOS UIDatePicker as dropdown", () => {
        const element = createElement({
          "class": "UIDatePicker"
        });
        expect(detector.detect(element)).toBe("dropdown");
      });
    });

    describe("unknown detection", () => {
      test("returns unknown for non-interactive element", () => {
        const element = createElement({
          "class": "android.widget.TextView"
        });
        expect(detector.detect(element)).toBe("unknown");
      });

      test("returns unknown for clickable-only element", () => {
        const element = createElement({
          "class": "android.widget.Button",
          "clickable": true
        });
        expect(detector.detect(element)).toBe("unknown");
      });
    });
  });

  describe("isChecked", () => {
    test("returns true for checked=true boolean", () => {
      const element = createElement({ checked: true });
      expect(detector.isChecked(element)).toBe(true);
    });

    test("returns true for checked='true' string", () => {
      const element = createElement({ checked: "true" as any });
      expect(detector.isChecked(element)).toBe(true);
    });

    test("returns false for checked=false", () => {
      const element = createElement({ checked: false });
      expect(detector.isChecked(element)).toBe(false);
    });

    test("returns false for undefined checked", () => {
      const element = createElement({});
      expect(detector.isChecked(element)).toBe(false);
    });
  });

  describe("getTextValue", () => {
    test("returns text when present", () => {
      const element = createElement({ text: "Hello World" });
      expect(detector.getTextValue(element)).toBe("Hello World");
    });

    test("returns empty string when text is undefined", () => {
      const element = createElement({});
      expect(detector.getTextValue(element)).toBe("");
    });

    test("returns empty string when text is not a string", () => {
      const element = createElement({ text: 123 as any });
      expect(detector.getTextValue(element)).toBe("");
    });
  });
});
