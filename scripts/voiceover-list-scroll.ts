#!/usr/bin/env bun
/**
 * VoiceOver List Scroll - AutoMobile MCP Tool Demonstration
 *
 * This script demonstrates how an agent scrolls a UITableView/UICollectionView
 * to find an off-screen item while VoiceOver is active on iOS.
 *
 * Key insight: swipeOn with a lookFor argument causes AutoMobile to issue
 * an accessibility scroll_forward action on the container's AXUIElement rather
 * than injecting a single-finger swipe gesture. Under VoiceOver, single-finger
 * swipes are intercepted by the screen reader for cursor navigation, so a
 * gesture-based scroll would move the VoiceOver cursor rather than scroll
 * the list. The accessibility scroll action is not intercepted by VoiceOver
 * and scrolls the list correctly.
 *
 * When no container can be identified, AutoMobile falls back to a three-finger
 * swipe, which is VoiceOver's content-scroll gesture. Providing an explicit
 * container selector avoids this fallback and is more reliable.
 *
 * This script is a demonstration — it uses simulated responses to show the
 * expected call sequence and response shapes without requiring a real device.
 *
 * Usage:
 *   bun scripts/voiceover-list-scroll.ts
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

interface SwipeOnArgs {
  container?: { elementId: string } | { text: string };
  direction: "up" | "down" | "left" | "right";
  lookFor?: { elementId: string } | { text: string };
}

interface MockClient {
  observe(): Promise<ObserveResult>;
  tapOn(args: TapOnArgs): Promise<{ success: boolean; message: string }>;
  swipeOn(args: SwipeOnArgs): Promise<{ success: boolean; message: string }>;
}

// ---------------------------------------------------------------------------
// Simulated responses representing what the MCP server would return
// ---------------------------------------------------------------------------

function makeInitialListObserve(): ObserveResult {
  // Initial state: list visible, items 1–10 on screen, item 27 off-screen.
  const listContainer: Element = {
    "bounds": { left: 0, top: 59, right: 390, bottom: 810 },
    "text": "",
    "content-desc": "",
    "resource-id": "itemList",
    "class": "UITableView",
    "clickable": false,
    "focusable": false,
    "scrollable": true,
    "enabled": true,
  };

  const visibleItems: Element[] = Array.from({ length: 10 }, (_, i) => ({
    "bounds": { left: 0, top: 59 + i * 75, right: 390, bottom: 59 + (i + 1) * 75 },
    "text": `Item ${i + 1}`,
    "content-desc": `Item ${i + 1}`,
    "resource-id": `item_${i + 1}`,
    "class": "UITableViewCell",
    "clickable": true,
    "focusable": true,
    "focused": false,
    "enabled": true,
  }));

  return {
    updatedAt: Date.now(),
    screenSize: { width: 390, height: 844 },
    systemInsets: { top: 59, bottom: 34, left: 0, right: 0 },
    accessibilityState: {
      enabled: true,
      service: "voiceover",
    },
    elements: {
      clickable: visibleItems,
      scrollable: [listContainer],
      text: visibleItems,
    },
    activeWindow: {
      packageName: "com.example.app",
      activityName: "ItemListViewController",
      windowId: 1,
    },
  };
}

function makeAfterScrollObserve(): ObserveResult {
  // After accessibility scroll_forward, the list has scrolled and item 27
  // is now visible on screen.
  const listContainer: Element = {
    "bounds": { left: 0, top: 59, right: 390, bottom: 810 },
    "text": "",
    "content-desc": "",
    "resource-id": "itemList",
    "class": "UITableView",
    "clickable": false,
    "focusable": false,
    "scrollable": true,
    "enabled": true,
  };

  // Items 22–31 are now visible
  const visibleItems: Element[] = Array.from({ length: 10 }, (_, i) => ({
    "bounds": { left: 0, top: 59 + i * 75, right: 390, bottom: 59 + (i + 1) * 75 },
    "text": `Item ${i + 22}`,
    "content-desc": `Item ${i + 22}`,
    "resource-id": `item_${i + 22}`,
    "class": "UITableViewCell",
    "clickable": true,
    "focusable": true,
    "focused": false,
    "enabled": true,
  }));

  return {
    updatedAt: Date.now(),
    screenSize: { width: 390, height: 844 },
    systemInsets: { top: 59, bottom: 34, left: 0, right: 0 },
    accessibilityState: {
      enabled: true,
      service: "voiceover",
    },
    elements: {
      clickable: visibleItems,
      scrollable: [listContainer],
      text: visibleItems,
    },
    activeWindow: {
      packageName: "com.example.app",
      activityName: "ItemListViewController",
      windowId: 1,
    },
  };
}

function makeItemDetailObserve(): ObserveResult {
  const titleLabel: Element = {
    "bounds": { left: 16, top: 100, right: 374, bottom: 140 },
    "text": "Item 27",
    "content-desc": "Item 27",
    "resource-id": "detailTitle",
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
      text: [titleLabel],
    },
    activeWindow: {
      packageName: "com.example.app",
      activityName: "ItemDetailViewController",
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
        return makeInitialListObserve();
      } else if (observeCallCount === 2) {
        return makeAfterScrollObserve();
      } else {
        return makeItemDetailObserve();
      }
    },

    async swipeOn(args: SwipeOnArgs): Promise<{ success: boolean; message: string }> {
      // Under VoiceOver, swipeOn with a container uses scroll_forward/backward
      // accessibility actions on the container's AXUIElement.
      // Without a container, it falls back to a three-finger swipe.
      const strategy = "container" in args
        ? "accessibility scroll_forward on container"
        : "3-finger swipe fallback";
      return {
        success: true,
        message: `Scrolled (VoiceOver: ${strategy}): ${JSON.stringify(args)}`,
      };
    },

    async tapOn(args: TapOnArgs): Promise<{ success: boolean; message: string }> {
      return {
        success: true,
        message: `Tapped element (VoiceOver: accessibility activation): ${JSON.stringify(args)}`,
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
  console.log("VoiceOver List Scroll - AutoMobile MCP Tool Demonstration");
  console.log("=".repeat(60));
  console.log();
  console.log("Scenario: Scroll a UITableView to find Item 27 while VoiceOver");
  console.log("is active on iOS. The agent's call sequence is unchanged.");

  const client = createMockClient();

  // -------------------------------------------------------------------------
  // Step 1: Observe to confirm VoiceOver state and check the list.
  // -------------------------------------------------------------------------
  printStep(1, "Observe initial list state");

  const initialObserve = await client.observe();
  printResult("accessibilityState", initialObserve.accessibilityState);

  const visibleTexts = initialObserve.elements?.text?.map(el => el.text) ?? [];
  console.log(`\nVisible items: ${visibleTexts.join(", ")}`);

  const item27Visible = initialObserve.elements?.clickable?.some(
    el => el.text === "Item 27"
  ) ?? false;
  console.log(`Item 27 already visible: ${item27Visible}`);

  // -------------------------------------------------------------------------
  // Step 2: Scroll the list to find Item 27.
  //
  // swipeOn with a container and lookFor causes AutoMobile to:
  //   1. Locate the container element by elementId
  //   2. Issue scroll_forward accessibility actions on the container
  //      (not single-finger swipe gestures, which VoiceOver intercepts)
  //   3. Repeat until Item 27 appears in the view hierarchy
  //
  // Providing an explicit container is recommended when VoiceOver is active.
  // Without it, AutoMobile falls back to a three-finger swipe which may be
  // less reliable in nested scroll views.
  // -------------------------------------------------------------------------
  printStep(2, "Scroll list to find Item 27");
  console.log("Note: Under VoiceOver, swipeOn with a container uses accessibility");
  console.log("      scroll_forward on the AXUIElement — not a single-finger swipe.");
  console.log("      Single-finger swipes are intercepted by VoiceOver for cursor");
  console.log("      navigation and would not scroll the list.");

  const scrollResult = await client.swipeOn({
    container: { elementId: "itemList" },
    direction: "up",
    lookFor: { text: "Item 27" },
  });
  printResult("swipeOn result", scrollResult);

  // -------------------------------------------------------------------------
  // Step 3: Observe to verify Item 27 is now visible.
  // -------------------------------------------------------------------------
  printStep(3, "Observe to confirm Item 27 is visible");

  const afterScrollObserve = await client.observe();
  const afterScrollTexts = afterScrollObserve.elements?.text?.map(el => el.text) ?? [];
  console.log(`\nVisible items after scroll: ${afterScrollTexts.join(", ")}`);

  const item27NowVisible = afterScrollObserve.elements?.clickable?.some(
    el => el.text === "Item 27"
  ) ?? false;
  console.log(`Item 27 now visible: ${item27NowVisible}`);

  // -------------------------------------------------------------------------
  // Step 4: Tap Item 27 to open its detail view.
  // -------------------------------------------------------------------------
  printStep(4, "Tap Item 27");

  const tapResult = await client.tapOn({ text: "Item 27" });
  printResult("tapOn result", tapResult);

  // -------------------------------------------------------------------------
  // Step 5: Observe to verify navigation to the detail view.
  // -------------------------------------------------------------------------
  printStep(5, "Observe detail view after tap");

  const detailObserve = await client.observe();
  printResult("activeWindow", detailObserve.activeWindow);

  const navigatedToDetail =
    detailObserve.activeWindow?.activityName === "ItemDetailViewController";
  console.log(`\nNavigated to detail view: ${navigatedToDetail}`);

  const detailTitle = detailObserve.elements?.text?.find(
    el => el["resource-id"] === "detailTitle"
  );
  console.log(`Detail title: "${detailTitle?.text ?? "not found"}"`);

  // -------------------------------------------------------------------------
  // Summary
  // -------------------------------------------------------------------------
  console.log("\n" + "=".repeat(60));
  console.log("Demonstration complete.");
  console.log("=".repeat(60));
  console.log();
  console.log("Key takeaways:");
  console.log("  - swipeOn with container uses accessibility scroll_forward.");
  console.log("  - Single-finger swipes would move VoiceOver cursor, not scroll.");
  console.log("  - Providing a container elementId is preferred over relying on");
  console.log("    the three-finger swipe fallback.");
  console.log("  - Locate the target in observe().elements (not accessibilityFocusedElement,");
  console.log("    which is absent on iOS).");
  console.log("  - tapOn uses accessibility activation (transparent to agent).");
}

main().catch(error => {
  console.error("Fatal error:", error);
  process.exit(1);
});
