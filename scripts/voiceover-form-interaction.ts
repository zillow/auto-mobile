#!/usr/bin/env bun
/**
 * VoiceOver Form Interaction - AutoMobile MCP Tool Demonstration
 *
 * This script demonstrates how an agent fills out a multi-field form while
 * VoiceOver is active on iOS, including working with an accessibility-grouped
 * toggle node.
 *
 * Key insight — element grouping:
 *   iOS accessibility framework allows a parent UIView to group multiple
 *   child elements into a single accessible node. This is common for compound
 *   controls such as UISwitch with a label. The grouped node surfaces as a
 *   single element whose content-desc combines the label and the switch state:
 *   "Accept terms and conditions, off". The child UILabel ("Accept terms") does
 *   not appear as a separate accessible element.
 *
 *   When targeting a grouped node or a field whose text is empty (e.g. an
 *   empty UITextField), use tapOn({ elementId }) to target by resource-id.
 *   tapOn accepts text, elementId, or contentDesc.
 *
 * VoiceOver vs TalkBack differences relevant to this flow:
 *   - Toggle state is expressed in VoiceOver labels: "off" / "on"
 *     (TalkBack expresses it as "not checked" / "checked")
 *   - Element class names are UIKit types (UISwitch, UITextField, etc.)
 *   - accessibilityFocusedElement is NOT present for iOS
 *
 * This script is a demonstration — it uses simulated responses to show the
 * expected call sequence and response shapes without requiring a real device.
 *
 * Usage:
 *   bun scripts/voiceover-form-interaction.ts
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

function makeFormScreenObserve(): ObserveResult {
  const nameField: Element = {
    "bounds": { left: 16, top: 120, right: 374, bottom: 164 },
    "text": "",
    "content-desc": "Full name",
    "resource-id": "nameInput",
    "class": "UITextField",
    "clickable": true,
    "focusable": true,
    "focused": false,
    "enabled": true,
  };

  const emailField: Element = {
    "bounds": { left: 16, top: 184, right: 374, bottom: 228 },
    "text": "",
    "content-desc": "Email address",
    "resource-id": "emailInput",
    "class": "UITextField",
    "clickable": true,
    "focusable": true,
    "focused": false,
    "enabled": true,
  };

  // UISwitch grouped with its label.
  // VoiceOver exposes this as a single accessible node whose content-desc
  // includes both the label text and the switch state ("off" or "on").
  // The child UILabel is not accessible separately.
  const termsToggle: Element = {
    "bounds": { left: 16, top: 280, right: 374, bottom: 328 },
    "text": "",
    "content-desc": "Accept terms and conditions, off",
    "resource-id": "termsToggle",
    "class": "UISwitch",
    "clickable": true,
    "focusable": true,
    "focused": false,
    "checked": false,
    "enabled": true,
  };

  const submitButton: Element = {
    "bounds": { left: 16, top: 380, right: 374, bottom: 424 },
    "text": "Submit",
    "content-desc": "Submit",
    "resource-id": "submitButton",
    "class": "UIButton",
    "clickable": true,
    "focusable": true,
    "focused": false,
    "enabled": false, // Disabled until terms are accepted
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
      clickable: [nameField, emailField, termsToggle],
      scrollable: [],
      text: [nameField, emailField, termsToggle, submitButton],
    },
    activeWindow: {
      packageName: "com.example.app",
      activityName: "RegistrationViewController",
      windowId: 1,
    },
  };
}

function makeAfterNameInputObserve(): ObserveResult {
  const nameField: Element = {
    "bounds": { left: 16, top: 120, right: 374, bottom: 164 },
    "text": "Jane Smith",
    "content-desc": "Full name",
    "resource-id": "nameInput",
    "class": "UITextField",
    "clickable": true,
    "focusable": true,
    "focused": true,
    "enabled": true,
  };

  const emailField: Element = {
    "bounds": { left: 16, top: 184, right: 374, bottom: 228 },
    "text": "",
    "content-desc": "Email address",
    "resource-id": "emailInput",
    "class": "UITextField",
    "clickable": true,
    "focusable": true,
    "focused": false,
    "enabled": true,
  };

  const termsToggle: Element = {
    "bounds": { left: 16, top: 280, right: 374, bottom: 328 },
    "text": "",
    "content-desc": "Accept terms and conditions, off",
    "resource-id": "termsToggle",
    "class": "UISwitch",
    "clickable": true,
    "focusable": true,
    "focused": false,
    "checked": false,
    "enabled": true,
  };

  const submitButton: Element = {
    "bounds": { left: 16, top: 380, right: 374, bottom: 424 },
    "text": "Submit",
    "content-desc": "Submit",
    "resource-id": "submitButton",
    "class": "UIButton",
    "clickable": true,
    "focusable": false,
    "focused": false,
    "enabled": false,
  };

  return {
    updatedAt: Date.now(),
    screenSize: { width: 390, height: 844 },
    systemInsets: { top: 59, bottom: 34, left: 0, right: 0 },
    accessibilityState: {
      enabled: true,
      service: "voiceover",
    },
    focusedElement: nameField,
    elements: {
      clickable: [nameField, emailField, termsToggle],
      scrollable: [],
      text: [nameField, emailField, termsToggle, submitButton],
    },
    activeWindow: {
      packageName: "com.example.app",
      activityName: "RegistrationViewController",
      windowId: 1,
    },
  };
}

function makeAfterTermsToggleObserve(): ObserveResult {
  const nameField: Element = {
    "bounds": { left: 16, top: 120, right: 374, bottom: 164 },
    "text": "Jane Smith",
    "content-desc": "Full name",
    "resource-id": "nameInput",
    "class": "UITextField",
    "clickable": true,
    "focusable": true,
    "focused": false,
    "enabled": true,
  };

  const emailField: Element = {
    "bounds": { left: 16, top: 184, right: 374, bottom: 228 },
    "text": "jane@example.com",
    "content-desc": "Email address",
    "resource-id": "emailInput",
    "class": "UITextField",
    "clickable": true,
    "focusable": true,
    "focused": false,
    "enabled": true,
  };

  // Toggle state changed: content-desc now includes "on" instead of "off"
  const termsToggle: Element = {
    "bounds": { left: 16, top: 280, right: 374, bottom: 328 },
    "text": "",
    "content-desc": "Accept terms and conditions, on",
    "resource-id": "termsToggle",
    "class": "UISwitch",
    "clickable": true,
    "focusable": true,
    "focused": false,
    "checked": true,
    "enabled": true,
  };

  // Submit button is now enabled after accepting terms
  const submitButton: Element = {
    "bounds": { left: 16, top: 380, right: 374, bottom: 424 },
    "text": "Submit",
    "content-desc": "Submit",
    "resource-id": "submitButton",
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
    accessibilityState: {
      enabled: true,
      service: "voiceover",
    },
    elements: {
      clickable: [nameField, emailField, termsToggle, submitButton],
      scrollable: [],
      text: [nameField, emailField, termsToggle, submitButton],
    },
    activeWindow: {
      packageName: "com.example.app",
      activityName: "RegistrationViewController",
      windowId: 1,
    },
  };
}

function makeConfirmationObserve(): ObserveResult {
  const confirmationLabel: Element = {
    "bounds": { left: 16, top: 200, right: 374, bottom: 280 },
    "text": "Registration complete",
    "content-desc": "Registration complete",
    "resource-id": "confirmationLabel",
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
      text: [confirmationLabel],
    },
    activeWindow: {
      packageName: "com.example.app",
      activityName: "ConfirmationViewController",
      windowId: 2,
    },
  };
}

// ---------------------------------------------------------------------------
// Simulated MCP client
// ---------------------------------------------------------------------------

function createMockClient(): MockClient {
  let observeCallCount = 0;

  return {
    async observe(): Promise<ObserveResult> {
      observeCallCount++;
      if (observeCallCount === 1) {
        return makeFormScreenObserve();
      } else if (observeCallCount === 2) {
        return makeAfterNameInputObserve();
      } else if (observeCallCount === 3) {
        return makeAfterTermsToggleObserve();
      } else {
        return makeConfirmationObserve();
      }
    },

    async tapOn(args: TapOnArgs): Promise<{ success: boolean; message: string }> {
      return {
        success: true,
        message: `Tapped element (VoiceOver: accessibility activation): ${JSON.stringify(args)}`,
      };
    },

    async inputText(args: InputTextArgs): Promise<{ success: boolean; message: string }> {
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
  console.log("VoiceOver Form Interaction - AutoMobile MCP Tool Demonstration");
  console.log("=".repeat(60));
  console.log();
  console.log("Scenario: Fill out a registration form with a grouped UISwitch toggle");
  console.log("while VoiceOver is active on iOS.");

  const client = createMockClient();

  // -------------------------------------------------------------------------
  // Step 1: Observe the form.
  // -------------------------------------------------------------------------
  printStep(1, "Observe form screen");

  const formObserve = await client.observe();
  printResult("accessibilityState", formObserve.accessibilityState);

  console.log("\nForm elements:");
  for (const el of formObserve.elements?.text ?? []) {
    const state = el.checked !== undefined
      ? ` [checked: ${el.checked}]`
      : el.enabled === false ? " [disabled]" : "";
    console.log(
      `  [${el["resource-id"]}]  class=${el["class"]}  content-desc="${el["content-desc"] ?? el.text ?? ""}"${state}`
    );
  }

  // -------------------------------------------------------------------------
  // Step 2: Tap and fill the name field.
  // -------------------------------------------------------------------------
  printStep(2, "Tap name field and enter name");
  console.log("Using elementId for a field with empty text (to avoid ambiguity).");

  await client.tapOn({ elementId: "nameInput" });
  const inputNameResult = await client.inputText({ text: "Jane Smith" });
  printResult("inputText result", inputNameResult);

  // -------------------------------------------------------------------------
  // Step 3: Verify name was entered.
  // -------------------------------------------------------------------------
  printStep(3, "Observe to verify name field updated");

  const afterNameObserve = await client.observe();
  const nameField = afterNameObserve.elements?.text?.find(
    el => el["resource-id"] === "nameInput"
  );
  console.log(`Name field text: "${nameField?.text ?? "not found"}"`);

  // -------------------------------------------------------------------------
  // Step 4: Tap and fill the email field.
  // -------------------------------------------------------------------------
  printStep(4, "Tap email field and enter email");

  await client.tapOn({ elementId: "emailInput" });
  await client.inputText({ text: "jane@example.com" });

  // -------------------------------------------------------------------------
  // Step 5: Toggle the terms UISwitch.
  //
  // The UISwitch is grouped with its label into a single accessible node.
  // Its content-desc is "Accept terms and conditions, off" (VoiceOver appends
  // the state "off" or "on" to grouped UISwitch labels).
  //
  // Do NOT target by text — the UILabel child is not accessible separately.
  // Target by elementId (resource-id) for grouped controls.
  //
  // VoiceOver vs TalkBack note: TalkBack expresses toggle state as
  // "not checked" / "checked". VoiceOver uses "off" / "on".
  // -------------------------------------------------------------------------
  printStep(5, "Toggle the terms UISwitch");
  console.log("Note: UISwitch is grouped with its label into a single accessible node.");
  console.log("      content-desc is 'Accept terms and conditions, off'.");
  console.log("      Use elementId to target a grouped control — text targets the");
  console.log("      child label which is not accessible separately.");
  console.log("      VoiceOver expresses state as 'off'/'on'; TalkBack uses 'not checked'/'checked'.");

  const tapToggleResult = await client.tapOn({ elementId: "termsToggle" });
  printResult("tapOn result (toggle)", tapToggleResult);

  // -------------------------------------------------------------------------
  // Step 6: Verify toggle state changed.
  // -------------------------------------------------------------------------
  printStep(6, "Observe to verify toggle state");

  const afterToggleObserve = await client.observe();
  const toggleElement = afterToggleObserve.elements?.text?.find(
    el => el["resource-id"] === "termsToggle"
  );
  console.log(`Toggle content-desc: "${toggleElement?.["content-desc"] ?? "not found"}"`);
  console.log(`Toggle checked: ${toggleElement?.checked}`);

  const submitButton = afterToggleObserve.elements?.text?.find(
    el => el["resource-id"] === "submitButton"
  );
  console.log(`Submit button enabled: ${submitButton?.enabled ?? false}`);

  // -------------------------------------------------------------------------
  // Step 7: Submit the form.
  // -------------------------------------------------------------------------
  printStep(7, "Tap Submit button");

  const submitResult = await client.tapOn({ text: "Submit" });
  printResult("tapOn result (submit)", submitResult);

  // -------------------------------------------------------------------------
  // Step 8: Verify navigation to confirmation screen.
  // -------------------------------------------------------------------------
  printStep(8, "Observe confirmation screen");

  const confirmObserve = await client.observe();
  printResult("activeWindow", confirmObserve.activeWindow);

  const confirmed = confirmObserve.activeWindow?.activityName === "ConfirmationViewController";
  const confirmText = confirmObserve.elements?.text?.[0]?.text;
  console.log(`\nNavigated to ConfirmationViewController: ${confirmed}`);
  console.log(`Confirmation message: "${confirmText ?? "not found"}"`);

  // -------------------------------------------------------------------------
  // Summary
  // -------------------------------------------------------------------------
  console.log("\n" + "=".repeat(60));
  console.log("Demonstration complete.");
  console.log("=".repeat(60));
  console.log();
  console.log("Key takeaways:");
  console.log("  - UISwitch grouped with a label → use elementId, not text.");
  console.log("  - VoiceOver expresses UISwitch state as 'off'/'on' in content-desc.");
  console.log("    (TalkBack uses 'not checked'/'checked').");
  console.log("  - inputText is unchanged in VoiceOver mode.");
  console.log("  - tapOn uses accessibility activation (transparent to agent).");
  console.log("  - accessibilityFocusedElement is absent on iOS; use focusedElement");
  console.log("    to verify input focus, and observe().elements to confirm state.");
}

main().catch(error => {
  console.error("Fatal error:", error);
  process.exit(1);
});
