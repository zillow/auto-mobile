/**
 * Interface compliance tests for DeviceService implementations.
 *
 * These tests verify that both AccessibilityServiceClient (Android) and
 * XCTestServiceClient (iOS) properly implement the DeviceService interface.
 *
 * The tests focus on:
 * 1. Type compatibility - instances can be assigned to interface type
 * 2. Method presence - all required interface methods exist
 * 3. Connection lifecycle - shared connection management works correctly
 */

import { describe, expect, test } from "bun:test";
import type { DeviceService, AndroidDeviceService } from "../../../src/features/observe/DeviceService";
import { AccessibilityServiceClient } from "../../../src/features/observe/AccessibilityServiceClient";
import { XCTestServiceClient } from "../../../src/features/observe/XCTestServiceClient";
import { FakeAdbExecutor } from "../../fakes/FakeAdbExecutor";
import { BootedDevice } from "../../../src/models";
import {
  createSuccessWebSocketFactory,
  createInstantFailureWebSocketFactory,
} from "../../fakes/FakeWebSocket";
import { FakeTimer } from "../../fakes/FakeTimer";

describe("DeviceService Interface Compliance", () => {
  // ===========================================================================
  // Type Compliance Tests (compile-time verification)
  // ===========================================================================

  describe("Type Compliance", () => {
    test("AccessibilityServiceClient implements DeviceService interface", () => {
      // This test verifies at compile-time that AccessibilityServiceClient
      // is assignable to the DeviceService interface
      const fakeTimer = new FakeTimer();
      fakeTimer.enableAutoAdvance();
      const fakeAdb = new FakeAdbExecutor();
      fakeAdb.setCommandResponse("forward", { stdout: "8765", stderr: "" });

      const testDevice: BootedDevice = {
        deviceId: "test-android-device",
        platform: "android",
        isEmulator: true,
        name: "Test Android Device",
      };

      AccessibilityServiceClient.resetInstances();
      // Pass FakeAdbExecutor directly since it implements AdbExecutor interface
      const client = AccessibilityServiceClient.createForTesting(
        testDevice,
        fakeAdb,
        createSuccessWebSocketFactory(),
        fakeTimer
      );

      // Type assertion: AccessibilityServiceClient should be assignable to DeviceService
      const deviceService: DeviceService = client;

      // Verify the interface methods exist
      expect(typeof deviceService.ensureConnected).toBe("function");
      expect(typeof deviceService.waitForConnection).toBe("function");
      expect(typeof deviceService.isConnected).toBe("function");
      expect(typeof deviceService.close).toBe("function");
      expect(typeof deviceService.requestTapCoordinates).toBe("function");
      expect(typeof deviceService.requestSwipe).toBe("function");
      expect(typeof deviceService.requestDrag).toBe("function");
      expect(typeof deviceService.requestPinch).toBe("function");
      expect(typeof deviceService.requestSetText).toBe("function");
      expect(typeof deviceService.requestClearText).toBe("function");
      expect(typeof deviceService.requestImeAction).toBe("function");
      expect(typeof deviceService.requestScreenshot).toBe("function");

      // Cleanup
      void client.close();
    });

    test("XCTestServiceClient implements DeviceService interface", () => {
      // This test verifies at compile-time that XCTestServiceClient
      // is assignable to the DeviceService interface
      const fakeTimer = new FakeTimer();
      fakeTimer.enableAutoAdvance();

      const testDevice: BootedDevice = {
        deviceId: "A1B2C3D4-E5F6-7890-ABCD-EF1234567890",
        platform: "ios",
        name: "Test iOS Device",
      };

      XCTestServiceClient.resetInstances();
      const client = XCTestServiceClient.createForTesting(
        testDevice,
        8765,
        createSuccessWebSocketFactory(fakeTimer),
        fakeTimer
      );

      // Type assertion: XCTestServiceClient should be assignable to DeviceService
      const deviceService: DeviceService = client;

      // Verify the interface methods exist
      expect(typeof deviceService.ensureConnected).toBe("function");
      expect(typeof deviceService.waitForConnection).toBe("function");
      expect(typeof deviceService.isConnected).toBe("function");
      expect(typeof deviceService.close).toBe("function");
      expect(typeof deviceService.requestTapCoordinates).toBe("function");
      expect(typeof deviceService.requestSwipe).toBe("function");
      expect(typeof deviceService.requestDrag).toBe("function");
      expect(typeof deviceService.requestPinch).toBe("function");
      expect(typeof deviceService.requestSetText).toBe("function");
      expect(typeof deviceService.requestClearText).toBe("function");
      expect(typeof deviceService.requestImeAction).toBe("function");
      expect(typeof deviceService.requestScreenshot).toBe("function");

      // Cleanup
      void client.close();
    });

    test("AccessibilityServiceClient implements AndroidDeviceService interface", () => {
      const fakeTimer = new FakeTimer();
      fakeTimer.enableAutoAdvance();
      const fakeAdb = new FakeAdbExecutor();
      fakeAdb.setCommandResponse("forward", { stdout: "8765", stderr: "" });

      const testDevice: BootedDevice = {
        deviceId: "test-android-device",
        platform: "android",
        isEmulator: true,
        name: "Test Android Device",
      };

      AccessibilityServiceClient.resetInstances();
      // Pass FakeAdbExecutor directly since it implements AdbExecutor interface
      const client = AccessibilityServiceClient.createForTesting(
        testDevice,
        fakeAdb,
        createSuccessWebSocketFactory(),
        fakeTimer
      );

      // Type assertion: AccessibilityServiceClient should be assignable to AndroidDeviceService
      const androidService: AndroidDeviceService = client;

      // Verify Android-specific interface methods exist
      expect(typeof androidService.requestClipboard).toBe("function");
      expect(typeof androidService.requestSelectAll).toBe("function");
      expect(typeof androidService.requestAction).toBe("function");
      expect(typeof androidService.requestCurrentFocus).toBe("function");
      expect(typeof androidService.requestTraversalOrder).toBe("function");

      // Cleanup
      void client.close();
    });

    test("XCTestServiceClient has Apple-specific methods", () => {
      const fakeTimer = new FakeTimer();
      fakeTimer.enableAutoAdvance();

      const testDevice: BootedDevice = {
        deviceId: "A1B2C3D4-E5F6-7890-ABCD-EF1234567890",
        platform: "ios",
        name: "Test iOS Device",
      };

      XCTestServiceClient.resetInstances();
      const client = XCTestServiceClient.createForTesting(
        testDevice,
        8765,
        createSuccessWebSocketFactory(fakeTimer),
        fakeTimer
      );

      // Verify Apple-specific interface methods exist
      // Note: XCTestServiceClient currently implements requestLaunchApp and requestPressHome
      // but not all AppleDeviceService methods (requestTerminateApp, requestPressButton)
      expect(typeof client.requestLaunchApp).toBe("function");
      expect(typeof client.requestPressHome).toBe("function");

      // Cleanup
      void client.close();
    });
  });

  // ===========================================================================
  // Connection State Tests (shared behavior via base class)
  // ===========================================================================

  describe("Connection State (Android)", () => {
    test("isConnected returns false before connection", () => {
      const fakeTimer = new FakeTimer();
      fakeTimer.enableAutoAdvance();
      const fakeAdb = new FakeAdbExecutor();
      fakeAdb.setCommandResponse("forward", { stdout: "8765", stderr: "" });

      const testDevice: BootedDevice = {
        deviceId: "test-android-device",
        platform: "android",
        isEmulator: true,
        name: "Test Android Device",
      };

      AccessibilityServiceClient.resetInstances();
      // Pass FakeAdbExecutor directly since it implements AdbExecutor interface
      const client = AccessibilityServiceClient.createForTesting(
        testDevice,
        fakeAdb,
        createSuccessWebSocketFactory(fakeTimer),
        fakeTimer
      );

      expect(client.isConnected()).toBe(false);
      void client.close();
    });

    test("ensureConnected returns false on connection failure", async () => {
      const fakeTimer = new FakeTimer();
      fakeTimer.enableAutoAdvance();
      const fakeAdb = new FakeAdbExecutor();
      fakeAdb.setCommandResponse("forward", { stdout: "8765", stderr: "" });

      const testDevice: BootedDevice = {
        deviceId: "test-android-device",
        platform: "android",
        isEmulator: true,
        name: "Test Android Device",
      };

      AccessibilityServiceClient.resetInstances();
      // Pass FakeAdbExecutor directly since it implements AdbExecutor interface
      const client = AccessibilityServiceClient.createForTesting(
        testDevice,
        fakeAdb,
        createInstantFailureWebSocketFactory(fakeTimer),
        fakeTimer
      );

      const connected = await client.ensureConnected();
      expect(connected).toBe(false);
      expect(client.isConnected()).toBe(false);

      await client.close();
    });
  });

  describe("Connection State (iOS)", () => {
    test("isConnected returns false before connection", () => {
      const fakeTimer = new FakeTimer();
      fakeTimer.enableAutoAdvance();

      const testDevice: BootedDevice = {
        deviceId: "A1B2C3D4-E5F6-7890-ABCD-EF1234567890",
        platform: "ios",
        name: "Test iOS Device",
      };

      XCTestServiceClient.resetInstances();
      const client = XCTestServiceClient.createForTesting(
        testDevice,
        8765,
        createSuccessWebSocketFactory(fakeTimer),
        fakeTimer
      );

      expect(client.isConnected()).toBe(false);
      void client.close();
    });

    test("ensureConnected returns false on connection failure", async () => {
      const fakeTimer = new FakeTimer();
      fakeTimer.enableAutoAdvance();

      const testDevice: BootedDevice = {
        deviceId: "A1B2C3D4-E5F6-7890-ABCD-EF1234567890",
        platform: "ios",
        name: "Test iOS Device",
      };

      XCTestServiceClient.resetInstances();
      const client = XCTestServiceClient.createForTesting(
        testDevice,
        8765,
        createInstantFailureWebSocketFactory(fakeTimer),
        fakeTimer
      );

      const connected = await client.ensureConnected();
      expect(connected).toBe(false);
      expect(client.isConnected()).toBe(false);

      await client.close();
    });
  });
});
