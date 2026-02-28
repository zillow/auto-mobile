#!/usr/bin/env bun
/**
 * TalkBack Login Flow - AutoMobile MCP Tool Demonstration
 *
 * This script demonstrates how an agent uses AutoMobile MCP tools to automate
 * a login screen while TalkBack is active on Android.
 *
 * Key insight: The agent's tool call sequence is IDENTICAL to a non-TalkBack
 * session. AutoMobile detects TalkBack and adapts internally:
 *   - tapOn uses ACTION_CLICK instead of coordinate-based taps
 *   - inputText uses ACTION_SET_TEXT (already TalkBack-compatible)
 *   - observe returns accessibilityState and accessibilityFocusedElement
 *
 * This script is a demonstration — it uses simulated responses to show the
 * expected call sequence and response shapes without requiring a real device.
 *
 * Usage:
 *   bun scripts/talkback-login-flow.ts
 */

import type { ObserveResult } from "../src/models/ObserveResult";
import type { Element } from "../src/models/Element";

// ---------------------------------------------------------------------------
// Simulated MCP client interface
// In a real agent session, these calls go over the MCP protocol to the server.
// ---------------------------------------------------------------------------

interface TapOnArgs {
  text?: string;
  resourceId?: string;
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
    bounds: { left: 32, top: 280, right: 688, bottom: 340 },
    text: "",
    "content-desc": "Username",
    "resource-id": "com.example.app:id/username_input",
    "class": "android.widget.EditText",
    clickable: true,
    focusable: true,
    focused: false,
    "accessibility-focused": false,
    enabled: true,
  };

  const passwordField: Element = {
    bounds: { left: 32, top: 380, right: 688, bottom: 440 },
    text: "",
    "content-desc": "Password",
    "resource-id": "com.example.app:id/password_input",
    "class": "android.widget.EditText",
    clickable: true,
    focusable: true,
    focused: false,
    "accessibility-focused": false,
    enabled: true,
  };

  const loginButton: Element = {
    bounds: { left: 32, top: 500, right: 688, bottom: 560 },
    text: "Log in",
    "content-desc": "Log in",
    "resource-id": "com.example.app:id/login_button",
    "class": "android.widget.Button",
    clickable: true,
    focusable: true,
    focused: false,
    "accessibility-focused": false,
    enabled: true,
  };

  // TalkBack places its cursor on the first focusable element on screen load.
  // The accessibilityFocusedElement field tracks where the TalkBack cursor is.
  const talkbackCursorOnHeading: Element = {
    bounds: { left: 32, top: 180, right: 688, bottom: 240 },
    text: "Sign in to your account",
    "content-desc": "Sign in to your account",
    "resource-id": "com.example.app:id/login_heading",
    "class": "android.widget.TextView",
    clickable: false,
    focusable: true,
    focused: false,
    "accessibility-focused": true,
    enabled: true,
  };

  return {
    updatedAt: Date.now(),
    screenSize: { width: 720, height: 1280 },
    systemInsets: { top: 48, bottom: 96, left: 0, right: 0 },
    // accessibilityState tells the agent TalkBack is active.
    // The agent does NOT need to change its tool calls based on this.
    // AutoMobile adapts internally.
    accessibilityState: {
      enabled: true,
      service: "talkback",
    },
    // accessibilityFocusedElement shows where the TalkBack cursor is.
    // The agent can use this to understand the screen reader's current position.
    accessibilityFocusedElement: talkbackCursorOnHeading,
    elements: {
      clickable: [usernameField, passwordField, loginButton],
      scrollable: [],
      text: [
        talkbackCursorOnHeading,
        usernameField,
        passwordField,
        loginButton,
      ],
    },
    activeWindow: {
      packageName: "com.example.app",
      activityName: "com.example.app.LoginActivity",
      windowId: 1,
    },
  };
}

function makeUsernameFieldFocusedObserve(): ObserveResult {
  // After tapOn("Username"), TalkBack moves its cursor to the username field.
  // Under the hood, tapOn issued ACTION_CLICK on the EditText node directly
  // rather than tapping screen coordinates, which is required because a
  // coordinate tap under TalkBack only announces the element; it does not
  // activate it.
  const usernameField: Element = {
    bounds: { left: 32, top: 280, right: 688, bottom: 340 },
    text: "",
    "content-desc": "Username",
    "resource-id": "com.example.app:id/username_input",
    "class": "android.widget.EditText",
    clickable: true,
    focusable: true,
    focused: true,
    "accessibility-focused": true,
    enabled: true,
  };

  return {
    updatedAt: Date.now(),
    screenSize: { width: 720, height: 1280 },
    systemInsets: { top: 48, bottom: 96, left: 0, right: 0 },
    accessibilityState: {
      enabled: true,
      service: "talkback",
    },
    accessibilityFocusedElement: usernameField,
    focusedElement: usernameField,
    elements: {
      clickable: [usernameField],
      scrollable: [],
      text: [usernameField],
    },
    activeWindow: {
      packageName: "com.example.app",
      activityName: "com.example.app.LoginActivity",
      windowId: 1,
    },
  };
}

function makePostLoginObserve(): ObserveResult {
  const welcomeText: Element = {
    bounds: { left: 32, top: 120, right: 688, bottom: 180 },
    text: "Welcome, user@example.com",
    "content-desc": "Welcome, user@example.com",
    "resource-id": "com.example.app:id/welcome_message",
    "class": "android.widget.TextView",
    clickable: false,
    focusable: true,
    focused: false,
    "accessibility-focused": true,
    enabled: true,
  };

  // On navigation to a new screen, TalkBack auto-focuses the first element.
  return {
    updatedAt: Date.now(),
    screenSize: { width: 720, height: 1280 },
    systemInsets: { top: 48, bottom: 96, left: 0, right: 0 },
    accessibilityState: {
      enabled: true,
      service: "talkback",
    },
    accessibilityFocusedElement: welcomeText,
    elements: {
      clickable: [],
      scrollable: [],
      text: [welcomeText],
    },
    activeWindow: {
      packageName: "com.example.app",
      activityName: "com.example.app.HomeActivity",
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
      // Under TalkBack, the server uses ACTION_CLICK on the AccessibilityNodeInfo
      // instead of injecting MotionEvent coordinates. This is transparent to the
      // caller: the args shape and return shape are unchanged.
      return {
        success: true,
        message: `Tapped element (TalkBack: ACTION_CLICK on node): ${JSON.stringify(args)}`,
      };
    },

    async inputText(args: InputTextArgs): Promise<{ success: boolean; message: string }> {
      // inputText uses ACTION_SET_TEXT in both TalkBack and standard modes.
      // No adaptation is needed here.
      return {
        success: true,
        message: `Text entered via ACTION_SET_TEXT: "${args.text}"`,
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
  console.log("TalkBack Login Flow - AutoMobile MCP Tool Demonstration");
  console.log("=".repeat(60));
  console.log();
  console.log("Scenario: Automate a login screen while TalkBack is active.");
  console.log("The agent's tool call sequence is identical to a standard");
  console.log("session. AutoMobile adapts internally.");

  const client = createMockClient();

  // -------------------------------------------------------------------------
  // Step 1: Observe to confirm TalkBack state and read the current screen.
  // -------------------------------------------------------------------------
  printStep(1, "Observe initial screen state");

  const initialObserve = await client.observe();

  // The agent checks accessibilityState to understand the environment.
  // This informs the agent what behavior to expect (e.g., focus tracking).
  printResult("accessibilityState", initialObserve.accessibilityState);

  // accessibilityFocusedElement shows where TalkBack's cursor is sitting.
  // On first load, TalkBack typically lands on the first focusable element.
  printResult("accessibilityFocusedElement", initialObserve.accessibilityFocusedElement);

  console.log("\nClickable elements on screen:");
  for (const el of initialObserve.elements?.clickable ?? []) {
    console.log(
      `  [${el["resource-id"]}]  text="${el.text ?? ""}"  content-desc="${el["content-desc"] ?? ""}"`
    );
  }

  if (initialObserve.accessibilityState?.enabled) {
    console.log(
      `\nNote: TalkBack is ACTIVE (service: ${initialObserve.accessibilityState.service}).`
    );
    console.log(
      "      tapOn will use ACTION_CLICK internally. No change needed to this script."
    );
  }

  // -------------------------------------------------------------------------
  // Step 2: Tap the username field.
  // Under TalkBack, a coordinate-based tap only announces the element without
  // activating it. AutoMobile detects TalkBack and issues ACTION_CLICK on the
  // AccessibilityNodeInfo instead, which both moves focus and activates the
  // EditText for input.
  // -------------------------------------------------------------------------
  printStep(2, "Tap username field");
  console.log("Note: Under TalkBack, tapOn issues ACTION_CLICK on the node,");
  console.log("      not a coordinate MotionEvent. The call site is unchanged.");

  const tapUsernameResult = await client.tapOn({ text: "Username" });
  printResult("tapOn result", tapUsernameResult);

  // -------------------------------------------------------------------------
  // Step 3: Observe to verify accessibility focus moved to the username field.
  // This is optional — agents can skip intermediate observes for efficiency.
  // -------------------------------------------------------------------------
  printStep(3, "Observe after tapping username (verify focus moved)");

  const afterTapObserve = await client.observe();
  printResult(
    "accessibilityFocusedElement (should be username EditText)",
    afterTapObserve.accessibilityFocusedElement
  );

  const usernameFocused =
    afterTapObserve.accessibilityFocusedElement?.["resource-id"] ===
    "com.example.app:id/username_input";
  console.log(`\nUsername field has accessibility focus: ${usernameFocused}`);

  // -------------------------------------------------------------------------
  // Step 4: Input username text.
  // ACTION_SET_TEXT works identically in TalkBack and standard mode.
  // No adaptation is needed.
  // -------------------------------------------------------------------------
  printStep(4, "Input username text");
  console.log("Note: inputText uses ACTION_SET_TEXT in both modes.");
  console.log("      No TalkBack-specific adaptation required.");

  const inputUsernameResult = await client.inputText({ text: "user@example.com" });
  printResult("inputText result", inputUsernameResult);

  // -------------------------------------------------------------------------
  // Step 5: Tap the password field.
  // Same ACTION_CLICK adaptation as the username tap.
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
  // Under TalkBack, the button text "Log in" and content-desc "Log in" are the
  // same here, so either tapOn({ text }) or tapOn({ contentDesc }) works.
  // If the button used a merged content-desc (e.g., "Log in, Button, double-tap
  // to activate"), the agent would use contentDesc with substring matching.
  // -------------------------------------------------------------------------
  printStep(7, "Tap login button");
  console.log("Note: For merged TalkBack nodes, use contentDesc instead of text.");
  console.log("      Example: tapOn({ contentDesc: 'Log in' }) would also work here.");

  const tapLoginResult = await client.tapOn({ text: "Log in" });
  printResult("tapOn result", tapLoginResult);

  // -------------------------------------------------------------------------
  // Step 8: Observe to verify successful navigation to the home screen.
  // TalkBack auto-focuses the first element on the new screen; check that the
  // activity changed to confirm login succeeded.
  // -------------------------------------------------------------------------
  printStep(8, "Observe post-login screen to verify navigation");

  const postLoginObserve = await client.observe();
  printResult("activeWindow after login", postLoginObserve.activeWindow);
  printResult(
    "accessibilityFocusedElement on new screen",
    postLoginObserve.accessibilityFocusedElement
  );

  const loginSucceeded =
    postLoginObserve.activeWindow?.activityName === "com.example.app.HomeActivity";
  console.log(`\nLogin succeeded (activity changed to HomeActivity): ${loginSucceeded}`);

  // -------------------------------------------------------------------------
  // Summary
  // -------------------------------------------------------------------------
  console.log("\n" + "=".repeat(60));
  console.log("Demonstration complete.");
  console.log("=".repeat(60));
  console.log();
  console.log("Key takeaways:");
  console.log("  - The agent's call sequence is identical to standard mode.");
  console.log("  - accessibilityState.enabled signals TalkBack is active.");
  console.log("  - accessibilityFocusedElement tracks the TalkBack cursor.");
  console.log("  - tapOn uses ACTION_CLICK internally (transparent to agent).");
  console.log("  - inputText uses ACTION_SET_TEXT in both modes (no change).");
  console.log(
    "  - For merged nodes, use contentDesc: instead of text: in tapOn args."
  );
}

main().catch(error => {
  console.error("Fatal error:", error);
  process.exit(1);
});
