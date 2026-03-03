#!/usr/bin/env bun
/**
 * TalkBack Form Interaction - AutoMobile MCP Tool Demonstration
 *
 * This script demonstrates how an agent fills out a multi-field form while
 * TalkBack is active on Android, including working with an accessibility-merged
 * checkbox node.
 *
 * Key insight — element merging:
 *   Android's accessibility framework allows a parent ViewGroup to merge the
 *   content descriptions of its children into a single node. This is common for
 *   compound controls such as checkboxes with a label. The merged node surfaces
 *   as a single element whose content-desc combines the label text and the
 *   checked state: "Accept terms and conditions, not checked". The child
 *   TextView ("Accept terms") does not appear as a separate element.
 *
 *   When targeting a merged node or a field whose text is empty, use
 *   tapOn({ elementId }) to target by resource-id. tapOn only accepts
 *   text or elementId — contentDesc is not a supported selector.
 *
 * This script is a demonstration — it uses simulated responses to show the
 * expected call sequence and response shapes without requiring a real device.
 *
 * Usage:
 *   bun scripts/talkback-form-interaction.ts
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
  // Name field — standard EditText with a content-desc label.
  const nameField: Element = {
    "bounds": { left: 32, top: 200, right: 688, bottom: 260 },
    "text": "",
    "content-desc": "Full name",
    "resource-id": "com.example.app:id/name_input",
    "class": "android.widget.EditText",
    "clickable": true,
    "focusable": true,
    "focused": false,
    "accessibility-focused": true,
    "enabled": true,
  };

  // Email field.
  const emailField: Element = {
    "bounds": { left: 32, top: 300, right: 688, bottom: 360 },
    "text": "",
    "content-desc": "Email address",
    "resource-id": "com.example.app:id/email_input",
    "class": "android.widget.EditText",
    "clickable": true,
    "focusable": true,
    "focused": false,
    "accessibility-focused": false,
    "enabled": true,
  };

  // Checkbox with element merging.
  //
  // The layout has a parent FrameLayout (importantForAccessibility="yes",
  // screenReaderFocusable="true") containing a CheckBox and a TextView with
  // the label "Accept terms". Because the parent sets
  // android:accessibilityLiveRegion or uses ViewCompat.setAccessibilityDelegate
  // to merge its children, TalkBack treats the whole group as one node.
  //
  // The merged content-desc is constructed by the framework from the child
  // views: label text + checkbox state = "Accept terms and conditions, not
  // checked". The child nodes are NOT visible to AutoMobile observe() when
  // merging is active. Targeting the parent by content-desc is the correct
  // approach.
  const checkboxMerged: Element = {
    "bounds": { left: 32, top: 400, right: 688, bottom: 460 },
    // text is empty because the parent FrameLayout has no text of its own.
    "text": "",
    // content-desc is the merged string produced by the accessibility framework.
    "content-desc": "Accept terms and conditions, not checked",
    "resource-id": "com.example.app:id/terms_checkbox_container",
    "class": "android.widget.FrameLayout",
    "checkable": true,
    "checked": false,
    "clickable": true,
    "focusable": true,
    "focused": false,
    "accessibility-focused": false,
    "enabled": true,
  };

  // Submit button.
  const submitButton: Element = {
    "bounds": { left: 32, top: 520, right: 688, bottom: 580 },
    "text": "Submit",
    "content-desc": "Submit",
    "resource-id": "com.example.app:id/submit_button",
    "class": "android.widget.Button",
    "clickable": true,
    "focusable": true,
    "focused": false,
    "accessibility-focused": false,
    "enabled": true,
  };

  // TalkBack places its cursor on the first focusable element (the name field).
  return {
    updatedAt: Date.now(),
    screenSize: { width: 720, height: 1280 },
    systemInsets: { top: 48, bottom: 80, left: 0, right: 0 },
    accessibilityState: {
      enabled: true,
      service: "talkback",
    },
    accessibilityFocusedElement: nameField,
    elements: {
      clickable: [nameField, emailField, checkboxMerged, submitButton],
      scrollable: [],
      text: [nameField, emailField, checkboxMerged, submitButton],
    },
    activeWindow: {
      packageName: "com.example.app",
      activityName: "com.example.app.RegistrationActivity",
      windowId: 1,
    },
  };
}

function makeCheckboxUncheckedObserve(): ObserveResult {
  // Returned after filling the name and email fields.
  // The checkbox is still unchecked; TalkBack cursor has moved to it.
  const nameField: Element = {
    "bounds": { left: 32, top: 200, right: 688, bottom: 260 },
    "text": "Jane Smith",
    "content-desc": "Full name",
    "resource-id": "com.example.app:id/name_input",
    "class": "android.widget.EditText",
    "clickable": true,
    "focusable": true,
    "focused": false,
    "accessibility-focused": false,
    "enabled": true,
  };

  const emailField: Element = {
    "bounds": { left: 32, top: 300, right: 688, bottom: 360 },
    "text": "jane@example.com",
    "content-desc": "Email address",
    "resource-id": "com.example.app:id/email_input",
    "class": "android.widget.EditText",
    "clickable": true,
    "focusable": true,
    "focused": false,
    "accessibility-focused": false,
    "enabled": true,
  };

  // The checkbox is not yet checked. The content-desc still ends with
  // "not checked". The agent targets this element using the full content-desc
  // string, since text is empty on the merged node.
  const checkboxUnchecked: Element = {
    "bounds": { left: 32, top: 400, right: 688, bottom: 460 },
    "text": "",
    "content-desc": "Accept terms and conditions, not checked",
    "resource-id": "com.example.app:id/terms_checkbox_container",
    "class": "android.widget.FrameLayout",
    "checkable": true,
    "checked": false,
    "clickable": true,
    "focusable": true,
    "focused": false,
    // TalkBack cursor is now on the checkbox container.
    "accessibility-focused": true,
    "enabled": true,
  };

  const submitButton: Element = {
    "bounds": { left: 32, top: 520, right: 688, bottom: 580 },
    "text": "Submit",
    "content-desc": "Submit",
    "resource-id": "com.example.app:id/submit_button",
    "class": "android.widget.Button",
    "clickable": true,
    "focusable": true,
    "focused": false,
    "accessibility-focused": false,
    "enabled": true,
  };

  return {
    updatedAt: Date.now(),
    screenSize: { width: 720, height: 1280 },
    systemInsets: { top: 48, bottom: 80, left: 0, right: 0 },
    accessibilityState: {
      enabled: true,
      service: "talkback",
    },
    accessibilityFocusedElement: checkboxUnchecked,
    elements: {
      clickable: [nameField, emailField, checkboxUnchecked, submitButton],
      scrollable: [],
      text: [nameField, emailField, checkboxUnchecked, submitButton],
    },
    activeWindow: {
      packageName: "com.example.app",
      activityName: "com.example.app.RegistrationActivity",
      windowId: 1,
    },
  };
}

function makeCheckboxCheckedObserve(): ObserveResult {
  // After tapping the checkbox, the framework re-evaluates the merged
  // content-desc. The state suffix changes from "not checked" to "checked".
  // The agent can read this to confirm the tap succeeded without needing to
  // inspect the checked field directly.
  const nameField: Element = {
    "bounds": { left: 32, top: 200, right: 688, bottom: 260 },
    "text": "Jane Smith",
    "content-desc": "Full name",
    "resource-id": "com.example.app:id/name_input",
    "class": "android.widget.EditText",
    "clickable": true,
    "focusable": true,
    "focused": false,
    "accessibility-focused": false,
    "enabled": true,
  };

  const emailField: Element = {
    "bounds": { left: 32, top: 300, right: 688, bottom: 360 },
    "text": "jane@example.com",
    "content-desc": "Email address",
    "resource-id": "com.example.app:id/email_input",
    "class": "android.widget.EditText",
    "clickable": true,
    "focusable": true,
    "focused": false,
    "accessibility-focused": false,
    "enabled": true,
  };

  // content-desc now ends with "checked" — the state has toggled.
  const checkboxChecked: Element = {
    "bounds": { left: 32, top: 400, right: 688, bottom: 460 },
    "text": "",
    "content-desc": "Accept terms and conditions, checked",
    "resource-id": "com.example.app:id/terms_checkbox_container",
    "class": "android.widget.FrameLayout",
    "checkable": true,
    "checked": true,
    "clickable": true,
    "focusable": true,
    "focused": false,
    "accessibility-focused": true,
    "enabled": true,
  };

  const submitButton: Element = {
    "bounds": { left: 32, top: 520, right: 688, bottom: 580 },
    "text": "Submit",
    "content-desc": "Submit",
    "resource-id": "com.example.app:id/submit_button",
    "class": "android.widget.Button",
    "clickable": true,
    "focusable": true,
    "focused": false,
    "accessibility-focused": false,
    "enabled": true,
  };

  return {
    updatedAt: Date.now(),
    screenSize: { width: 720, height: 1280 },
    systemInsets: { top: 48, bottom: 80, left: 0, right: 0 },
    accessibilityState: {
      enabled: true,
      service: "talkback",
    },
    accessibilityFocusedElement: checkboxChecked,
    elements: {
      clickable: [nameField, emailField, checkboxChecked, submitButton],
      scrollable: [],
      text: [nameField, emailField, checkboxChecked, submitButton],
    },
    activeWindow: {
      packageName: "com.example.app",
      activityName: "com.example.app.RegistrationActivity",
      windowId: 1,
    },
  };
}

function makeSuccessScreenObserve(): ObserveResult {
  // After submit, the app navigates to a confirmation screen.
  // TalkBack auto-focuses the first element of the new screen.
  const successHeading: Element = {
    "bounds": { left: 32, top: 280, right: 688, bottom: 340 },
    "text": "Registration successful",
    "content-desc": "Registration successful",
    "resource-id": "com.example.app:id/success_heading",
    "class": "android.widget.TextView",
    "clickable": false,
    "focusable": true,
    "focused": false,
    "accessibility-focused": true,
    "enabled": true,
  };

  const successBody: Element = {
    "bounds": { left: 32, top: 360, right: 688, bottom: 440 },
    "text": "A confirmation email has been sent to jane@example.com.",
    "content-desc": "A confirmation email has been sent to jane@example.com.",
    "resource-id": "com.example.app:id/success_body",
    "class": "android.widget.TextView",
    "clickable": false,
    "focusable": true,
    "focused": false,
    "accessibility-focused": false,
    "enabled": true,
  };

  return {
    updatedAt: Date.now(),
    screenSize: { width: 720, height: 1280 },
    systemInsets: { top: 48, bottom: 80, left: 0, right: 0 },
    accessibilityState: {
      enabled: true,
      service: "talkback",
    },
    accessibilityFocusedElement: successHeading,
    elements: {
      clickable: [],
      scrollable: [],
      text: [successHeading, successBody],
    },
    activeWindow: {
      packageName: "com.example.app",
      activityName: "com.example.app.SuccessActivity",
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
      // 1 = initial form screen (name field focused)
      // 2 = after filling name + email (checkbox now focused)
      // 3 = after tapping checkbox (checkbox now checked)
      // 4 = after tapping submit (success screen)
      if (observeCallCount === 1) {
        return makeFormScreenObserve();
      } else if (observeCallCount === 2) {
        return makeCheckboxUncheckedObserve();
      } else if (observeCallCount === 3) {
        return makeCheckboxCheckedObserve();
      } else {
        return makeSuccessScreenObserve();
      }
    },

    async tapOn(args: TapOnArgs): Promise<{ success: boolean; message: string }> {
      // Under TalkBack, tapOn issues ACTION_CLICK on the AccessibilityNodeInfo.
      // tapOn only accepts text or elementId. For nodes with empty text (merged
      // nodes, hint-only fields), use elementId (resource-id) to target them.
      return {
        success: true,
        message: `Tapped element (TalkBack: ACTION_CLICK on node): ${JSON.stringify(args)}`,
      };
    },

    async inputText(args: InputTextArgs): Promise<{ success: boolean; message: string }> {
      // inputText uses ACTION_SET_TEXT in both TalkBack and standard modes.
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
  console.log("TalkBack Form Interaction - AutoMobile MCP Tool Demonstration");
  console.log("=".repeat(60));
  console.log();
  console.log("Scenario: Fill a registration form with name, email, a merged");
  console.log("checkbox, and a submit button while TalkBack is active.");
  console.log("Demonstrates element merging: the checkbox surfaces as a single");
  console.log("node with a content-desc that includes the checked state.");

  const client = createMockClient();

  // -------------------------------------------------------------------------
  // Step 1: Observe the initial form screen.
  // -------------------------------------------------------------------------
  printStep(1, "Observe initial form screen");

  const initialObserve = await client.observe();

  printResult("accessibilityState", initialObserve.accessibilityState);
  printResult("accessibilityFocusedElement", initialObserve.accessibilityFocusedElement);

  console.log("\nClickable elements on screen:");
  for (const el of initialObserve.elements?.clickable ?? []) {
    const desc = el["content-desc"] ?? "";
    console.log(
      `  [${el["resource-id"]}]  text="${el.text ?? ""}"  content-desc="${desc}"`
    );
  }

  if (initialObserve.accessibilityState?.enabled) {
    console.log(
      `\nNote: TalkBack is ACTIVE (service: ${initialObserve.accessibilityState.service}).`
    );
    console.log("      tapOn uses ACTION_CLICK; inputText uses ACTION_SET_TEXT.");
  }

  // Locate the checkbox in the initial observe and highlight the merged node.
  const checkboxInitial = (initialObserve.elements?.clickable ?? []).find(el =>
    el["content-desc"]?.includes("Accept terms")
  );
  if (checkboxInitial) {
    console.log("\nMerged checkbox node detected:");
    console.log(`  content-desc: "${checkboxInitial["content-desc"] ?? ""}"`);
    console.log(`  text:         "${checkboxInitial.text ?? ""}"`);
    console.log(
      "  Note: text is empty. Use elementId (resource-id) to target this element in tapOn."
    );
  }

  // -------------------------------------------------------------------------
  // Step 2: Tap the name field and enter the name.
  // -------------------------------------------------------------------------
  printStep(2, "Tap name field");

  // text is empty on this input; use elementId (resource-id) instead
  const tapNameResult = await client.tapOn({ elementId: "com.example.app:id/name_input" });
  printResult("tapOn result", tapNameResult);

  printStep(3, "Enter name");

  const inputNameResult = await client.inputText({ text: "Jane Smith" });
  printResult("inputText result", inputNameResult);

  // -------------------------------------------------------------------------
  // Step 3: Tap the email field and enter the email address.
  // -------------------------------------------------------------------------
  printStep(4, "Tap email field");

  // text is empty on this input; use elementId (resource-id) instead
  const tapEmailResult = await client.tapOn({ elementId: "com.example.app:id/email_input" });
  printResult("tapOn result", tapEmailResult);

  printStep(5, "Enter email address");

  const inputEmailResult = await client.inputText({ text: "jane@example.com" });
  printResult("inputText result", inputEmailResult);

  // -------------------------------------------------------------------------
  // Step 4: Observe to read the current checkbox state before tapping it.
  // This observe is useful to confirm the current content-desc so the agent
  // can construct the correct tapOn argument and verify the state afterward.
  // -------------------------------------------------------------------------
  printStep(6, "Observe form to read checkbox content-desc before tapping");

  const midFormObserve = await client.observe();

  const checkboxBeforeTap = (midFormObserve.elements?.clickable ?? []).find(el =>
    el["content-desc"]?.includes("Accept terms")
  );

  if (!checkboxBeforeTap) {
    console.error("\nError: checkbox element not found in elements.clickable. Aborting.");
    process.exit(1);
  }

  printResult("checkbox element (before tap)", checkboxBeforeTap);
  console.log();
  console.log("Element merging explanation:");
  console.log("  The parent FrameLayout merges its children (a CheckBox and a");
  console.log("  label TextView) into this single accessibility node. The child");
  console.log('  TextView "Accept terms" does NOT appear separately in observe().');
  console.log("  The framework builds the content-desc from the label and the");
  console.log("  current checked state. text is empty on the merged node.");
  console.log("  Use elementId (resource-id) to target it reliably with tapOn.");

  // -------------------------------------------------------------------------
  // Step 5: Tap the checkbox using elementId.
  // tapOn only accepts text or elementId. Since the merged node's text field
  // is empty, use elementId (the node's resource-id) to target it.
  // The resource-id is stable regardless of how the content-desc changes with
  // checked/unchecked state, making it the most reliable selector here.
  // -------------------------------------------------------------------------
  printStep(7, "Tap merged checkbox node using elementId");
  console.log("Note: text is empty on merged nodes. Use elementId (resource-id)");
  console.log("      to target them — tapOn does not accept contentDesc.");
  console.log(
    `      Target resource-id: "${checkboxBeforeTap["resource-id"] ?? ""}"`
  );

  const tapCheckboxResult = await client.tapOn({
    elementId: checkboxBeforeTap["resource-id"],
  });
  printResult("tapOn result", tapCheckboxResult);

  // -------------------------------------------------------------------------
  // Step 6: Observe to verify the checkbox is now checked.
  // The framework updates the merged content-desc to reflect the new state.
  // The suffix changes from "not checked" to "checked".
  // -------------------------------------------------------------------------
  printStep(8, "Observe to verify checkbox is now checked");

  const afterCheckboxObserve = await client.observe();

  const checkboxAfterTap = (afterCheckboxObserve.elements?.clickable ?? []).find(el =>
    el["content-desc"]?.includes("Accept terms")
  );

  if (!checkboxAfterTap) {
    console.error("\nError: checkbox element not found after tap. Aborting.");
    process.exit(1);
  }

  printResult("checkbox element (after tap)", checkboxAfterTap);

  // The content-desc suffix indicates state. Parse it to verify the toggle.
  const isChecked =
    checkboxAfterTap["content-desc"]?.includes(", checked") === true &&
    !checkboxAfterTap["content-desc"]?.includes("not checked");
  console.log(`\nCheckbox is now checked (inferred from content-desc): ${isChecked}`);

  if (!isChecked) {
    console.error("Error: checkbox did not toggle to checked state. Aborting.");
    process.exit(1);
  }

  // -------------------------------------------------------------------------
  // Step 7: Tap the submit button.
  // -------------------------------------------------------------------------
  printStep(9, "Tap submit button");

  const tapSubmitResult = await client.tapOn({ text: "Submit" });
  printResult("tapOn result", tapSubmitResult);

  // -------------------------------------------------------------------------
  // Step 8: Observe to confirm the success screen loaded.
  // -------------------------------------------------------------------------
  printStep(10, "Observe success screen — verify submission succeeded");

  const successObserve = await client.observe();
  printResult("activeWindow after submit", successObserve.activeWindow);
  printResult(
    "accessibilityFocusedElement on success screen",
    successObserve.accessibilityFocusedElement
  );

  const submissionSucceeded =
    successObserve.activeWindow?.activityName === "com.example.app.SuccessActivity";
  console.log(`\nForm submission succeeded (activity is SuccessActivity): ${submissionSucceeded}`);

  // -------------------------------------------------------------------------
  // Summary
  // -------------------------------------------------------------------------
  console.log("\n" + "=".repeat(60));
  console.log("Demonstration complete.");
  console.log("=".repeat(60));
  console.log();
  console.log("Key takeaways:");
  console.log("  - The agent's call sequence is identical to standard mode.");
  console.log("  - tapOn uses ACTION_CLICK internally (transparent to agent).");
  console.log("  - inputText uses ACTION_SET_TEXT in both modes (no change).");
  console.log("  - Merged nodes expose a combined content-desc, not child text.");
  console.log("  - Use tapOn({ elementId }) to target merged nodes (text is empty on them).");
  console.log("  - Checkbox state is reflected in the content-desc suffix");
  console.log('    ("not checked" vs "checked") — read it to verify toggle.');
  console.log("  - accessibilityFocusedElement tracks TalkBack cursor position.");
}

main().catch(error => {
  console.error("Fatal error:", error);
  process.exit(1);
});
