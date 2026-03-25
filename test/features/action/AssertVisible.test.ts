import { describe, expect, test } from "bun:test";
import { AssertVisible } from "../../../src/features/action/AssertVisible";
import { FakeTimer } from "../../fakes/FakeTimer";
import type { ElementFinder } from "../../../src/utils/interfaces/ElementFinder";
import type { ObserveScreen } from "../../../src/features/observe/interfaces/ObserveScreen";
import type { ObserveResult } from "../../../src/models";

const makeElement = (text: string) => ({
  text,
  bounds: { left: 0, top: 0, right: 100, bottom: 50 },
});

const makeFinder = (overrides: Partial<ElementFinder> = {}): ElementFinder => ({
  findElementByText: () => null,
  findElementByResourceId: () => null,
  findElementsByText: () => [],
  findElementsByResourceId: () => [],
  findContainerNode: () => null,
  hasContainerElement: () => false,
  findElementByIndex: () => null,
  findScrollableElements: () => [],
  findScrollableContainer: () => null,
  findClickableElements: () => [],
  findClickableElementsInContainer: () => [],
  findClickableParentsContainingText: () => [],
  findClickableSiblingsOfText: () => [],
  findChildElements: () => [],
  findSpannables: () => null,
  findFocusedTextInput: () => null,
  isElementFocused: () => false,
  validateElementText: () => true,
  ...overrides,
});

const makeObserveScreen = (resultFn: () => Partial<ObserveResult>): ObserveScreen => ({
  execute: async () => resultFn() as ObserveResult,
  appendRawViewHierarchy: async () => {},
  getMostRecentCachedObserveResult: async () => ({}) as ObserveResult,
});

describe("AssertVisible", () => {
  test("returns error when neither text nor id provided", async () => {
    const observe = makeObserveScreen(() => ({}));
    const assertVisible = new AssertVisible(observe, makeFinder(), new FakeTimer());
    const result = await assertVisible.execute({});
    expect(result.success).toBe(false);
    expect(result.error).toContain("'text' or 'id'");
  });

  test("finds element by text on first attempt", async () => {
    const element = makeElement("Login");
    const observe = makeObserveScreen(() => ({ viewHierarchy: { roots: [] } as any }));
    const finder = makeFinder({ findElementByText: () => element as any });
    const timer = new FakeTimer();
    timer.setCurrentTime(1000);

    const assertVisible = new AssertVisible(observe, finder, timer);
    const result = await assertVisible.execute({ text: "Login" });

    expect(result.success).toBe(true);
    expect(result.message).toContain("Login");
    expect(result.element).toBeDefined();
    expect(result.elapsedMs).toBe(0);
  });

  test("finds element by id on first attempt", async () => {
    const element = makeElement("Submit");
    const observe = makeObserveScreen(() => ({ viewHierarchy: { roots: [] } as any }));
    const finder = makeFinder({ findElementByResourceId: () => element as any });
    const timer = new FakeTimer();
    timer.setCurrentTime(1000);

    const assertVisible = new AssertVisible(observe, finder, timer);
    const result = await assertVisible.execute({ id: "com.test:id/submit_btn" });

    expect(result.success).toBe(true);
    expect(result.message).toContain("com.test:id/submit_btn");
    expect(result.element).toBeDefined();
  });

  test("polls until element appears", async () => {
    let callCount = 0;
    const element = makeElement("Loading Complete");
    const finder = makeFinder({
      findElementByText: () => {
        callCount++;
        return callCount >= 3 ? (element as any) : null;
      },
    });
    const observe = makeObserveScreen(() => ({ viewHierarchy: { roots: [] } as any }));
    const timer = new FakeTimer();
    timer.setCurrentTime(1000);
    timer.enableAutoAdvance();

    const assertVisible = new AssertVisible(observe, finder, timer);
    const result = await assertVisible.execute({ text: "Loading Complete", timeout: 5000 });

    expect(result.success).toBe(true);
    expect(callCount).toBe(3);
  });

  test("returns failure after timeout", async () => {
    const observe = makeObserveScreen(() => ({ viewHierarchy: { roots: [] } as any }));
    const finder = makeFinder();
    const timer = new FakeTimer();
    timer.setCurrentTime(1000);
    timer.enableAutoAdvance();

    const assertVisible = new AssertVisible(observe, finder, timer);
    const result = await assertVisible.execute({ text: "Missing", timeout: 1000 });

    expect(result.success).toBe(false);
    expect(result.error).toContain("not found within 1000ms");
    expect(result.elapsedMs).toBeDefined();
  });

  test("retries when view hierarchy is missing", async () => {
    let callCount = 0;
    const element = makeElement("Loaded");
    const observe = makeObserveScreen(() => {
      callCount++;
      if (callCount < 3) return {};
      return { viewHierarchy: { roots: [] } as any };
    });
    const finder = makeFinder({ findElementByText: () => element as any });
    const timer = new FakeTimer();
    timer.setCurrentTime(1000);
    timer.enableAutoAdvance();

    const assertVisible = new AssertVisible(observe, finder, timer);
    const result = await assertVisible.execute({ text: "Loaded", timeout: 5000 });

    expect(result.success).toBe(true);
    expect(callCount).toBe(3);
  });

  test("retries when observe throws", async () => {
    let callCount = 0;
    const element = makeElement("Recovered");
    const observe: ObserveScreen = {
      execute: async () => {
        callCount++;
        if (callCount < 2) throw new Error("Device busy");
        return { viewHierarchy: { roots: [] } } as any;
      },
      appendRawViewHierarchy: async () => {},
      getMostRecentCachedObserveResult: async () => ({}) as ObserveResult,
    };
    const finder = makeFinder({ findElementByText: () => element as any });
    const timer = new FakeTimer();
    timer.setCurrentTime(1000);
    timer.enableAutoAdvance();

    const assertVisible = new AssertVisible(observe, finder, timer);
    const result = await assertVisible.execute({ text: "Recovered", timeout: 5000 });

    expect(result.success).toBe(true);
    expect(callCount).toBe(2);
  });

  test("includes elapsed time on success", async () => {
    const element = makeElement("Timer Test");
    let nowCalls = 0;
    const timer = new FakeTimer();
    timer.setCurrentTime(5000);
    const observe = makeObserveScreen(() => ({ viewHierarchy: { roots: [] } as any }));
    const finder = makeFinder({
      findElementByText: () => {
        nowCalls++;
        timer.setCurrentTime(5000 + nowCalls * 250);
        return element as any;
      },
    });

    const assertVisible = new AssertVisible(observe, finder, timer);
    const result = await assertVisible.execute({ text: "Timer Test" });

    expect(result.success).toBe(true);
    expect(result.elapsedMs).toBe(250);
  });
});
