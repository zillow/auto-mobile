import { expect, describe, test } from "bun:test";
import { Element } from "../../../src/models";
import {
  isPermissionDialog,
  isLoginScreen,
  isRatingDialog
} from "../../../src/features/navigation/ExploreBlockerDetection";

describe("ExploreBlockerDetection", () => {
  function createMockElement(overrides: Partial<Element> = {}): Element {
    return {
      "bounds": { left: 0, top: 0, right: 100, bottom: 50 },
      "clickable": true,
      "enabled": true,
      "text": "Button",
      "class": "android.widget.Button",
      "resource-id": "com.test:id/button",
      ...overrides
    } as Element;
  }

  describe("isPermissionDialog", () => {
    test("should detect dialog with 'Allow' button", () => {
      const elements = [
        createMockElement({ text: "Allow" }),
        createMockElement({ text: "Deny" })
      ];

      expect(isPermissionDialog(elements)).toBe(true);
    });

    test("should detect dialog with 'permission' text", () => {
      const elements = [
        createMockElement({ text: "This app needs permission to access your camera" })
      ];

      expect(isPermissionDialog(elements)).toBe(true);
    });

    test("should detect dialog with 'While using' option", () => {
      const elements = [
        createMockElement({ text: "While using the app" }),
        createMockElement({ text: "Only this time" })
      ];

      expect(isPermissionDialog(elements)).toBe(true);
    });

    test("should detect dialog with 'access' text", () => {
      const elements = [
        createMockElement({ text: "Allow access to photos?" })
      ];

      expect(isPermissionDialog(elements)).toBe(true);
    });

    test("should detect via content-desc", () => {
      const elements = [
        createMockElement({ "text": "", "content-desc": "Allow permission button" })
      ];

      expect(isPermissionDialog(elements)).toBe(true);
    });

    test("should not detect regular buttons", () => {
      const elements = [
        createMockElement({ text: "Submit" }),
        createMockElement({ text: "Cancel" })
      ];

      expect(isPermissionDialog(elements)).toBe(false);
    });

    test("should be case insensitive", () => {
      const elements = [
        createMockElement({ text: "ALLOW" }),
        createMockElement({ text: "DENY" })
      ];

      expect(isPermissionDialog(elements)).toBe(true);
    });
  });

  describe("isLoginScreen", () => {
    test("should detect screen with login text and EditText", () => {
      const elements = [
        createMockElement({ "text": "Login", "class": "android.widget.Button" }),
        createMockElement({ "text": "", "class": "android.widget.EditText" })
      ];

      expect(isLoginScreen(elements)).toBe(true);
    });

    test("should detect screen with sign in text", () => {
      const elements = [
        createMockElement({ "text": "Sign in", "class": "android.widget.Button" }),
        createMockElement({ "text": "", "class": "android.widget.EditText" })
      ];

      expect(isLoginScreen(elements)).toBe(true);
    });

    test("should detect screen with password field", () => {
      const elements = [
        createMockElement({ "text": "Password", "class": "android.widget.TextView" }),
        createMockElement({ "text": "", "class": "android.widget.EditText" })
      ];

      expect(isLoginScreen(elements)).toBe(true);
    });

    test("should detect screen with username field", () => {
      const elements = [
        createMockElement({ "text": "Username", "class": "android.widget.TextView" }),
        createMockElement({ "text": "", "class": "android.widget.EditText" })
      ];

      expect(isLoginScreen(elements)).toBe(true);
    });

    test("should not detect without EditText", () => {
      const elements = [
        createMockElement({ "text": "Login", "class": "android.widget.Button" }),
        createMockElement({ "text": "Password", "class": "android.widget.TextView" })
      ];

      expect(isLoginScreen(elements)).toBe(false);
    });

    test("should not detect without login keywords", () => {
      const elements = [
        createMockElement({ "text": "Search", "class": "android.widget.Button" }),
        createMockElement({ "text": "", "class": "android.widget.EditText" })
      ];

      expect(isLoginScreen(elements)).toBe(false);
    });

    test("should be case insensitive", () => {
      const elements = [
        createMockElement({ "text": "SIGN IN", "class": "android.widget.Button" }),
        createMockElement({ "text": "", "class": "android.widget.EditText" })
      ];

      expect(isLoginScreen(elements)).toBe(true);
    });
  });

  describe("isRatingDialog", () => {
    test("should detect dialog with 'rate' text", () => {
      const elements = [
        createMockElement({ text: "Rate this app" }),
        createMockElement({ text: "Not now" })
      ];

      expect(isRatingDialog(elements)).toBe(true);
    });

    test("should detect dialog with 'review' text", () => {
      const elements = [
        createMockElement({ text: "Leave a review" }),
        createMockElement({ text: "Later" })
      ];

      expect(isRatingDialog(elements)).toBe(true);
    });

    test("should detect dialog with 'feedback' text", () => {
      const elements = [
        createMockElement({ text: "Give us feedback" })
      ];

      expect(isRatingDialog(elements)).toBe(true);
    });

    test("should detect dialog with 'enjoy' text", () => {
      const elements = [
        createMockElement({ text: "Enjoying the app?" })
      ];

      expect(isRatingDialog(elements)).toBe(true);
    });

    test("should detect dialog with 'star' text", () => {
      const elements = [
        createMockElement({ text: "5 stars" }),
        createMockElement({ text: "Submit" })
      ];

      expect(isRatingDialog(elements)).toBe(true);
    });

    test("should detect via content-desc", () => {
      const elements = [
        createMockElement({ "text": "", "content-desc": "Rate app dialog" })
      ];

      expect(isRatingDialog(elements)).toBe(true);
    });

    test("should not detect regular screens", () => {
      const elements = [
        createMockElement({ text: "Home" }),
        createMockElement({ text: "Settings" })
      ];

      expect(isRatingDialog(elements)).toBe(false);
    });

    test("should be case insensitive", () => {
      const elements = [
        createMockElement({ text: "RATE THIS APP" })
      ];

      expect(isRatingDialog(elements)).toBe(true);
    });
  });

  describe("combined blocker detection", () => {
    test("should not detect blockers on regular navigation screens", () => {
      const elements = [
        createMockElement({ text: "Home" }),
        createMockElement({ text: "Profile" }),
        createMockElement({ text: "Settings" }),
        createMockElement({ text: "Help" })
      ];

      expect(isPermissionDialog(elements)).toBe(false);
      expect(isLoginScreen(elements)).toBe(false);
      expect(isRatingDialog(elements)).toBe(false);
    });

    test("should handle empty element list", () => {
      expect(isPermissionDialog([])).toBe(false);
      expect(isLoginScreen([])).toBe(false);
      expect(isRatingDialog([])).toBe(false);
    });

    test("should handle elements with missing text fields", () => {
      const elements = [
        createMockElement({ "text": undefined, "content-desc": undefined })
      ];

      expect(isPermissionDialog(elements)).toBe(false);
      expect(isLoginScreen(elements)).toBe(false);
      expect(isRatingDialog(elements)).toBe(false);
    });
  });
});
