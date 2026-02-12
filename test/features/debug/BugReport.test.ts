import { describe, expect, test } from "bun:test";
import { BugReport } from "../../../src/features/debug/BugReport";
import type { BootedDevice, Element, ElementBounds } from "../../../src/models";
import { FakeAdbClientFactory } from "../../fakes/FakeAdbClientFactory";
import { FakeElementParser } from "../../fakes/FakeElementParser";
import { FakeTimer } from "../../fakes/FakeTimer";
import { FakeViewHierarchy } from "../../fakes/FakeViewHierarchy";

describe("BugReport", () => {
  const device: BootedDevice = {
    deviceId: "test-device",
    platform: "android",
    isEmulator: true,
    name: "Test Device"
  };

  const makeBounds = (left: number, top: number, right: number, bottom: number): ElementBounds => ({
    left, top, right, bottom
  });

  const makeElement = (overrides: Partial<Element> = {}): Element => ({
    bounds: makeBounds(0, 0, 100, 100),
    ...overrides
  });

  const setup = () => {
    const adbFactory = new FakeAdbClientFactory();
    const timer = new FakeTimer();
    timer.enableAutoAdvance();
    const elementParser = new FakeElementParser();
    const viewHierarchy = new FakeViewHierarchy();
    const bugReport = new BugReport(device, adbFactory, timer, elementParser, viewHierarchy);
    return { bugReport, elementParser, viewHierarchy, adbFactory, timer };
  };

  const executeReport = (bugReport: BugReport) =>
    bugReport.execute();

  describe("getHierarchy", () => {
    test("sets elementCount to number of elements with valid bounds", async () => {
      const { bugReport, elementParser, viewHierarchy } = setup();
      viewHierarchy.configureHierarchy({ hierarchy: { node: {} } });
      elementParser.nextFlattenedElements = [
        { element: makeElement(), index: 0, depth: 0 },
        { element: makeElement(), index: 1, depth: 0 },
        { element: makeElement(), index: 2, depth: 1 }
      ];
      elementParser.nextRootNodes = [{ $: {} }];

      const result = await executeReport(bugReport);
      expect(result.viewHierarchy.elementCount).toBe(3);
    });

    test("sets filteredNodeCount to traversed nodes minus valid bounds", async () => {
      const { bugReport, elementParser, viewHierarchy } = setup();
      // Root with 2 children = 3 traversed nodes
      const rootNode = {
        $: {},
        node: [{ $: {} }, { $: {} }]
      };
      viewHierarchy.configureHierarchy({ hierarchy: { node: rootNode } });
      elementParser.nextRootNodes = [rootNode];
      // Only 1 element has valid bounds
      elementParser.nextFlattenedElements = [
        { element: makeElement(), index: 0, depth: 0 }
      ];

      const result = await executeReport(bugReport);
      expect(result.viewHierarchy.filteredNodeCount).toBe(2);
    });

    test("extracts clickable elements with ElementBounds objects", async () => {
      const { bugReport, elementParser, viewHierarchy } = setup();
      viewHierarchy.configureHierarchy({ hierarchy: { node: {} } });
      elementParser.nextRootNodes = [{ $: {} }];
      const bounds = makeBounds(10, 20, 110, 120);
      elementParser.nextFlattenedElements = [
        {
          element: makeElement({
            bounds,
            "clickable": true,
            "resource-id": "btn1",
            "text": "Click me",
            "content-desc": "Button",
            "class": "android.widget.Button"
          }),
          index: 0,
          depth: 0
        }
      ];

      const result = await executeReport(bugReport);
      expect(result.viewHierarchy.clickableElements).toHaveLength(1);
      expect(result.viewHierarchy.clickableElements[0].bounds).toEqual(bounds);
      expect(result.viewHierarchy.clickableElements[0].bounds.left).toBe(10);
    });

    test("limits clickable elements to 50", async () => {
      const { bugReport, elementParser, viewHierarchy } = setup();
      viewHierarchy.configureHierarchy({ hierarchy: { node: {} } });
      elementParser.nextRootNodes = [{ $: {} }];
      elementParser.nextFlattenedElements = Array.from({ length: 60 }, (_, i) => ({
        element: makeElement({ "clickable": true, "resource-id": `btn${i}` }),
        index: i,
        depth: 0
      }));

      const result = await executeReport(bugReport);
      expect(result.viewHierarchy.clickableElements).toHaveLength(50);
    });

    test("handles empty hierarchy", async () => {
      const { bugReport, elementParser, viewHierarchy } = setup();
      viewHierarchy.configureHierarchy({ hierarchy: {} });
      elementParser.nextRootNodes = [];
      elementParser.nextFlattenedElements = [];

      const result = await executeReport(bugReport);
      expect(result.viewHierarchy.elementCount).toBe(0);
      expect(result.viewHierarchy.clickableElements).toHaveLength(0);
      expect(result.errors).toEqual([]);
    });

    test("maps element properties correctly", async () => {
      const { bugReport, elementParser, viewHierarchy } = setup();
      viewHierarchy.configureHierarchy({ hierarchy: { node: {} } });
      elementParser.nextRootNodes = [{ $: {} }];
      elementParser.nextFlattenedElements = [
        {
          element: makeElement({
            "clickable": true,
            "resource-id": "com.app:id/submit",
            "text": "raw text",
            "content-desc": "Submit button",
            "class": "android.widget.Button"
          }),
          index: 0,
          depth: 0,
          text: "overridden text"
        }
      ];

      const result = await executeReport(bugReport);
      const el = result.viewHierarchy.clickableElements[0];
      expect(el.resourceId).toBe("com.app:id/submit");
      expect(el.text).toBe("overridden text");
      expect(el.contentDesc).toBe("Submit button");
      expect(el.className).toBe("android.widget.Button");
    });

    test("uses element.text when flattened text is undefined", async () => {
      const { bugReport, elementParser, viewHierarchy } = setup();
      viewHierarchy.configureHierarchy({ hierarchy: { node: {} } });
      elementParser.nextRootNodes = [{ $: {} }];
      elementParser.nextFlattenedElements = [
        {
          element: makeElement({ clickable: true, text: "element text" }),
          index: 0,
          depth: 0
        }
      ];

      const result = await executeReport(bugReport);
      expect(result.viewHierarchy.clickableElements[0].text).toBe("element text");
    });

    test("excludes non-clickable elements from clickableElements", async () => {
      const { bugReport, elementParser, viewHierarchy } = setup();
      viewHierarchy.configureHierarchy({ hierarchy: { node: {} } });
      elementParser.nextRootNodes = [{ $: {} }];
      elementParser.nextFlattenedElements = [
        { element: makeElement({ "clickable": false, "resource-id": "label" }), index: 0, depth: 0 },
        { element: makeElement({ "clickable": true, "resource-id": "button" }), index: 1, depth: 0 },
        { element: makeElement({ "resource-id": "text" }), index: 2, depth: 0 }
      ];

      const result = await executeReport(bugReport);
      expect(result.viewHierarchy.clickableElements).toHaveLength(1);
      expect(result.viewHierarchy.clickableElements[0].resourceId).toBe("button");
    });

    test("accepts string 'true' clickable values from accessibility hierarchies", async () => {
      const { bugReport, elementParser, viewHierarchy } = setup();
      viewHierarchy.configureHierarchy({ hierarchy: { node: {} } });
      elementParser.nextRootNodes = [{ $: {} }];
      elementParser.nextFlattenedElements = [
        {
          element: makeElement({ "clickable": "true" as any, "resource-id": "string-clickable" }),
          index: 0,
          depth: 0
        },
        {
          element: makeElement({ "clickable": true, "resource-id": "bool-clickable" }),
          index: 1,
          depth: 0
        }
      ];

      const result = await executeReport(bugReport);
      expect(result.viewHierarchy.clickableElements).toHaveLength(2);
      expect(result.viewHierarchy.clickableElements[0].resourceId).toBe("string-clickable");
      expect(result.viewHierarchy.clickableElements[1].resourceId).toBe("bool-clickable");
    });

    test("counts nodes using children fallback for accessibility/iOS hierarchies", async () => {
      const { bugReport, elementParser, viewHierarchy } = setup();
      // Hierarchy uses "children" instead of "node"
      const rootNode = {
        $: {},
        children: [{ $: {} }, { $: {} }]
      };
      viewHierarchy.configureHierarchy({ hierarchy: { node: rootNode } });
      elementParser.nextRootNodes = [rootNode];
      elementParser.nextFlattenedElements = [
        { element: makeElement(), index: 0, depth: 0 }
      ];

      const result = await executeReport(bugReport);
      // 3 traversed (root + 2 children), 1 flattened = 2 filtered
      expect(result.viewHierarchy.filteredNodeCount).toBe(2);
    });

    test("falls back to className when class is not set", async () => {
      const { bugReport, elementParser, viewHierarchy } = setup();
      viewHierarchy.configureHierarchy({ hierarchy: { node: {} } });
      elementParser.nextRootNodes = [{ $: {} }];
      elementParser.nextFlattenedElements = [
        {
          element: makeElement({ "clickable": true, "className": "android.widget.TextView" }),
          index: 0,
          depth: 0
        }
      ];

      const result = await executeReport(bugReport);
      expect(result.viewHierarchy.clickableElements[0].className).toBe("android.widget.TextView");
    });
  });

  describe("logcatLines", () => {
    test("honors explicit zero for logcatLines", async () => {
      const { bugReport, elementParser, viewHierarchy, adbFactory } = setup();
      viewHierarchy.configureHierarchy({ hierarchy: {} });
      elementParser.nextRootNodes = [];
      elementParser.nextFlattenedElements = [];

      await bugReport.execute({ logcatLines: 0 });

      const logcatCalls = adbFactory.getFakeClient().getCommandCalls()
        .filter(c => c.command.includes("logcat"));
      for (const call of logcatCalls) {
        expect(call.command).toContain("-t 0");
      }
    });
  });
});
