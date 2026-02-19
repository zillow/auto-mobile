import { describe, test, expect, beforeEach } from "bun:test";
import { parseTouchNodes, discoverTouchNode } from "../../../../src/features/record/android/TouchNodeDiscovery";
import { FakeAdbExecutor } from "../../../fakes/FakeAdbExecutor";

// ---------------------------------------------------------------------------
// Sample getevent -p output fixtures
// ---------------------------------------------------------------------------

const GETEVENT_P_TWO_DEVICES = `
add device 1: /dev/input/event0
  name:     "gpio-keys"
  events:
    KEY (0001): KEY_BACK          KEY_HOME
add device 2: /dev/input/event3
  name:     "Touchscreen"
  events:
    ABS (0003): 002f  0035  0036  0039
  absinfo:
    002f  : value 0, min 0, max 9, fuzz 0, flat 0, resolution 0
    0035  : value 0, min 0, max 1079, fuzz 0, flat 0, resolution 0
    0036  : value 0, min 0, max 1919, fuzz 0, flat 0, resolution 0
    0039  : value -1, min -1, max 65535, fuzz 0, flat 0, resolution 0
`;

const GETEVENT_PL_FORMAT = `
add device 1: /dev/input/event3
  name:     "sec_touchscreen"
  events:
    EV_ABS (0003): ABS_MT_SLOT (002f)    ABS_MT_POSITION_X (0035)
                   ABS_MT_POSITION_Y (0036)    ABS_MT_TRACKING_ID (0039)
  absinfo:
    ABS_MT_SLOT (002f): value 0, min 0, max 9, fuzz 0, flat 0, resolution 0
    ABS_MT_POSITION_X (0035): value 0, min 0, max 1079, fuzz 0, flat 0, resolution 0
    ABS_MT_POSITION_Y (0036): value 0, min 0, max 1919, fuzz 0, flat 0, resolution 0
    ABS_MT_TRACKING_ID (0039): value -1, min -1, max 65535, fuzz 0, flat 0, resolution 0
`;

const GETEVENT_NO_TOUCH = `
add device 1: /dev/input/event0
  name:     "gpio-keys"
  events:
    KEY (0001): KEY_BACK          KEY_HOME
add device 2: /dev/input/event1
  name:     "some-accel"
  events:
    ABS (0003): 0000  0001  0002
  absinfo:
    0000  : value 0, min -2048, max 2048, fuzz 0, flat 0, resolution 0
    0001  : value 0, min -2048, max 2048, fuzz 0, flat 0, resolution 0
    0002  : value 0, min -2048, max 2048, fuzz 0, flat 0, resolution 0
`;

const GETEVENT_MISSING_Y_AXIS = `
add device 1: /dev/input/event3
  name:     "BadDevice"
  events:
    ABS (0003): 0035
  absinfo:
    0035  : value 0, min 0, max 1079, fuzz 0, flat 0, resolution 0
`;

const GETEVENT_TWO_TOUCH_DEVICES = `
add device 1: /dev/input/event3
  name:     "Primary Touchscreen"
  events:
    ABS (0003): 0035  0036
  absinfo:
    0035  : value 0, min 0, max 1079, fuzz 0, flat 0, resolution 0
    0036  : value 0, min 0, max 1919, fuzz 0, flat 0, resolution 0
add device 2: /dev/input/event4
  name:     "Secondary Touch"
  events:
    ABS (0003): 0035  0036
  absinfo:
    0035  : value 0, min 0, max 539, fuzz 0, flat 0, resolution 0
    0036  : value 0, min 0, max 959, fuzz 0, flat 0, resolution 0
`;

// ---------------------------------------------------------------------------
// parseTouchNodes — pure function tests
// ---------------------------------------------------------------------------

describe("parseTouchNodes", () => {
  test("parses a single touchscreen device from getevent -p output", () => {
    const nodes = parseTouchNodes(GETEVENT_P_TWO_DEVICES);
    expect(nodes).toHaveLength(1);
    const node = nodes[0];
    expect(node.path).toBe("/dev/input/event3");
    expect(node.name).toBe("Touchscreen");
    expect(node.axisXMin).toBe(0);
    expect(node.axisXMax).toBe(1079);
    expect(node.axisYMin).toBe(0);
    expect(node.axisYMax).toBe(1919);
  });

  test("parses getevent -pl format with named axis codes", () => {
    const nodes = parseTouchNodes(GETEVENT_PL_FORMAT);
    expect(nodes).toHaveLength(1);
    expect(nodes[0].path).toBe("/dev/input/event3");
    expect(nodes[0].name).toBe("sec_touchscreen");
    expect(nodes[0].axisXMax).toBe(1079);
    expect(nodes[0].axisYMax).toBe(1919);
  });

  test("returns empty array when no multitouch devices are present", () => {
    const nodes = parseTouchNodes(GETEVENT_NO_TOUCH);
    expect(nodes).toHaveLength(0);
  });

  test("ignores device missing Y axis (0036)", () => {
    const nodes = parseTouchNodes(GETEVENT_MISSING_Y_AXIS);
    expect(nodes).toHaveLength(0);
  });

  test("returns both nodes when two touchscreens are present", () => {
    const nodes = parseTouchNodes(GETEVENT_TWO_TOUCH_DEVICES);
    expect(nodes).toHaveLength(2);
    expect(nodes[0].path).toBe("/dev/input/event3");
    expect(nodes[1].path).toBe("/dev/input/event4");
  });

  test("returns empty array for empty input", () => {
    expect(parseTouchNodes("")).toHaveLength(0);
  });

  test("handles negative axis min values", () => {
    const output = `
add device 1: /dev/input/event0
  name:     "Stylus"
  absinfo:
    0035  : value 0, min -100, max 8900, fuzz 0, flat 0, resolution 0
    0036  : value 0, min -200, max 4900, fuzz 0, flat 0, resolution 0
`;
    const nodes = parseTouchNodes(output);
    expect(nodes).toHaveLength(1);
    expect(nodes[0].axisXMin).toBe(-100);
    expect(nodes[0].axisYMin).toBe(-200);
  });
});

// ---------------------------------------------------------------------------
// discoverTouchNode — integration tests using FakeAdbExecutor
// ---------------------------------------------------------------------------

describe("discoverTouchNode", () => {
  let fakeAdb: FakeAdbExecutor;

  beforeEach(() => {
    fakeAdb = new FakeAdbExecutor();
  });

  test("returns first touch node from getevent -p output", async () => {
    fakeAdb.setCommandResponse("getevent -p", {
      stdout: GETEVENT_P_TWO_DEVICES,
      stderr: "",
      toString: () => GETEVENT_P_TWO_DEVICES,
      trim: () => GETEVENT_P_TWO_DEVICES.trim(),
      includes: (s: string) => GETEVENT_P_TWO_DEVICES.includes(s),
    });

    const node = await discoverTouchNode(fakeAdb);
    expect(node).not.toBeNull();
    expect(node!.path).toBe("/dev/input/event3");
    expect(node!.axisXMax).toBe(1079);
    expect(node!.axisYMax).toBe(1919);
  });

  test("returns null when no touch node found", async () => {
    fakeAdb.setCommandResponse("getevent -p", {
      stdout: GETEVENT_NO_TOUCH,
      stderr: "",
      toString: () => GETEVENT_NO_TOUCH,
      trim: () => GETEVENT_NO_TOUCH.trim(),
      includes: (s: string) => GETEVENT_NO_TOUCH.includes(s),
    });

    const node = await discoverTouchNode(fakeAdb);
    expect(node).toBeNull();
  });

  test("executes the correct adb command", async () => {
    fakeAdb.setCommandResponse("getevent -p", {
      stdout: GETEVENT_P_TWO_DEVICES,
      stderr: "",
      toString: () => GETEVENT_P_TWO_DEVICES,
      trim: () => GETEVENT_P_TWO_DEVICES.trim(),
      includes: (s: string) => GETEVENT_P_TWO_DEVICES.includes(s),
    });

    await discoverTouchNode(fakeAdb);
    expect(fakeAdb.wasCommandExecuted("getevent -p")).toBe(true);
  });
});
