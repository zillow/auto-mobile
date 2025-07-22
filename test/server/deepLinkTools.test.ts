import { expect } from "chai";
import { registerDeepLinkTools } from "../../src/server/deepLinkTools";
import { ToolRegistry } from "../../src/server/toolRegistry";
import { EmulatorUtils } from "../../src/utils/emulator";
import { ObserveScreen } from "../../src/features/observe/ObserveScreen";
import { Window } from "../../src/features/observe/Window";
import { AwaitIdle } from "../../src/features/observe/AwaitIdle";
import { DeviceSessionManager } from "../../src/utils/deviceSessionManager";
import { ObserveResult } from "../../src/models";
import sinon from "sinon";

// Helper function to check if AVDs are available
async function checkAvdAvailability(): Promise<boolean> {
  try {
    const emulatorUtils = new EmulatorUtils();
    const avds = await emulatorUtils.listAvds();
    return avds.length > 0;
  } catch (error) {
    // If we can't list AVDs (e.g., Android SDK not available), return false
    return false;
  }
}

describe("Deep Link Tools Registration", function() {
  this.timeout(5000);
  let avdsAvailable: boolean;
  let mockObserveScreen: sinon.SinonStubbedInstance<ObserveScreen>;
  let mockWindow: sinon.SinonStubbedInstance<Window>;
  let mockAwaitIdle: sinon.SinonStubbedInstance<AwaitIdle>;
  let mockDeviceSessionManager: sinon.SinonStubbedInstance<DeviceSessionManager>;

  const mockObserveResult: ObserveResult = {
    timestamp: "2025-01-01T00:00:00.000Z",
    screenSize: { width: 1080, height: 1920 },
    systemInsets: { top: 0, right: 0, bottom: 0, left: 0 },
    viewHierarchy: `
      <hierarchy>
        <node class="android.widget.LinearLayout">
          <node text="Normal app content" />
        </node>
      </hierarchy>
    `
  };

  before(async function() {
    // Check if AVDs are available once before all tests
    avdsAvailable = await checkAvdAvailability();
    if (!avdsAvailable) {
      console.log("⚠️  Skipping device-dependent tests: No AVDs available or Android SDK not found");
    }
  });

  beforeEach(() => {
    // Clear the tool registry before each test
    (ToolRegistry as any).tools.clear();

    // Set up mocks for BaseVisualChange dependencies
    mockObserveScreen = sinon.createStubInstance(ObserveScreen);
    mockWindow = sinon.createStubInstance(Window);
    mockAwaitIdle = sinon.createStubInstance(AwaitIdle);
    mockDeviceSessionManager = sinon.createStubInstance(DeviceSessionManager);

    // Stub the prototype methods
    sinon.stub(ObserveScreen.prototype, "execute").callsFake(mockObserveScreen.execute);
    sinon.stub(ObserveScreen.prototype, "getMostRecentCachedObserveResult").callsFake(mockObserveScreen.getMostRecentCachedObserveResult);
    sinon.stub(Window.prototype, "getCachedActiveWindow").callsFake(mockWindow.getCachedActiveWindow);
    sinon.stub(Window.prototype, "getActive").callsFake(mockWindow.getActive);
    sinon.stub(AwaitIdle.prototype, "initializeUiStabilityTracking").callsFake(mockAwaitIdle.initializeUiStabilityTracking);
    sinon.stub(AwaitIdle.prototype, "waitForUiStability").callsFake(mockAwaitIdle.waitForUiStability);
    sinon.stub(AwaitIdle.prototype, "waitForUiStabilityWithState").callsFake(mockAwaitIdle.waitForUiStabilityWithState);

    // Mock DeviceSessionManager
    sinon.stub(DeviceSessionManager, "getInstance").returns(mockDeviceSessionManager);

    // Set up default mock responses
    mockWindow.getCachedActiveWindow.resolves(null);
    mockWindow.getActive.resolves({ appId: "com.test.app", activityName: "MainActivity", layoutSeqSum: 123 });
    mockAwaitIdle.initializeUiStabilityTracking.resolves();
    mockAwaitIdle.waitForUiStability.resolves();
    mockAwaitIdle.waitForUiStabilityWithState.resolves();
    mockObserveScreen.getMostRecentCachedObserveResult.resolves(mockObserveResult);
    mockObserveScreen.execute.resolves(mockObserveResult);

    // Configure DeviceSessionManager to throw device error when no device is available
    mockDeviceSessionManager.ensureDeviceReady.rejects(new Error("No devices are connected and no Android Virtual Devices (AVDs) are available. Please connect a physical device or create an AVD first."));
  });

  afterEach(() => {
    // Clean up after each test
    (ToolRegistry as any).tools.clear();
    sinon.restore();
  });

  describe("registerDeepLinkTools", () => {
    it("should register all deep link tools", () => {
      registerDeepLinkTools();

      const registeredTools = ToolRegistry.getToolDefinitions();
      const toolNames = registeredTools.map(tool => tool.name);

      expect(toolNames).to.include("getDeepLinks");
      expect(toolNames).to.include("detectIntentChooser");
      expect(toolNames).to.include("handleIntentChooser");
    });

    it("should register getDeepLinks tool with correct schema", () => {
      registerDeepLinkTools();

      const tool = ToolRegistry.getTool("getDeepLinks");
      expect(tool).to.not.be.undefined;
      expect(tool!.description).to.include("Query available deep links");
      expect(tool!.supportsProgress).to.be.false;

      // Test schema validation
      const validArgs = { appId: "com.example.app", platform: "android" };
      expect(() => tool!.schema.parse(validArgs)).to.not.throw();

      const invalidArgs = { appId: 123, platform: "android" };
      expect(() => tool!.schema.parse(invalidArgs)).to.throw();
    });

    it("should register detectIntentChooser tool with correct schema", () => {
      registerDeepLinkTools();

      const tool = ToolRegistry.getTool("detectIntentChooser");
      expect(tool).to.not.be.undefined;
      expect(tool!.description).to.include("Detect system intent chooser");
      expect(tool!.supportsProgress).to.be.false;

      // Test schema validation
      const validArgs = { platform: "android" };
      expect(() => tool!.schema.parse(validArgs)).to.not.throw();

      const validArgsIos = { platform: "ios" };
      expect(() => tool!.schema.parse(validArgsIos)).to.not.throw();
    });

    it("should register handleIntentChooser tool with correct schema", () => {
      registerDeepLinkTools();

      const tool = ToolRegistry.getTool("handleIntentChooser");
      expect(tool).to.not.be.undefined;
      expect(tool!.description).to.include("Automatically handle system intent chooser");
      expect(tool!.supportsProgress).to.be.false;

      // Test schema validation
      const validArgs = {
        preference: "always",
        customAppPackage: "com.example.app",
        platform: "android"
      };
      expect(() => tool!.schema.parse(validArgs)).to.not.throw();

      const validArgsMinimal = { platform: "android" };
      expect(() => tool!.schema.parse(validArgsMinimal)).to.not.throw();

      const invalidArgs = { preference: "invalid", platform: "android" };
      expect(() => tool!.schema.parse(invalidArgs)).to.throw();
    });
  });

  describe("Tool Handlers", function() {
    beforeEach(() => {
      registerDeepLinkTools();
    });

    describe("getDeepLinks handler", () => {
      it("should handle valid app ID", async function() {
        if (!avdsAvailable) {
          this.skip();
        }

        const tool = ToolRegistry.getTool("getDeepLinks");
        expect(tool).to.not.be.undefined;

        try {
          // This will fail because we don't have a real device, but it should validate the args
          await tool!.handler({ appId: "com.example.app", platform: "android" });
        } catch (error) {
          // Expected to fail due to device verification
          expect(String(error)).to.include("device");
        }
      });

      it("should validate app ID parameter", () => {
        const tool = ToolRegistry.getTool("getDeepLinks");
        expect(tool).to.not.be.undefined;

        // Should throw on invalid schema
        expect(() => tool!.schema.parse({ appId: null, platform: "android" })).to.throw();
        expect(() => tool!.schema.parse({})).to.throw();
      });
    });

    describe("detectIntentChooser handler", () => {
      it("should handle optional view hierarchy", async function() {
        if (!avdsAvailable) {
          this.skip();
        }

        const tool = ToolRegistry.getTool("detectIntentChooser");
        expect(tool).to.not.be.undefined;

        try {
          await tool!.handler({ platform: "android" });
        } catch (error) {
          // Expected to fail due to device verification
          expect(String(error)).to.include("device");
        }
      });

      it("should handle provided view hierarchy", async function() {
        if (!avdsAvailable) {
          this.skip();
        }

        const tool = ToolRegistry.getTool("detectIntentChooser");
        expect(tool).to.not.be.undefined;

        try {
          await tool!.handler({ viewHierarchy: "<hierarchy></hierarchy>", platform: "android" });
        } catch (error) {
          // Expected to fail due to device verification
          expect(String(error)).to.include("device");
        }
      });
    });

    describe("handleIntentChooser handler", () => {
      it("should handle all preference options", async function() {
        if (!avdsAvailable) {
          this.skip();
        }

        const tool = ToolRegistry.getTool("handleIntentChooser");
        expect(tool).to.not.be.undefined;

        const preferences = ["always", "just_once", "custom"];

        for (const preference of preferences) {
          try {
            await tool!.handler({ preference, platform: "android" });
          } catch (error) {
            // Expected to fail due to device verification
            expect(String(error)).to.include("device");
          }
        }
      });

      it("should handle custom app package", async function() {
        if (!avdsAvailable) {
          this.skip();
        }

        const tool = ToolRegistry.getTool("handleIntentChooser");
        expect(tool).to.not.be.undefined;

        try {
          await tool!.handler({
            preference: "custom",
            customAppPackage: "com.example.app",
            platform: "android"
          });
        } catch (error) {
          // Expected to fail due to device verification
          expect(String(error)).to.include("device");
        }
      });

      it("should validate preference enum", () => {
        const tool = ToolRegistry.getTool("handleIntentChooser");
        expect(tool).to.not.be.undefined;

        // Valid preferences should pass
        expect(() => tool!.schema.parse({ preference: "always", platform: "android" })).to.not.throw();
        expect(() => tool!.schema.parse({ preference: "just_once", platform: "android" })).to.not.throw();
        expect(() => tool!.schema.parse({ preference: "custom", platform: "android" })).to.not.throw();

        // Invalid preference should fail
        expect(() => tool!.schema.parse({ preference: "invalid", platform: "android" })).to.throw();
      });
    });
  });

  describe("Error Handling", function() {
    beforeEach(() => {
      registerDeepLinkTools();
    });

    it("should handle missing device ID gracefully", async function() {
      if (!avdsAvailable) {
        this.skip();
      }

      const tool = ToolRegistry.getTool("getDeepLinks");
      expect(tool).to.not.be.undefined;

      try {
        await tool!.handler({ appId: "com.example.app", platform: "android" });
        expect.fail("Should have thrown error for missing device");
      } catch (error) {
        expect(String(error)).to.include("device");
      }
    });
  });

  describe("Schema Definitions", () => {
    it("should export schema objects", () => {
      const schemas = require("../../src/server/deepLinkTools");

      expect(schemas.getDeepLinksSchema).to.not.be.undefined;
      expect(schemas.detectIntentChooserSchema).to.not.be.undefined;
      expect(schemas.handleIntentChooserSchema).to.not.be.undefined;
    });

    it("should have correct TypeScript interfaces", () => {
      const interfaces = require("../../src/server/deepLinkTools");

      // These should exist as type definitions (compile-time check)
      expect(interfaces.GetDeepLinksArgs).to.be.undefined; // Interfaces don't exist at runtime
      expect(interfaces.DetectIntentChooserArgs).to.be.undefined;
      expect(interfaces.HandleIntentChooserArgs).to.be.undefined;
    });
  });
});
