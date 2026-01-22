import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { McpTestFixture } from "../../fixtures/mcpTestFixture";
import { ResourceRegistry } from "../../../src/server/resourceRegistry";
import { FakeDeviceUtils } from "../../fakes/FakeDeviceUtils";
import { FakeTimer } from "../../fakes/FakeTimer";
import { setDeviceManager, BootedDevicesResourceContent } from "../../../src/server/bootedDeviceResources";
import { BootedDevice } from "../../../src/models";
import { DaemonState } from "../../../src/daemon/daemonState";
import { DevicePool } from "../../../src/daemon/devicePool";
import { SessionManager } from "../../../src/daemon/sessionManager";
import { z } from "zod";

describe("MCP Booted Device Resources", () => {
  let fixture: McpTestFixture;
  let fakeDeviceUtils: FakeDeviceUtils;

  // Mock device data
  const mockAndroidDevice1: BootedDevice = {
    name: "Pixel_7_API_34",
    platform: "android",
    deviceId: "emulator-5554",
    source: "local"
  };

  const mockAndroidDevice2: BootedDevice = {
    name: "Pixel_8_API_35",
    platform: "android",
    deviceId: "emulator-5556",
    source: "local"
  };

  const mockIosDevice1: BootedDevice = {
    name: "iPhone 15 Pro",
    platform: "ios",
    deviceId: "A1B2C3D4-E5F6-7890-ABCD-EF1234567890",
    source: "local"
  };

  const mockIosDevice2: BootedDevice = {
    name: "iPad Pro (12.9-inch)",
    platform: "ios",
    deviceId: "B2C3D4E5-F6A7-8901-BCDE-F12345678901",
    source: "local"
  };

  beforeAll(async () => {
    fixture = new McpTestFixture();
    await fixture.setup();
  });

  beforeEach(() => {
    // Set up fake device utils before each test
    fakeDeviceUtils = new FakeDeviceUtils();
    setDeviceManager(fakeDeviceUtils);
  });

  afterEach(() => {
    if (DaemonState.getInstance().isInitialized()) {
      DaemonState.getInstance().reset();
    }
  });

  afterAll(async () => {
    if (fixture) {
      await fixture.teardown();
    }
    // Reset to default device manager
    setDeviceManager(null);
  });

  describe("Resource Listing", () => {
    test("should include booted devices resource in list", async function() {
      const { client } = fixture.getContext();

      const listResourcesResponseSchema = z.object({
        resources: z.array(z.object({
          uri: z.string(),
          name: z.string().optional(),
          description: z.string().optional(),
          mimeType: z.string().optional()
        }))
      });

      const result = await client.request({
        method: "resources/list",
        params: {}
      }, listResourcesResponseSchema);

      // Verify booted devices resource is present
      const bootedDevicesResource = result.resources.find(
        (r: any) => r.uri === "automobile:devices/booted"
      );
      expect(bootedDevicesResource).toBeDefined();
      expect(bootedDevicesResource?.name).toBe("Booted Devices");
      expect(bootedDevicesResource?.mimeType).toBe("application/json");
    });

    test("should include booted devices template in resource templates list", async function() {
      const { client } = fixture.getContext();

      const listResourceTemplatesResponseSchema = z.object({
        resourceTemplates: z.array(z.object({
          uriTemplate: z.string(),
          name: z.string().optional(),
          description: z.string().optional(),
          mimeType: z.string().optional()
        }))
      });

      const result = await client.request({
        method: "resources/templates/list",
        params: {}
      }, listResourceTemplatesResponseSchema);

      // Verify booted devices template is present
      const bootedDevicesTemplate = result.resourceTemplates.find(
        (t: any) => t.uriTemplate === "automobile:devices/booted/{platform}"
      );
      expect(bootedDevicesTemplate).toBeDefined();
      expect(bootedDevicesTemplate?.name).toBe("Platform-specific Booted Devices");
      expect(bootedDevicesTemplate?.mimeType).toBe("application/json");
    });
  });

  describe("Resource Reading with Mock Devices", () => {
    test("should return correct counts when there are multiple devices", async function() {
      // Set up mock devices
      fakeDeviceUtils.setBootedDevices("android", [mockAndroidDevice1, mockAndroidDevice2]);
      fakeDeviceUtils.setBootedDevices("ios", [mockIosDevice1]);

      const { client } = fixture.getContext();

      const readResourceResponseSchema = z.object({
        contents: z.array(z.object({
          uri: z.string(),
          mimeType: z.string().optional(),
          text: z.string().optional(),
          blob: z.string().optional()
        }))
      });

      const result = await client.request({
        method: "resources/read",
        params: {
          uri: "automobile:devices/booted"
        }
      }, readResourceResponseSchema);

      // Verify response structure
      expect(result.contents).toHaveLength(1);
      const content = result.contents[0];
      expect(content.uri).toBe("automobile:devices/booted");
      expect(content.mimeType).toBe("application/json");
      expect(content.text).toBeDefined();

      // Parse and verify content
      const data: BootedDevicesResourceContent = JSON.parse(content.text!);
      expect(data.totalCount).toBe(3);
      expect(data.androidCount).toBe(2);
      expect(data.iosCount).toBe(1);
      expect(data.virtualCount).toBe(3);
      expect(data.physicalCount).toBe(0);
      expect(data.devices).toHaveLength(3);
      expect(data.poolStatus).toBeUndefined();

      // Verify lastUpdated is a valid ISO 8601 date
      expect(() => new Date(data.lastUpdated)).not.toThrow();
    });

    test("should return empty results when no devices are booted", async function() {
      // No devices set up - fakeDeviceUtils returns empty by default
      const { client } = fixture.getContext();

      const readResourceResponseSchema = z.object({
        contents: z.array(z.object({
          uri: z.string(),
          mimeType: z.string().optional(),
          text: z.string().optional(),
          blob: z.string().optional()
        }))
      });

      const result = await client.request({
        method: "resources/read",
        params: {
          uri: "automobile:devices/booted"
        }
      }, readResourceResponseSchema);

      const data: BootedDevicesResourceContent = JSON.parse(result.contents[0].text!);
      expect(data.totalCount).toBe(0);
      expect(data.androidCount).toBe(0);
      expect(data.iosCount).toBe(0);
      expect(data.virtualCount).toBe(0);
      expect(data.physicalCount).toBe(0);
      expect(data.devices).toHaveLength(0);
      expect(data.poolStatus).toBeUndefined();
    });

    test("should filter correctly for android platform", async function() {
      // Set up both Android and iOS devices
      fakeDeviceUtils.setBootedDevices("android", [mockAndroidDevice1, mockAndroidDevice2]);
      fakeDeviceUtils.setBootedDevices("ios", [mockIosDevice1, mockIosDevice2]);

      const { client } = fixture.getContext();

      const readResourceResponseSchema = z.object({
        contents: z.array(z.object({
          uri: z.string(),
          mimeType: z.string().optional(),
          text: z.string().optional(),
          blob: z.string().optional()
        }))
      });

      const result = await client.request({
        method: "resources/read",
        params: {
          uri: "automobile:devices/booted/android"
        }
      }, readResourceResponseSchema);

      // Verify response structure
      expect(result.contents).toHaveLength(1);
      const content = result.contents[0];
      expect(content.uri).toBe("automobile:devices/booted/android");

      // Parse and verify content
      const data: BootedDevicesResourceContent = JSON.parse(content.text!);
      expect(data.totalCount).toBe(2);
      expect(data.androidCount).toBe(2);
      expect(data.iosCount).toBe(0);
      expect(data.virtualCount).toBe(2);
      expect(data.physicalCount).toBe(0);
      expect(data.devices).toHaveLength(2);

      // Verify all devices are Android
      for (const device of data.devices) {
        expect(device.platform).toBe("android");
      }
    });

    test("should filter correctly for ios platform", async function() {
      // Set up both Android and iOS devices
      fakeDeviceUtils.setBootedDevices("android", [mockAndroidDevice1]);
      fakeDeviceUtils.setBootedDevices("ios", [mockIosDevice1, mockIosDevice2]);

      const { client } = fixture.getContext();

      const readResourceResponseSchema = z.object({
        contents: z.array(z.object({
          uri: z.string(),
          mimeType: z.string().optional(),
          text: z.string().optional(),
          blob: z.string().optional()
        }))
      });

      const result = await client.request({
        method: "resources/read",
        params: {
          uri: "automobile:devices/booted/ios"
        }
      }, readResourceResponseSchema);

      // Verify response structure
      expect(result.contents).toHaveLength(1);
      const content = result.contents[0];
      expect(content.uri).toBe("automobile:devices/booted/ios");

      // Parse and verify content
      const data: BootedDevicesResourceContent = JSON.parse(content.text!);
      expect(data.totalCount).toBe(2);
      expect(data.androidCount).toBe(0);
      expect(data.iosCount).toBe(2);
      expect(data.virtualCount).toBe(2);
      expect(data.physicalCount).toBe(0);
      expect(data.devices).toHaveLength(2);

      // Verify all devices are iOS
      for (const device of data.devices) {
        expect(device.platform).toBe("ios");
      }
    });

    test("should include all device properties in response", async function() {
      // Set up a single device to check all properties
      fakeDeviceUtils.setBootedDevices("android", [mockAndroidDevice1]);

      const { client } = fixture.getContext();

      const readResourceResponseSchema = z.object({
        contents: z.array(z.object({
          uri: z.string(),
          mimeType: z.string().optional(),
          text: z.string().optional(),
          blob: z.string().optional()
        }))
      });

      const result = await client.request({
        method: "resources/read",
        params: {
          uri: "automobile:devices/booted"
        }
      }, readResourceResponseSchema);

      const data: BootedDevicesResourceContent = JSON.parse(result.contents[0].text!);
      expect(data.devices).toHaveLength(1);

      const device = data.devices[0];
      expect(device.name).toBe("Pixel_7_API_34");
      expect(device.platform).toBe("android");
      expect(device.deviceId).toBe("emulator-5554");
      expect(device.source).toBe("local");
      expect(device.isVirtual).toBe(true);
      expect(device.poolStatus).toBeUndefined();
    });

    test("should include pool status when daemon is initialized", async function() {
      fakeDeviceUtils.setBootedDevices("android", [mockAndroidDevice1, mockAndroidDevice2]);

      const fakeTimer = new FakeTimer();
      const sessionManager = new SessionManager(fakeTimer);
      const { FakeInstalledAppsRepository } = await import("../../fakes/FakeInstalledAppsRepository");
      const fakeAppsRepo = new FakeInstalledAppsRepository();
      const devicePool = new DevicePool(sessionManager, "test-daemon-session-id", fakeTimer, fakeAppsRepo);
      await devicePool.initializeWithDevices([
        mockAndroidDevice1,
        mockAndroidDevice2
      ]);

      const sessionId = "session-123";
      await devicePool.assignDeviceToSession(sessionId);
      DaemonState.getInstance().initialize(sessionManager, devicePool);

      const { client } = fixture.getContext();

      const readResourceResponseSchema = z.object({
        contents: z.array(z.object({
          uri: z.string(),
          mimeType: z.string().optional(),
          text: z.string().optional(),
          blob: z.string().optional()
        }))
      });

      const result = await client.request({
        method: "resources/read",
        params: {
          uri: "automobile:devices/booted"
        }
      }, readResourceResponseSchema);

      const data: BootedDevicesResourceContent = JSON.parse(result.contents[0].text!);
      expect(data.poolStatus).toEqual({
        enabled: true,
        idle: 1,
        assigned: 1,
        error: 0,
        total: 2
      });

      const assignedDevice = data.devices.find(device => device.assignedSession === sessionId);
      expect(assignedDevice).toBeDefined();
      expect(assignedDevice?.poolStatus).toBe("assigned");

      const idleDevice = data.devices.find(
        device => device.deviceId !== assignedDevice?.deviceId
      );
      expect(idleDevice).toBeDefined();
      expect(idleDevice?.poolStatus).toBe("idle");

      // Clean up SessionManager timer to prevent process hang
      sessionManager.stopCleanupTimer();
    });

    test("should return error for invalid platform", async function() {
      const { client } = fixture.getContext();

      const readResourceResponseSchema = z.object({
        contents: z.array(z.object({
          uri: z.string(),
          mimeType: z.string().optional(),
          text: z.string().optional(),
          blob: z.string().optional()
        }))
      });

      const result = await client.request({
        method: "resources/read",
        params: {
          uri: "automobile:devices/booted/invalid"
        }
      }, readResourceResponseSchema);

      // Verify error response
      expect(result.contents).toHaveLength(1);
      const content = result.contents[0];
      const data = JSON.parse(content.text!);
      expect(data).toHaveProperty("error");
      expect(data.error).toContain("Invalid platform");
    });
  });

  describe("Device Manager Integration", () => {
    test("should call getBootedDevices for android when filtering", async function() {
      fakeDeviceUtils.setBootedDevices("android", [mockAndroidDevice1]);

      const { client } = fixture.getContext();

      const readResourceResponseSchema = z.object({
        contents: z.array(z.object({
          uri: z.string(),
          mimeType: z.string().optional(),
          text: z.string().optional(),
          blob: z.string().optional()
        }))
      });

      await client.request({
        method: "resources/read",
        params: {
          uri: "automobile:devices/booted/android"
        }
      }, readResourceResponseSchema);

      // Verify getBootedDevices was called for android
      expect(fakeDeviceUtils.wasMethodCalled("getBootedDevices")).toBe(true);
      const operations = fakeDeviceUtils.getExecutedOperations();
      expect(operations).toContain("getBootedDevices:android");
    });

    test("should call getBootedDevices for both platforms when requesting all devices", async function() {
      fakeDeviceUtils.setBootedDevices("android", [mockAndroidDevice1]);
      fakeDeviceUtils.setBootedDevices("ios", [mockIosDevice1]);

      const { client } = fixture.getContext();

      const readResourceResponseSchema = z.object({
        contents: z.array(z.object({
          uri: z.string(),
          mimeType: z.string().optional(),
          text: z.string().optional(),
          blob: z.string().optional()
        }))
      });

      await client.request({
        method: "resources/read",
        params: {
          uri: "automobile:devices/booted"
        }
      }, readResourceResponseSchema);

      // Verify getBootedDevices was called for both platforms
      const operations = fakeDeviceUtils.getExecutedOperations();
      expect(operations).toContain("getBootedDevices:android");
      expect(operations).toContain("getBootedDevices:ios");
    });
  });
});

describe("ResourceRegistry Template Matching", () => {
  beforeEach(() => {
    ResourceRegistry.clearResources();
  });

  afterEach(() => {
    ResourceRegistry.clearResources();
  });

  test("should match simple template with single parameter", () => {
    ResourceRegistry.registerTemplate(
      "test://items/{id}",
      "Test Item",
      "Test item description",
      "application/json",
      async params => ({
        uri: `test://items/${params.id}`,
        mimeType: "application/json",
        text: JSON.stringify({ id: params.id })
      })
    );

    const match = ResourceRegistry.matchTemplate("test://items/123");
    expect(match).toBeDefined();
    expect(match!.params).toEqual({ id: "123" });
    expect(match!.template.uriTemplate).toBe("test://items/{id}");
  });

  test("should match template with multiple parameters", () => {
    ResourceRegistry.registerTemplate(
      "test://users/{userId}/posts/{postId}",
      "User Post",
      "A user's post",
      "application/json",
      async params => ({
        uri: `test://users/${params.userId}/posts/${params.postId}`,
        mimeType: "application/json",
        text: JSON.stringify(params)
      })
    );

    const match = ResourceRegistry.matchTemplate("test://users/user-123/posts/post-456");
    expect(match).toBeDefined();
    expect(match!.params).toEqual({ userId: "user-123", postId: "post-456" });
  });

  test("should not match non-matching URIs", () => {
    ResourceRegistry.registerTemplate(
      "test://items/{id}",
      "Test Item",
      "Test item description",
      "application/json",
      async params => ({
        uri: `test://items/${params.id}`,
        mimeType: "application/json",
        text: "{}"
      })
    );

    expect(ResourceRegistry.matchTemplate("test://other/123")).toBeUndefined();
    expect(ResourceRegistry.matchTemplate("test://items/")).toBeUndefined();
    expect(ResourceRegistry.matchTemplate("test://items")).toBeUndefined();
  });

  test("should prefer exact resource match over template", () => {
    // Register both exact resource and template
    ResourceRegistry.register(
      "test://items/special",
      "Special Item",
      "A special item",
      "application/json",
      async () => ({
        uri: "test://items/special",
        mimeType: "application/json",
        text: JSON.stringify({ type: "exact" })
      })
    );

    ResourceRegistry.registerTemplate(
      "test://items/{id}",
      "Generic Item",
      "A generic item",
      "application/json",
      async params => ({
        uri: `test://items/${params.id}`,
        mimeType: "application/json",
        text: JSON.stringify({ type: "template", id: params.id })
      })
    );

    // Exact match should be found
    const exactResource = ResourceRegistry.getResource("test://items/special");
    expect(exactResource).toBeDefined();
    expect(exactResource!.name).toBe("Special Item");

    // Template should still match other URIs
    const templateMatch = ResourceRegistry.matchTemplate("test://items/other");
    expect(templateMatch).toBeDefined();
    expect(templateMatch!.params.id).toBe("other");
  });

  test("should return template definitions in correct format", () => {
    ResourceRegistry.registerTemplate(
      "test://items/{id}",
      "Test Item",
      "Test item description",
      "application/json",
      async () => ({
        uri: "test://items/1",
        mimeType: "application/json",
        text: "{}"
      })
    );

    const definitions = ResourceRegistry.getTemplateDefinitions();
    expect(definitions).toHaveLength(1);
    expect(definitions[0]).toEqual({
      uriTemplate: "test://items/{id}",
      name: "Test Item",
      description: "Test item description",
      mimeType: "application/json"
    });
  });
});
