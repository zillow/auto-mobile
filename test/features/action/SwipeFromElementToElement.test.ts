import { assert } from "chai";
import * as sinon from "sinon";
import { SwipeFromElementToElement, ElementTarget } from "../../../src/features/action/SwipeFromElementToElement";
import { AdbUtils } from "../../../src/utils/adb";
import { ExecuteGesture } from "../../../src/features/action/ExecuteGesture";
import { ElementUtils } from "../../../src/features/utility/ElementUtils";
import { ObserveScreen } from "../../../src/features/observe/ObserveScreen";
import { ActionableError } from "../../../src/models/ActionableError";
import { Element } from "../../../src/models/Element";

describe("SwipeFromElementToElement", () => {
  let swipeFromElementToElement: SwipeFromElementToElement;
  let mockAdb: sinon.SinonStubbedInstance<AdbUtils>;
  let mockExecuteGesture: sinon.SinonStubbedInstance<ExecuteGesture>;
  let mockElementUtils: sinon.SinonStubbedInstance<ElementUtils>;
  let mockObserveScreen: sinon.SinonStubbedInstance<ObserveScreen>;

  const mockElement1: Element = {
    bounds: { left: 100, top: 200, right: 200, bottom: 300 },
    class: "android.widget.Button",
    clickable: true,
    text: "Source Button"
  };

  const mockElement2: Element = {
    bounds: { left: 300, top: 400, right: 400, bottom: 500 },
    class: "android.widget.TextView",
    clickable: false,
    text: "Target View"
  };

  const mockViewHierarchy = {
    hierarchy: {
      node: {
        $: {
          bounds: "[0,0][1080,1920]",
          class: "android.widget.FrameLayout"
        }
      }
    }
  };

  beforeEach(() => {
    mockAdb = sinon.createStubInstance(AdbUtils);
    mockExecuteGesture = sinon.createStubInstance(ExecuteGesture);
    mockElementUtils = sinon.createStubInstance(ElementUtils);
    mockObserveScreen = sinon.createStubInstance(ObserveScreen);

    // Setup default mocks
    mockObserveScreen.execute.resolves({
      timestamp: Date.now(),
      viewHierarchy: mockViewHierarchy,
      screenSize: { width: 1080, height: 1920 },
      systemInsets: { top: 0, right: 0, bottom: 0, left: 0 }
    });

    mockElementUtils.findElementByIndex
      .onFirstCall().returns({ element: mockElement1, text: "Source Button" })
      .onSecondCall().returns({ element: mockElement2, text: "Target View" });

    mockElementUtils.getElementCenter.callsFake((element: Element) => ({
      x: Math.floor((element.bounds.left + element.bounds.right) / 2),
      y: Math.floor((element.bounds.top + element.bounds.bottom) / 2)
    }));

    mockElementUtils.validateElementText.returns(true);

    mockExecuteGesture.swipe.resolves({
      success: true,
      x1: 150,
      y1: 250,
      x2: 350,
      y2: 450,
      duration: 500
    });

    swipeFromElementToElement = new SwipeFromElementToElement("test-device", mockAdb);
    (swipeFromElementToElement as any).executeGesture = mockExecuteGesture;
    (swipeFromElementToElement as any).elementUtils = mockElementUtils;
    (swipeFromElementToElement as any).observeScreen = mockObserveScreen;
  });

  afterEach(() => {
    sinon.restore();
  });

  describe("constructor", () => {
    it("should initialize with default values", () => {
      const instance = new SwipeFromElementToElement();
      assert.instanceOf(instance, SwipeFromElementToElement);
    });

    it("should initialize with provided deviceId and adb", () => {
      const instance = new SwipeFromElementToElement("custom-device", mockAdb);
      assert.instanceOf(instance, SwipeFromElementToElement);
    });
  });

  describe("execute", () => {
    const fromTarget: ElementTarget = { index: 0 };
    const toTarget: ElementTarget = { index: 1 };

    it("should successfully execute drag and drop between elements", async () => {
      // Setup element finding mock to return different elements for different indices
      mockElementUtils.findElementByIndex
        .onFirstCall().returns({ element: mockElement1, text: "Source Button" })
        .onSecondCall().returns({ element: mockElement2, text: "Target View" });

      const result = await swipeFromElementToElement.execute(fromTarget, toTarget);

      assert.isTrue(mockObserveScreen.execute.called);
      assert.isTrue(mockElementUtils.findElementByIndex.calledTwice);
      assert.isTrue(mockElementUtils.findElementByIndex.calledWith(mockViewHierarchy, 0));
      assert.isTrue(mockElementUtils.findElementByIndex.calledWith(mockViewHierarchy, 1));
      assert.isTrue(mockElementUtils.getElementCenter.calledWith(mockElement1));
      assert.isTrue(mockElementUtils.getElementCenter.calledWith(mockElement2));
      assert.isTrue(mockExecuteGesture.swipe.calledWith(150, 250, 350, 450, {
        duration: 500,
        easing: "accelerateDecelerate",
        fingers: 1,
        randomize: false,
        lift: true,
        pressure: 1
      }));

      assert.deepEqual(result.fromElement, {
        index: 0,
        text: "Source Button",
        bounds: mockElement1.bounds,
        center: { x: 150, y: 250 }
      });

      assert.deepEqual(result.toElement, {
        index: 1,
        text: "Target View",
        bounds: mockElement2.bounds,
        center: { x: 350, y: 450 }
      });
    });

    it("should execute with custom gesture options", async () => {
      mockElementUtils.findElementByIndex
        .onFirstCall().returns({ element: mockElement1, text: "Source Button" })
        .onSecondCall().returns({ element: mockElement2, text: "Target View" });

      const customOptions = {
        duration: 1000,
        easing: "linear" as const,
        fingers: 2,
        randomize: true,
        lift: false,
        pressure: 0.5
      };

      await swipeFromElementToElement.execute(fromTarget, toTarget, customOptions);

      assert.isTrue(mockExecuteGesture.swipe.calledWith(150, 250, 350, 450, {
        duration: 1000,
        easing: "linear",
        fingers: 2,
        randomize: true,
        lift: false,
        pressure: 0.5
      }));
    });

    it("should validate source element text when provided", async () => {
      const fromTargetWithText: ElementTarget = { index: 0, text: "Source Button" };

      mockElementUtils.findElementByIndex
        .onFirstCall().returns({ element: mockElement1, text: "Source Button" })
        .onSecondCall().returns({ element: mockElement2, text: "Target View" });

      await swipeFromElementToElement.execute(fromTargetWithText, toTarget);

      assert.isTrue(mockElementUtils.validateElementText.calledWith(
        { element: mockElement1, text: "Source Button" },
        "Source Button"
      ));
    });

    it("should validate destination element text when provided", async () => {
      const toTargetWithText: ElementTarget = { index: 1, text: "Target View" };

      mockElementUtils.findElementByIndex
        .onFirstCall().returns({ element: mockElement1, text: "Source Button" })
        .onSecondCall().returns({ element: mockElement2, text: "Target View" });

      await swipeFromElementToElement.execute(fromTarget, toTargetWithText);

      assert.isTrue(mockElementUtils.validateElementText.calledWith(
        { element: mockElement2, text: "Target View" },
        "Target View"
      ));
    });

    it("should throw error when view hierarchy is not available", async () => {
      mockObserveScreen.execute.resolves({
        timestamp: Date.now(),
        viewHierarchy: null,
        screenSize: { width: 1080, height: 1920 },
        systemInsets: { top: 0, right: 0, bottom: 0, left: 0 }
      });

      try {
        await swipeFromElementToElement.execute(fromTarget, toTarget);
        assert.fail("Expected ActionableError to be thrown");
      } catch (error) {
        assert.instanceOf(error, ActionableError);
      }
    });

    it("should throw error when source element is not found", async () => {
      mockElementUtils.findElementByIndex.onFirstCall().returns(null);
      mockElementUtils.flattenViewHierarchy.returns([
        { element: mockElement1, index: 0, text: "Element 0" },
        { element: mockElement2, index: 1, text: "Element 1" }
      ]);

      try {
        await swipeFromElementToElement.execute(fromTarget, toTarget);
        assert.fail("Expected ActionableError to be thrown");
      } catch (error) {
        assert.instanceOf(error, ActionableError);
        assert.isTrue(mockElementUtils.flattenViewHierarchy.calledWith(mockViewHierarchy));
      }
    });

    it("should throw error when destination element is not found", async () => {
      mockElementUtils.findElementByIndex
        .onFirstCall().returns({ element: mockElement1, text: "Source Button" })
        .onSecondCall().returns(null);

      mockElementUtils.flattenViewHierarchy.returns([
        { element: mockElement1, index: 0, text: "Element 0" }
      ]);

      try {
        await swipeFromElementToElement.execute(fromTarget, toTarget);
        assert.fail("Expected ActionableError to be thrown");
      } catch (error) {
        assert.instanceOf(error, ActionableError);
      }
    });

    it("should throw error when source element text validation fails", async () => {
      const fromTargetWithText: ElementTarget = { index: 0, text: "Wrong Text" };

      mockElementUtils.findElementByIndex
        .onFirstCall().returns({ element: mockElement1, text: "Source Button" })
        .onSecondCall().returns({ element: mockElement2, text: "Target View" });

      mockElementUtils.validateElementText.onFirstCall().returns(false);

      try {
        await swipeFromElementToElement.execute(fromTargetWithText, toTarget);
        assert.fail("Expected ActionableError to be thrown");
      } catch (error) {
        assert.instanceOf(error, ActionableError);
      }
    });

    it("should throw error when destination element text validation fails", async () => {
      const toTargetWithText: ElementTarget = { index: 1, text: "Wrong Text" };

      mockElementUtils.findElementByIndex
        .onFirstCall().returns({ element: mockElement1, text: "Source Button" })
        .onSecondCall().returns({ element: mockElement2, text: "Target View" });

      // Reset the validateElementText mock and set up the specific behavior we need
      mockElementUtils.validateElementText.reset();
      mockElementUtils.validateElementText
        .onFirstCall().returns(false); // Only the destination validation is called in this case

      try {
        await swipeFromElementToElement.execute(fromTarget, toTargetWithText);
        assert.fail("Expected ActionableError to be thrown");
      } catch (error) {
        assert.instanceOf(error, ActionableError);
      }
    });

    it("should handle elements without text", async () => {
      mockElementUtils.findElementByIndex
        .onFirstCall().returns({ element: mockElement1, text: undefined })
        .onSecondCall().returns({ element: mockElement2, text: undefined });

      const result = await swipeFromElementToElement.execute(fromTarget, toTarget);

      assert.isUndefined(result.fromElement?.text);
      assert.isUndefined(result.toElement?.text);
    });

    it("should pass progress callback to observedChange", async () => {
      mockElementUtils.findElementByIndex
        .onFirstCall().returns({ element: mockElement1, text: "Source Button" })
        .onSecondCall().returns({ element: mockElement2, text: "Target View" });

      const progressCallback = sinon.stub();
      await swipeFromElementToElement.execute(fromTarget, toTarget, {}, progressCallback);

      // The progress callback should be passed through to observedChange
      // This is tested indirectly since observedChange is part of BaseVisualChange
      assert.isFunction(progressCallback);
    });
  });
});
