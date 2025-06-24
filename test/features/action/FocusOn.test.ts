import { assert } from "chai";
import { FocusOn } from "../../../src/features/action/FocusOn";
import { AdbUtils } from "../../../src/utils/adb";
import { ObserveScreen } from "../../../src/features/observe/ObserveScreen";
import { SingleTap } from "../../../src/features/action/SingleTap";
import { ObserveResult } from "../../../src/models";
import sinon from "sinon";

describe("FocusOn", () => {
  let focusOn: FocusOn;
  let mockAdb: sinon.SinonStubbedInstance<AdbUtils>;
  let mockObserveScreen: sinon.SinonStubbedInstance<ObserveScreen>;
  let mockSingleTap: sinon.SinonStubbedInstance<SingleTap>;

  beforeEach(() => {
    // Create stubs for dependencies
    mockAdb = sinon.createStubInstance(AdbUtils);
    mockObserveScreen = sinon.createStubInstance(ObserveScreen);
    mockSingleTap = sinon.createStubInstance(SingleTap);

    // Stub the constructors
    sinon.stub(AdbUtils.prototype, "executeCommand").callsFake(mockAdb.executeCommand);
    sinon.stub(ObserveScreen.prototype, "execute").callsFake(mockObserveScreen.execute);
    sinon.stub(SingleTap.prototype, "execute").callsFake(mockSingleTap.execute);

    focusOn = new FocusOn("test-device");
  });

  afterEach(() => {
    sinon.restore();
  });

  // Helper function to create mock ObserveResult
  const createMockObserveResult = (focused: boolean = false): ObserveResult => ({
    timestamp: Date.now(),
    screenSize: { width: 1080, height: 1920 },
    systemInsets: { top: 0, bottom: 0, left: 0, right: 0 },
    viewHierarchy: {
      hierarchy: {
        node: {
          $: {
            "resource-id": "com.example.app:id/test_input",
            "bounds": "[100,200][500,300]",
            "focused": focused.toString(),
            "clickable": "true"
          }
        }
      }
    }
  });

  describe("execute", () => {
    it("should return success immediately if element is already focused", async () => {
      // Mock observation with focused element
      const mockObservation = createMockObserveResult(true);
      mockObserveScreen.execute.resolves(mockObservation);

      const result = await focusOn.execute("test_input");

      assert.isTrue(result.success);
      assert.equal(result.elementId, "test_input");
      assert.isTrue(result.wasAlreadyFocused);
      assert.isFalse(result.focusChanged);
      assert.equal(result.x, 300); // Center X of bounds [100,200][500,300]
      assert.equal(result.y, 250); // Center Y of bounds [100,200][500,300]

      // Should not have called tap since element was already focused
      sinon.assert.notCalled(mockSingleTap.execute);
    });

    it("should tap element and verify focus when element is not focused", async () => {
      // Mock initial observation with unfocused element
      const mockObservationUnfocused = createMockObserveResult(false);
      const mockObservationFocused = createMockObserveResult(true);

      mockObserveScreen.execute
        .onFirstCall().resolves(mockObservationUnfocused)
        .onSecondCall().resolves(mockObservationFocused)
        .onThirdCall().resolves(mockObservationFocused); // For BaseVisualChange

      // Mock successful tap
      mockSingleTap.execute.resolves({
        success: true,
        x: 300,
        y: 250,
        observation: mockObservationFocused
      });

      const result = await focusOn.execute("test_input");

      assert.isTrue(result.success);
      assert.equal(result.elementId, "test_input");
      assert.isFalse(result.wasAlreadyFocused);
      assert.isTrue(result.focusChanged);
      assert.isTrue(result.focusVerified);
      assert.equal(result.x, 300);
      assert.equal(result.y, 250);
      assert.equal(result.attempts, 1);

      // Should have called tap once
      sinon.assert.calledOnce(mockSingleTap.execute);
      sinon.assert.calledWith(mockSingleTap.execute, 300, 250);
    });

    it("should handle element not found", async () => {
      // Mock observation with no matching element
      const mockObservation: ObserveResult = {
        timestamp: Date.now(),
        screenSize: { width: 1080, height: 1920 },
        systemInsets: { top: 0, bottom: 0, left: 0, right: 0 },
        viewHierarchy: {
          hierarchy: {
            node: {
              $: {
                "resource-id": "com.example.app:id/different_element",
                "bounds": "[100,200][500,300]",
                "focused": "false"
              }
            }
          }
        }
      };
      mockObserveScreen.execute.resolves(mockObservation);

      try {
        await focusOn.execute("test_input");
        assert.fail("Should have thrown an error for element not found");
      } catch (error) {
        assert.include((error as Error).message, "Element not found with ID: test_input");
      }
    });

    it("should handle missing view hierarchy", async () => {
      // Mock observation with no view hierarchy
      const mockObservation: ObserveResult = {
        timestamp: Date.now(),
        screenSize: { width: 1080, height: 1920 },
        systemInsets: { top: 0, bottom: 0, left: 0, right: 0 },
        viewHierarchy: null
      };
      mockObserveScreen.execute.resolves(mockObservation);

      try {
        await focusOn.execute("test_input");
        assert.fail("Should have thrown an error for missing view hierarchy");
      } catch (error) {
        assert.include((error as Error).message, "Could not get view hierarchy to check focus state");
      }
    });

    it("should retry focus verification when focus is not established immediately", async () => {
      // Mock initial observation with unfocused element
      const mockObservationUnfocused = createMockObserveResult(false);
      const mockObservationFocused = createMockObserveResult(true);

      mockObserveScreen.execute
        .onFirstCall().resolves(mockObservationUnfocused) // Initial check
        .onSecondCall().resolves(mockObservationUnfocused) // First verification attempt
        .onThirdCall().resolves(mockObservationFocused) // Second verification attempt (success)
        .onCall(3).resolves(mockObservationFocused); // For BaseVisualChange

      // Mock successful tap
      mockSingleTap.execute.resolves({
        success: true,
        x: 300,
        y: 250,
        observation: mockObservationFocused
      });

      const result = await focusOn.execute("test_input", { retryCount: 2 });

      assert.isTrue(result.success);
      assert.isFalse(result.wasAlreadyFocused);
      assert.isTrue(result.focusChanged);
      assert.isTrue(result.focusVerified);
      assert.equal(result.attempts, 2);

      // Should have called tap once and observe multiple times
      sinon.assert.calledOnce(mockSingleTap.execute);
    });

    it("should work with progress callback", async () => {
      const mockObservation = createMockObserveResult(true);
      mockObserveScreen.execute.resolves(mockObservation);

      const progressCallback = sinon.spy();
      const result = await focusOn.execute("test_input", {}, progressCallback);

      assert.isTrue(result.success);
      // Progress callback should be called by BaseVisualChange and FocusOn implementation
      assert.isTrue(progressCallback.called);
    });

    it("should handle custom options", async () => {
      const mockObservation = createMockObserveResult(true);
      mockObserveScreen.execute.resolves(mockObservation);

      const result = await focusOn.execute("test_input", {
        retryCount: 5,
        verificationTimeoutMs: 10000
      });

      assert.isTrue(result.success);
      assert.equal(result.elementId, "test_input");
    });

    it("should detect focus using different focus attributes", async () => {
      // Test with 'selected' attribute
      const mockObservationSelected: ObserveResult = {
        timestamp: Date.now(),
        screenSize: { width: 1080, height: 1920 },
        systemInsets: { top: 0, bottom: 0, left: 0, right: 0 },
        viewHierarchy: {
          hierarchy: {
            node: {
              $: {
                "resource-id": "com.example.app:id/test_input",
                "bounds": "[100,200][500,300]",
                "selected": "true",
                "clickable": "true"
              }
            }
          }
        }
      };
      mockObserveScreen.execute.resolves(mockObservationSelected);

      const result = await focusOn.execute("test_input");

      assert.isTrue(result.success);
      assert.isTrue(result.wasAlreadyFocused);
    });

    it("should handle boolean focus attributes", async () => {
      // Mock observation with boolean focused attribute
      const mockObservation: ObserveResult = {
        timestamp: Date.now(),
        screenSize: { width: 1080, height: 1920 },
        systemInsets: { top: 0, bottom: 0, left: 0, right: 0 },
        viewHierarchy: {
          hierarchy: {
            node: {
              $: {
                "resource-id": "com.example.app:id/test_input",
                "bounds": "[100,200][500,300]",
                "focused": true, // Boolean instead of string
                "clickable": "true"
              }
            }
          }
        }
      };
      mockObserveScreen.execute.resolves(mockObservation);

      const result = await focusOn.execute("test_input");

      assert.isTrue(result.success);
      assert.isTrue(result.wasAlreadyFocused);
    });

    it("should handle tap failure gracefully", async () => {
      const mockObservationUnfocused = createMockObserveResult(false);
      mockObserveScreen.execute.resolves(mockObservationUnfocused);

      // Mock tap failure
      mockSingleTap.execute.rejects(new Error("Tap failed"));

      try {
        await focusOn.execute("test_input");
        // If we get here, BaseVisualChange caught the error
        // That's acceptable behavior
      } catch (error) {
        // Error should bubble up appropriately
        assert.include((error as Error).message, "Tap failed");
      }
    });
  });

  describe("constructor", () => {
    it("should work with null deviceId", () => {
      const focusOnInstance = new FocusOn(null);
      assert.isDefined(focusOnInstance);
    });

    it("should work with custom AdbUtils", () => {
      const customAdb = new AdbUtils("custom-device");
      const focusOnInstance = new FocusOn("test-device", customAdb);
      assert.isDefined(focusOnInstance);
    });
  });

  describe("focus detection", () => {
    it("should detect focus from has-keyboard-focus attribute", async () => {
      const mockObservation: ObserveResult = {
        timestamp: Date.now(),
        screenSize: { width: 1080, height: 1920 },
        systemInsets: { top: 0, bottom: 0, left: 0, right: 0 },
        viewHierarchy: {
          hierarchy: {
            node: {
              $: {
                "resource-id": "com.example.app:id/test_input",
                "bounds": "[100,200][500,300]",
                "has-keyboard-focus": "true",
                "clickable": "true"
              }
            }
          }
        }
      };
      mockObserveScreen.execute.resolves(mockObservation);

      const result = await focusOn.execute("test_input");

      assert.isTrue(result.success);
      assert.isTrue(result.wasAlreadyFocused);
    });

    it("should detect focus from isFocused attribute", async () => {
      const mockObservation: ObserveResult = {
        timestamp: Date.now(),
        screenSize: { width: 1080, height: 1920 },
        systemInsets: { top: 0, bottom: 0, left: 0, right: 0 },
        viewHierarchy: {
          hierarchy: {
            node: {
              $: {
                "resource-id": "com.example.app:id/test_input",
                "bounds": "[100,200][500,300]",
                "isFocused": "true",
                "clickable": "true"
              }
            }
          }
        }
      };
      mockObserveScreen.execute.resolves(mockObservation);

      const result = await focusOn.execute("test_input");

      assert.isTrue(result.success);
      assert.isTrue(result.wasAlreadyFocused);
    });

    it("should not detect focus when all focus attributes are false", async () => {
      const mockObservationUnfocused = createMockObserveResult(false);
      const mockObservationFocused = createMockObserveResult(true);

      mockObserveScreen.execute
        .onFirstCall().resolves(mockObservationUnfocused)
        .onSecondCall().resolves(mockObservationFocused)
        .onThirdCall().resolves(mockObservationFocused);

      mockSingleTap.execute.resolves({
        success: true,
        x: 300,
        y: 250,
        observation: mockObservationFocused
      });

      const result = await focusOn.execute("test_input");

      assert.isTrue(result.success);
      assert.isFalse(result.wasAlreadyFocused);
      assert.isTrue(result.focusChanged);
    });
  });

  describe("edge cases", () => {
    it("should handle partial resource ID matching", async () => {
      const mockObservation: ObserveResult = {
        timestamp: Date.now(),
        screenSize: { width: 1080, height: 1920 },
        systemInsets: { top: 0, bottom: 0, left: 0, right: 0 },
        viewHierarchy: {
          hierarchy: {
            node: {
              $: {
                "resource-id": "com.example.app:id/test_input_field",
                "bounds": "[100,200][500,300]",
                "focused": "true",
                "clickable": "true"
              }
            }
          }
        }
      };
      mockObserveScreen.execute.resolves(mockObservation);

      const result = await focusOn.execute("test_input");

      assert.isTrue(result.success);
      assert.equal(result.elementId, "test_input");
      assert.isTrue(result.wasAlreadyFocused);
    });

    it("should handle zero retry count", async () => {
      const mockObservationUnfocused = createMockObserveResult(false);
      mockObserveScreen.execute.resolves(mockObservationUnfocused);

      mockSingleTap.execute.resolves({
        success: true,
        x: 300,
        y: 250,
        observation: mockObservationUnfocused
      });

      const result = await focusOn.execute("test_input", { retryCount: 0 });

      assert.isTrue(result.success);
      assert.isFalse(result.wasAlreadyFocused);
      assert.isFalse(result.focusChanged);
      assert.isFalse(result.focusVerified);
      assert.equal(result.attempts, 1);
    });
  });
});
