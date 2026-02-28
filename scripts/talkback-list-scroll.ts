#!/usr/bin/env bun
/**
 * TalkBack List Scroll - AutoMobile MCP Tool Demonstration
 *
 * This script demonstrates how an agent scrolls a RecyclerView list to find an
 * off-screen item while TalkBack is active on Android.
 *
 * Key insight: swipeOn with a lookFor argument causes AutoMobile to issue
 * ACTION_SCROLL_FORWARD on the RecyclerView's AccessibilityNodeInfo rather than
 * injecting a single-finger swipe gesture. Under TalkBack, single-finger swipes
 * are intercepted by the screen reader for cursor navigation, so a gesture-based
 * scroll would move the TalkBack cursor rather than scroll the list. The
 * ACTION_SCROLL_FORWARD accessibility action is not intercepted by TalkBack and
 * scrolls the list correctly.
 *
 * After scrolling, TalkBack focus may remain on an element that has scrolled off
 * screen. This is normal TalkBack behavior. The agent should locate the target
 * element in observe().elements rather than relying on accessibilityFocusedElement
 * to confirm the target is now visible.
 *
 * This script is a demonstration — it uses simulated responses to show the
 * expected call sequence and response shapes without requiring a real device.
 *
 * Usage:
 *   bun scripts/talkback-list-scroll.ts
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

interface SwipeOnArgs {
  // The element to swipe on (typically the scrollable container).
  resourceId?: string;
  text?: string;
  // Direction of scroll — "up" scrolls content upward (ACTION_SCROLL_FORWARD).
  direction: "up" | "down" | "left" | "right";
  // When provided, AutoMobile repeats the scroll action until this element
  // becomes visible in the hierarchy or a retry limit is reached.
  lookFor?: {
    text?: string;
    resourceId?: string;
    contentDesc?: string;
  };
}

interface MockClient {
  observe(): Promise<ObserveResult>;
  tapOn(args: TapOnArgs): Promise<{ success: boolean; message: string }>;
  swipeOn(args: SwipeOnArgs): Promise<{ success: boolean; message: string }>;
}

// ---------------------------------------------------------------------------
// Simulated responses representing what the MCP server would return
// ---------------------------------------------------------------------------

function makeListScreenObserve(): ObserveResult {
  // The list shows items 1–5. Item 15 exists but is off-screen below.
  const makeListItem = (n: number, accessibilityFocused: boolean): Element => ({
    bounds: { left: 0, top: 80 + (n - 1) * 100, right: 720, bottom: 160 + (n - 1) * 100 },
    text: `Item ${n}`,
    "content-desc": `Item ${n}`,
    "resource-id": `com.example.app:id/list_item_${n}`,
    "class": "android.widget.LinearLayout",
    clickable: true,
    focusable: true,
    focused: false,
    "accessibility-focused": accessibilityFocused,
    enabled: true,
  });

  const recyclerView: Element = {
    bounds: { left: 0, top: 80, right: 720, bottom: 1200 },
    text: undefined,
    "content-desc": undefined,
    "resource-id": "com.example.app:id/item_list",
    "class": "androidx.recyclerview.widget.RecyclerView",
    clickable: false,
    focusable: false,
    focused: false,
    "accessibility-focused": false,
    scrollable: true,
    enabled: true,
  };

  const visibleItems = [1, 2, 3, 4, 5].map(n => makeListItem(n, n === 1));

  // TalkBack places its cursor on Item 1 when the screen loads.
  return {
    updatedAt: Date.now(),
    screenSize: { width: 720, height: 1280 },
    systemInsets: { top: 48, bottom: 80, left: 0, right: 0 },
    // TalkBack is active. The agent does not need to change its tool calls;
    // AutoMobile adapts swipeOn to use ACTION_SCROLL_FORWARD internally.
    accessibilityState: {
      enabled: true,
      service: "talkback",
    },
    // TalkBack cursor sits on Item 1 at screen load.
    accessibilityFocusedElement: makeListItem(1, true),
    elements: {
      clickable: visibleItems,
      scrollable: [recyclerView],
      text: visibleItems,
    },
    activeWindow: {
      packageName: "com.example.app",
      activityName: "com.example.app.ItemListActivity",
      windowId: 1,
    },
  };
}

function makeAfterScrollObserve(): ObserveResult {
  // After scrolling, Item 15 is now visible. Items 1–4 have scrolled off the
  // top of the list. Item 1 is no longer in the view hierarchy.
  //
  // IMPORTANT: accessibilityFocusedElement still points to Item 1 even though
  // Item 1 has scrolled off screen. TalkBack retains focus on the previously
  // focused node until the user explicitly navigates. The agent must not rely
  // on accessibilityFocusedElement to confirm Item 15 is visible; it should
  // check observe().elements instead.
  const makeListItem = (n: number): Element => ({
    bounds: {
      left: 0,
      top: 80 + (n - 11) * 100,
      right: 720,
      bottom: 160 + (n - 11) * 100,
    },
    text: `Item ${n}`,
    "content-desc": `Item ${n}`,
    "resource-id": `com.example.app:id/list_item_${n}`,
    "class": "android.widget.LinearLayout",
    clickable: true,
    focusable: true,
    focused: false,
    "accessibility-focused": false,
    enabled: true,
  });

  const recyclerView: Element = {
    bounds: { left: 0, top: 80, right: 720, bottom: 1200 },
    text: undefined,
    "content-desc": undefined,
    "resource-id": "com.example.app:id/item_list",
    "class": "androidx.recyclerview.widget.RecyclerView",
    clickable: false,
    focusable: false,
    focused: false,
    "accessibility-focused": false,
    scrollable: true,
    enabled: true,
  };

  // Item 1 is off-screen but TalkBack focus is still reported on it.
  // This is a real device behavior: AccessibilityNodeInfo for the previously
  // focused node persists in the accessibility tree even after it is recycled
  // out of the visible viewport.
  const offScreenItem1: Element = {
    bounds: { left: 0, top: -920, right: 720, bottom: -840 },
    text: "Item 1",
    "content-desc": "Item 1",
    "resource-id": "com.example.app:id/list_item_1",
    "class": "android.widget.LinearLayout",
    clickable: true,
    focusable: true,
    focused: false,
    "accessibility-focused": true,
    enabled: true,
  };

  const visibleItems = [11, 12, 13, 14, 15].map(n => makeListItem(n));

  return {
    updatedAt: Date.now(),
    screenSize: { width: 720, height: 1280 },
    systemInsets: { top: 48, bottom: 80, left: 0, right: 0 },
    accessibilityState: {
      enabled: true,
      service: "talkback",
    },
    // Focus is still on Item 1 even though it is off-screen. Do not rely on
    // this field to confirm the scroll target is visible.
    accessibilityFocusedElement: offScreenItem1,
    elements: {
      clickable: visibleItems,
      scrollable: [recyclerView],
      text: visibleItems,
    },
    activeWindow: {
      packageName: "com.example.app",
      activityName: "com.example.app.ItemListActivity",
      windowId: 1,
    },
  };
}

function makeDetailScreenObserve(): ObserveResult {
  // After tapping Item 15, the detail screen loads.
  // TalkBack auto-focuses the first element on the new screen.
  const titleElement: Element = {
    bounds: { left: 32, top: 120, right: 688, bottom: 180 },
    text: "Item 15",
    "content-desc": "Item 15",
    "resource-id": "com.example.app:id/detail_title",
    "class": "android.widget.TextView",
    clickable: false,
    focusable: true,
    focused: false,
    "accessibility-focused": true,
    enabled: true,
  };

  const descriptionElement: Element = {
    bounds: { left: 32, top: 200, right: 688, bottom: 320 },
    text: "Description for Item 15.",
    "content-desc": "Description for Item 15.",
    "resource-id": "com.example.app:id/detail_description",
    "class": "android.widget.TextView",
    clickable: false,
    focusable: true,
    focused: false,
    "accessibility-focused": false,
    enabled: true,
  };

  return {
    updatedAt: Date.now(),
    screenSize: { width: 720, height: 1280 },
    systemInsets: { top: 48, bottom: 80, left: 0, right: 0 },
    accessibilityState: {
      enabled: true,
      service: "talkback",
    },
    // TalkBack moved its cursor to the first element of the detail screen.
    accessibilityFocusedElement: titleElement,
    elements: {
      clickable: [],
      scrollable: [],
      text: [titleElement, descriptionElement],
    },
    activeWindow: {
      packageName: "com.example.app",
      // Activity changed — confirms navigation succeeded.
      activityName: "com.example.app.ItemDetailActivity",
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
      // 1 = initial list screen
      // 2 = after scroll (Item 15 now visible)
      // 3 = after tap on Item 15 (detail screen)
      if (observeCallCount === 1) {
        return makeListScreenObserve();
      } else if (observeCallCount === 2) {
        return makeAfterScrollObserve();
      } else {
        return makeDetailScreenObserve();
      }
    },

    async tapOn(args: TapOnArgs): Promise<{ success: boolean; message: string }> {
      // Under TalkBack, tapOn issues ACTION_CLICK on the AccessibilityNodeInfo.
      // This is transparent to the caller.
      return {
        success: true,
        message: `Tapped element (TalkBack: ACTION_CLICK on node): ${JSON.stringify(args)}`,
      };
    },

    async swipeOn(args: SwipeOnArgs): Promise<{ success: boolean; message: string }> {
      // Under TalkBack, swipeOn on a scrollable container with direction "up"
      // issues ACTION_SCROLL_FORWARD on the container's AccessibilityNodeInfo
      // instead of injecting a touch swipe gesture. A touch swipe is intercepted
      // by TalkBack for cursor navigation and would not scroll the list.
      //
      // When lookFor is provided, AutoMobile repeats the scroll action until the
      // target element appears in the accessibility tree.
      const action =
        args.direction === "up" || args.direction === "left"
          ? "ACTION_SCROLL_FORWARD"
          : "ACTION_SCROLL_BACKWARD";
      const lookForNote = args.lookFor
        ? `, repeated until target found: ${JSON.stringify(args.lookFor)}`
        : "";
      return {
        success: true,
        message: `Scrolled container (TalkBack: ${action} on node${lookForNote}): ${JSON.stringify(args)}`,
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
  console.log("TalkBack List Scroll - AutoMobile MCP Tool Demonstration");
  console.log("=".repeat(60));
  console.log();
  console.log("Scenario: Find and tap 'Item 15' in a RecyclerView list");
  console.log("while TalkBack is active. Item 15 is initially off-screen.");
  console.log("AutoMobile uses ACTION_SCROLL_FORWARD instead of a touch");
  console.log("swipe to avoid TalkBack gesture interception.");

  const client = createMockClient();

  // -------------------------------------------------------------------------
  // Step 1: Observe to read the current screen and confirm TalkBack state.
  // -------------------------------------------------------------------------
  printStep(1, "Observe initial list screen");

  const initialObserve = await client.observe();

  printResult("accessibilityState", initialObserve.accessibilityState);
  printResult("accessibilityFocusedElement", initialObserve.accessibilityFocusedElement);

  console.log("\nScrollable containers:");
  for (const el of initialObserve.elements?.scrollable ?? []) {
    console.log(`  [${el["resource-id"]}]  class="${el["class"] ?? ""}"`);
  }

  console.log("\nVisible list items:");
  for (const el of initialObserve.elements?.clickable ?? []) {
    console.log(`  [${el["resource-id"]}]  text="${el.text ?? ""}"`);
  }

  if (initialObserve.accessibilityState?.enabled) {
    console.log(
      `\nNote: TalkBack is ACTIVE (service: ${initialObserve.accessibilityState.service}).`
    );
    console.log(
      "      swipeOn will use ACTION_SCROLL_FORWARD internally. No change needed to this script."
    );
  }

  // Check whether the target is already visible.
  const targetText = "Item 15";
  const alreadyVisible = (initialObserve.elements?.clickable ?? []).some(
    el => el.text === targetText
  );
  console.log(`\nTarget "${targetText}" visible before scroll: ${alreadyVisible}`);

  // -------------------------------------------------------------------------
  // Step 2: Scroll the list to find Item 15.
  // swipeOn with direction "up" scrolls content upward (i.e., reveals items
  // further down the list). Under TalkBack, AutoMobile translates this to
  // ACTION_SCROLL_FORWARD on the RecyclerView node. The lookFor argument tells
  // AutoMobile to keep scrolling until Item 15 appears in the hierarchy.
  //
  // Do NOT use a plain finger swipe gesture to scroll under TalkBack. TalkBack
  // intercepts single-finger vertical swipes for cursor navigation (moving the
  // screen reader focus) rather than passing them to the scrollable container.
  // -------------------------------------------------------------------------
  printStep(2, "Scroll list to find Item 15");
  console.log('Note: swipeOn direction "up" maps to ACTION_SCROLL_FORWARD under TalkBack.');
  console.log(
    "      A touch swipe would be intercepted by TalkBack for cursor navigation."
  );
  console.log("      lookFor causes AutoMobile to repeat the action until the target appears.");

  const swipeResult = await client.swipeOn({
    resourceId: "com.example.app:id/item_list",
    direction: "up",
    lookFor: { text: targetText },
  });
  printResult("swipeOn result", swipeResult);

  // -------------------------------------------------------------------------
  // Step 3: Observe again to confirm Item 15 is now in the element tree.
  // Note that accessibilityFocusedElement may still point to Item 1 even
  // though Item 1 has scrolled off screen. This is normal TalkBack behavior:
  // the screen reader retains focus on the previously focused node until the
  // user explicitly navigates. Check elements.clickable for Item 15 rather
  // than relying on accessibilityFocusedElement.
  // -------------------------------------------------------------------------
  printStep(3, "Observe after scroll — check elements list, not focus");

  const afterScrollObserve = await client.observe();

  // accessibilityFocusedElement may be Item 1 (off-screen). Do not use it
  // to determine whether the scroll target is visible.
  printResult(
    "accessibilityFocusedElement after scroll (may be off-screen)",
    afterScrollObserve.accessibilityFocusedElement
  );

  const focusedId = afterScrollObserve.accessibilityFocusedElement?.["resource-id"] ?? "";
  if (focusedId.includes("list_item_1")) {
    console.log("\nNote: TalkBack focus is still on Item 1 (now off-screen).");
    console.log(
      "      This is expected. Check elements.clickable for the target instead."
    );
  }

  console.log("\nNow-visible list items (from elements.clickable):");
  for (const el of afterScrollObserve.elements?.clickable ?? []) {
    console.log(`  [${el["resource-id"]}]  text="${el.text ?? ""}"`);
  }

  const targetElement = (afterScrollObserve.elements?.clickable ?? []).find(
    el => el.text === targetText
  );

  if (!targetElement) {
    console.error(`\nError: "${targetText}" still not visible after scroll. Aborting.`);
    process.exit(1);
  }

  console.log(`\n"${targetText}" is now visible in elements.clickable.`);
  printResult("target element", targetElement);

  // -------------------------------------------------------------------------
  // Step 4: Tap Item 15.
  // Under TalkBack, tapOn issues ACTION_CLICK on the node directly rather than
  // injecting a coordinate-based touch event.
  // -------------------------------------------------------------------------
  printStep(4, `Tap "${targetText}"`);
  console.log("Note: tapOn issues ACTION_CLICK on the node under TalkBack.");

  const tapResult = await client.tapOn({ text: targetText });
  printResult("tapOn result", tapResult);

  // -------------------------------------------------------------------------
  // Step 5: Observe to confirm the detail screen loaded.
  // TalkBack auto-focuses the first element on the new screen.
  // -------------------------------------------------------------------------
  printStep(5, "Observe detail screen — verify navigation succeeded");

  const detailObserve = await client.observe();
  printResult("activeWindow after tap", detailObserve.activeWindow);
  printResult(
    "accessibilityFocusedElement on detail screen",
    detailObserve.accessibilityFocusedElement
  );

  const navigated =
    detailObserve.activeWindow?.activityName === "com.example.app.ItemDetailActivity";
  console.log(`\nNavigation to detail screen succeeded: ${navigated}`);

  // -------------------------------------------------------------------------
  // Summary
  // -------------------------------------------------------------------------
  console.log("\n" + "=".repeat(60));
  console.log("Demonstration complete.");
  console.log("=".repeat(60));
  console.log();
  console.log("Key takeaways:");
  console.log("  - TalkBack intercepts single-finger swipes for cursor navigation.");
  console.log("  - swipeOn uses ACTION_SCROLL_FORWARD/BACKWARD internally under TalkBack.");
  console.log("  - lookFor repeats the scroll action until the target appears.");
  console.log("  - accessibilityFocusedElement may lag behind after a scroll.");
  console.log("  - Check elements.clickable (not focus) to confirm scroll target visibility.");
  console.log("  - tapOn uses ACTION_CLICK internally (transparent to agent).");
}

main().catch(error => {
  console.error("Fatal error:", error);
  process.exit(1);
});
