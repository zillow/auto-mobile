#!/usr/bin/env bun
/**
 * VoiceOver Login Flow - AutoMobile MCP Tool Demonstration
 *
 * This script demonstrates how an agent uses AutoMobile MCP tools to automate
 * a login screen while VoiceOver is active on iOS.
 *
 * Key insight: The agent's tool call sequence is IDENTICAL to a non-VoiceOver
 * session. AutoMobile detects VoiceOver and adapts internally:
 *   - tapOn uses accessibility activation instead of coordinate-based taps
 *   - inputText injects text directly (unchanged in VoiceOver mode)
 *   - observe returns accessibilityState to signal VoiceOver is active
 *
 * VoiceOver vs TalkBack differences relevant to this flow:
 *   - service field is "voiceover" (not "talkback")
 *   - accessibilityFocusedElement is NOT present for iOS (VoiceOver cursor
 *     position is not yet tracked via CtrlProxy)
 *   - Element class names are UIKit types (e.g. UIButton, UITextField)
 *     rather than Android class names
 *
 * This script is a demonstration — it uses simulated responses to show the
 * expected call sequence and response shapes without requiring a real device.
 *
 * Usage:
 *   bun scripts/voiceover-login-flow.ts
 */

import type { ObserveResult } from "../src/models/ObserveResult";
import type { Element } from "../src/models/Element";

// ---------------------------------------------------------------------------
// Simulated MCP client interface
// In a real agent session, these calls go over the MCP protocol to the server.
// ---------------------------------------------------------------------------

interface TapOnArgs {
  text?: string;
  elementId?: string;
  contentDesc?: string;
}

interface InputTextArgs {
  text: string;
}

interface MockClient {
  observe(): Promise<ObserveResult>;
  tapOn(args: TapOnArgs): Promise<{ success: boolean; message: string }>;
  inputText(args: InputTextArgs): Promise<{ success: boolean; message: string }>;
}

// ---------------------------------------------------------------------------
// Simulated responses representing what the MCP server would return
// ---------------------------------------------------------------------------

function makeLoginScreenObserve(): ObserveResult {
  const usernameField: Element = {
    "bounds": { left: 32, top: 280, right: 688, bottom: 340 },
    "text": "",
    "content-desc": "Username",
    "resource-id": "usernameInput",
    "class": "UITextField",
    "clickable": true,
    "focusable": true,
    "focused": false,
    "enabled": true,
  };

  const passwordField: Element = {
    "bounds": { left: 32, top: 380, right: 688, bottom: 440 },
    "text": "",
    "content-desc": "Password",
    "resource-id": "passwordInput",
    "class": "UITextField",
    "clickable": true,
    "focusable": true,
    "focused": false,
    "enabled": true,
  };

  const loginButton: Element = {
    "bounds": { left: 32, top: 500, right: 688, bottom: 560 },
    "text": "Log in",
    "content-desc": "Log in",
    "resource-id": "loginButton",
    "class": "UIButton",
    "clickable": true,
    "focusable": true,
    "focused": false,
    "enabled": true,
  };

  return {
    updatedAt: Date.now(),
    screenSize: { width: 390, height: 844 },
    systemInsets: { top: 59, bottom: 34, left: 0, right: 0 },
    // accessibilityState tells the agent VoiceOver is active.
    // The agent does NOT need to change its tool calls based on this.
    // AutoMobile adapts internally.
    accessibilityState: {
      enabled: true,
      service: "voiceover",
    },
    // Note: accessibilityFocusedElement is NOT present for iOS.
    // The VoiceOver cursor position is not tracked via CtrlProxy.
    // Use observe().elements to find elements regardless of VoiceOver cursor.
    elements: {
      clickable: [usernameField, passwordField, loginButton],
      scrollable: [],
      text: [usernameField, passwordField, loginButton],
    },
    activeWindow: {
      packageName: "com.example.app",
      activityName: "LoginViewController",
      windowId: 1,
    },
  };
}

function makeUsernameFieldFocusedObserve(): ObserveResult {
  // After tapOn("Username"), VoiceOver activates the UITextField.
  // Under the hood, tapOn issued an accessibility activation action
  // rather than a coordinate tap. A coordinate tap under VoiceOver only
  // moves the VoiceOver cursor to the element (announcing it); a second
  // tap (double-tap in VoiceOver) activates it. AutoMobile handles this
  // automatically with the activation action.
  const usernameField: Element = {
    "bounds": { left: 32, top: 280, right: 688, bottom: 340 },
    "text": "",
    "content-desc": "Username",
    "resource-id": "usernameInput",
    "class": "UITextField",
    "clickable": true,
    "focusable": true,
    "focused": true,
    "enabled": true,
  };

  return {
    updatedAt: Date.now(),
    screenSize: { width: 390, height: 844 },
    systemInsets: { top: 59, bottom: 34, left: 0, right: 0 },
    accessibilityState: {
      enabled: true,
      service: "voiceover",
    },
    focusedElement: usernameField,
    elements: {
      clickable: [usernameField],
      scrollable: [],
      text: [usernameField],
    },
    activeWindow: {
      packageName: "com.example.app",
      activityName: "LoginViewController",
      windowId: 1,
    },
  };
}

function makePostLoginObserve(): ObserveResult {
  const welcomeText: Element = {
    "bounds": { left: 32, top: 120, right: 358, bottom: 160 },
    "text": "Welcome, user@example.com",
    "content-desc": "Welcome, user@example.com",
    "resource-id": "welcomeLabel",
    "class": "UILabel",
    "clickable": false,
    "focusable": true,
    "focused": false,
    "enabled": true,
  };

  return {
    updatedAt: Date.now(),
    screenSize: { width: 390, height: 844 },
    systemInsets: { top: 59, bottom: 34, left: 0, right: 0 },
    accessibilityState: {
      enabled: true,
      service: "voiceover",
    },
    elements: {
      clickable: [],
      scrollable: [],
      text: [welcomeText],
    },
    activeWindow: {
      packageName: "com.example.app",
      activityName: "HomeViewController",
      windowId: 2,
    },
  };
}

// ---------------------------------------------------------------------------
// Simulated MCP client
// ---------------------------------------------------------------------------

function createMockClient(): MockClient {
  let callCount = 0;

  return {
    async observe(): Promise<ObserveResult> {
      callCount++;
      // Return different responses depending on which observe call this is:
      //   1 = initial login screen check
      //   2 = after tapping username field
      //   3 = after login button tap
      if (callCount === 1) {
        return makeLoginScreenObserve();
      } else if (callCount === 2) {
        return makeUsernameFieldFocusedObserve();
      } else {
        return makePostLoginObserve();
      }
    },

    async tapOn(args: TapOnArgs): Promise<{ success: boolean; message: string }> {
      // Simulated response — actual server response is typically { success: true }
      // Under VoiceOver, the server uses an accessibility activation action
      // on the target element's AXUIElement rather than injecting a UITouch
      // coordinate event. This is transparent to the caller.
      return {
        success: true,
        message: `Tapped element (VoiceOver: accessibility activation): ${JSON.stringify(args)}`,
      };
    },

    async inputText(args: InputTextArgs): Promise<{ success: boolean; message: string }> {
      // inputText injects text via the accessibility API in both VoiceOver
      // and standard modes. No adaptation is needed.
      return {
        success: true,
        message: `Text entered: "${args.text}"`,
      };
    },
  };
}

// ---------------------------------------------------------------------------
// Helper to print structured section headers
// ---------------------------------------------------------------------------

function printStep(step: number, description: string): void {
  console.log(`\n${"─".repeat(60)}`);
  console.log(`Step ${step}: ${description}`);
  console.log("─".repeat(60));
}

function printResult(label: string, value: unknown): void {
  console.log(`${label}:`);
  console.log(JSON.stringify(value, null, 2));
}

// ---------------------------------------------------------------------------
// Main demonstration
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log("=".repeat(60));
  console.log("VoiceOver Login Flow - AutoMobile MCP Tool Demonstration");
  console.log("=".repeat(60));
  console.log();
  console.log("Scenario: Automate a login screen while VoiceOver is active on iOS.");
  console.log("The agent's tool call sequence is identical to a standard session.");
  console.log("AutoMobile adapts internally.");

  const client = createMockClient();

  // -------------------------------------------------------------------------
  // Step 1: Observe to confirm VoiceOver state and read the current screen.
  // -------------------------------------------------------------------------
  printStep(1, "Observe initial screen state");

  const initialObserve = await client.observe();

  // The agent checks accessibilityState to understand the environment.
  // service: "voiceover" confirms iOS VoiceOver is active.
  printResult("accessibilityState", initialObserve.accessibilityState);

  console.log("\nNote: accessibilityFocusedElement is not present for iOS.");
  console.log("      VoiceOver cursor position is not yet tracked via CtrlProxy.");
  console.log("      Use observe().elements to find elements regardless of cursor.");

  console.log("\nClickable elements on screen:");
  for (const el of initialObserve.elements?.clickable ?? []) {
    console.log(
      `  [${el["resource-id"]}]  text="${el.text ?? ""}"  content-desc="${el["content-desc"] ?? ""}"`
    );
  }

  if (initialObserve.accessibilityState?.enabled) {
    console.log(
      `\nNote: VoiceOver is ACTIVE (service: ${initialObserve.accessibilityState.service}).`
    );
    console.log(
      "      tapOn will use accessibility activation internally. No change needed to this script."
    );
  }

  // -------------------------------------------------------------------------
  // Step 2: Tap the username field.
  // Under VoiceOver, a coordinate tap only moves the VoiceOver cursor to the
  // element (announcing it) without activating it. AutoMobile detects VoiceOver
  // and issues an accessibility activation action instead, which activates the
  // UITextField for text input directly.
  // -------------------------------------------------------------------------
  printStep(2, "Tap username field");
  console.log("Note: Under VoiceOver, tapOn uses accessibility activation on the");
  console.log("      element, not a coordinate UITouch event. The call site is unchanged.");

  const tapUsernameResult = await client.tapOn({ text: "Username" });
  printResult("tapOn result", tapUsernameResult);

  // -------------------------------------------------------------------------
  // Step 3: Observe to verify the username field received focus.
  // Under VoiceOver, verify by checking focusedElement (input focus),
  // not accessibilityFocusedElement (which is not tracked on iOS).
  // -------------------------------------------------------------------------
  printStep(3, "Observe after tapping username (verify input focus)");

  const afterTapObserve = await client.observe();
  printResult(
    "focusedElement (should be username UITextField)",
    afterTapObserve.focusedElement
  );

  const usernameFocused =
    afterTapObserve.focusedElement?.["resource-id"] === "usernameInput";
  console.log(`\nUsername field has input focus: ${usernameFocused}`);

  // -------------------------------------------------------------------------
  // Step 4: Input username text.
  // Text injection works identically in VoiceOver and standard mode.
  // -------------------------------------------------------------------------
  printStep(4, "Input username text");
  console.log("Note: inputText works identically in VoiceOver and standard mode.");

  const inputUsernameResult = await client.inputText({ text: "user@example.com" });
  printResult("inputText result", inputUsernameResult);

  // -------------------------------------------------------------------------
  // Step 5: Tap the password field.
  // -------------------------------------------------------------------------
  printStep(5, "Tap password field");

  const tapPasswordResult = await client.tapOn({ text: "Password" });
  printResult("tapOn result", tapPasswordResult);

  // -------------------------------------------------------------------------
  // Step 6: Input password text.
  // -------------------------------------------------------------------------
  printStep(6, "Input password text");

  const inputPasswordResult = await client.inputText({ text: "password123" });
  printResult("inputText result", inputPasswordResult);

  // -------------------------------------------------------------------------
  // Step 7: Tap the login button.
  // Under VoiceOver, grouped accessibility nodes may combine button text
  // with a role suffix (e.g. "Log in, Button"). If the button uses a
  // combined label, use contentDesc with substring matching.
  // -------------------------------------------------------------------------
  printStep(7, "Tap login button");
  console.log("Note: For grouped VoiceOver nodes, use contentDesc instead of text.");
  console.log("      Example: tapOn({ contentDesc: 'Log in' }) would also work here.");

  const tapLoginResult = await client.tapOn({ text: "Log in" });
  printResult("tapOn result", tapLoginResult);

  // -------------------------------------------------------------------------
  // Step 8: Observe to verify successful navigation to the home screen.
  // Check the active window activity name to confirm login succeeded.
  // -------------------------------------------------------------------------
  printStep(8, "Observe post-login screen to verify navigation");

  const postLoginObserve = await client.observe();
  printResult("activeWindow after login", postLoginObserve.activeWindow);

  const loginSucceeded =
    postLoginObserve.activeWindow?.activityName === "HomeViewController";
  console.log(`\nLogin succeeded (navigated to HomeViewController): ${loginSucceeded}`);

  // -------------------------------------------------------------------------
  // Summary
  // -------------------------------------------------------------------------
  console.log("\n" + "=".repeat(60));
  console.log("Demonstration complete.");
  console.log("=".repeat(60));
  console.log();
  console.log("Key takeaways:");
  console.log("  - The agent's call sequence is identical to standard mode.");
  console.log("  - accessibilityState.service = 'voiceover' signals iOS VoiceOver.");
  console.log("  - accessibilityFocusedElement is absent on iOS (not yet tracked).");
  console.log("  - tapOn uses accessibility activation internally (transparent).");
  console.log("  - inputText is unchanged in VoiceOver mode.");
  console.log("  - Use focusedElement (input focus) to verify field activation.");
  console.log(
    "  - For grouped nodes, use contentDesc: instead of text: in tapOn args."
  );
}

main().catch(error => {
  console.error("Fatal error:", error);
  process.exit(1);
});
