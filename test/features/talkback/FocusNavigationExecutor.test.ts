import { describe, expect, test } from "bun:test";
import {
  FocusNavigationExecutor,
  type FocusNavigationDriverFactory,
  type FocusNavigationPath
} from "../../../src/features/talkback/FocusNavigationExecutor";
import { FocusPathCalculator } from "../../../src/features/talkback/FocusPathCalculator";
import type { Element } from "../../../src/models/Element";
import type { ElementSelector as FocusElementSelector } from "../../../src/utils/AccessibilityFocusTracker";
import { FakeFocusNavigationDriver } from "../../fakes/FakeFocusNavigationDriver";
import { FakeTimer } from "../../fakes/FakeTimer";

const makeElement = (resourceId: string, index: number): Element => ({
  "bounds": {
    left: index * 10,
    top: index * 10,
    right: index * 10 + 5,
    bottom: index * 10 + 5
  },
  "resource-id": resourceId
});

describe("FocusNavigationExecutor", () => {
  test("uses injected driver and FakeTimer to stop early", async () => {
    const timer = new FakeTimer();
    const driver = new FakeFocusNavigationDriver();
    const elements = [
      makeElement("a", 0),
      makeElement("b", 1),
      makeElement("c", 2)
    ];
    driver.setElements(elements, 0);

    const targetSelector: FocusElementSelector = { resourceId: "c" };
    const path: FocusNavigationPath = {
      currentFocusIndex: 0,
      targetFocusIndex: 2,
      swipeCount: 5,
      direction: "forward",
      intermediateCheckpoints: []
    };

    const driverFactory: FocusNavigationDriverFactory = {
      createDriver: () => driver
    };
    const executor = new FocusNavigationExecutor({ timer, driverFactory });

    const result = await executor.navigateToElement("device-1", targetSelector, path, {
      verificationInterval: 1,
      swipeDelay: 123
    });

    expect(result).toBe(true);
    expect(driver.getSwipeCount()).toBe(2);
    expect(timer.getSleepHistory()).toEqual([123, 123]);
  });

  test("throws when focus does not move across swipes", async () => {
    const timer = new FakeTimer();
    const driver = new FakeFocusNavigationDriver();
    const elements = [
      makeElement("a", 0),
      makeElement("b", 1),
      makeElement("c", 2)
    ];
    driver.setElements(elements, 0);
    driver.autoAdvanceOnSwipe = false;

    const targetSelector: FocusElementSelector = { resourceId: "c" };
    const path: FocusNavigationPath = {
      currentFocusIndex: 0,
      targetFocusIndex: 2,
      swipeCount: 3,
      direction: "forward",
      intermediateCheckpoints: []
    };

    const driverFactory: FocusNavigationDriverFactory = {
      createDriver: () => driver
    };
    const executor = new FocusNavigationExecutor({ timer, driverFactory });

    await expect(
      executor.navigateToElement("device-1", targetSelector, path, {
        verificationInterval: 1,
        swipeDelay: 0
      })
    ).rejects.toThrow("Focus did not move");
  });

  test("recalculates when traversal order moves target farther away", async () => {
    const timer = new FakeTimer();
    const driver = new FakeFocusNavigationDriver();
    const a = makeElement("a", 0);
    const b = makeElement("b", 1);
    const c = makeElement("c", 2);
    const d = makeElement("d", 3);
    const e = makeElement("e", 4);
    driver.setElements([a, b, c, d, e], 0);

    const targetSelector: FocusElementSelector = { resourceId: "c" };
    const calculator = new FocusPathCalculator();
    const path = calculator.calculatePath(a, targetSelector, [a, b, c, d, e])!;

    driver.onSwipe = () => {
      if (driver.getSwipeCount() === 1) {
        driver.replaceElements([a, b, d, e, c], true);
      }
    };

    const driverFactory: FocusNavigationDriverFactory = {
      createDriver: () => driver
    };
    const executor = new FocusNavigationExecutor({ timer, driverFactory });

    const result = await executor.navigateToElement("device-1", targetSelector, path, {
      verificationInterval: 1,
      swipeDelay: 0
    });

    expect(result).toBe(true);
    expect(driver.getSwipeCount()).toBe(4);
  });
});
