import type { BootedDevice } from "../../models";
import type { A11yActionResult, A11yTapCoordinatesResult } from "../observe/accessibility/types";
import { AccessibilityServiceClient } from "../observe/AccessibilityServiceClient";
import { GetScreenSize } from "../observe/GetScreenSize";
import { AdbClientFactory, defaultAdbClientFactory } from "../../utils/android-cmdline-tools/AdbClientFactory";
import type { FocusNavigationDriver } from "./FocusNavigationExecutor";

/**
 * Extended driver interface for TalkBack navigation that adds tap and action capabilities.
 * This interface is used by TalkBackTapStrategy to perform element activation after navigation.
 */
export interface TalkBackNavigationDriver extends FocusNavigationDriver {
  /**
   * Request a tap at specific coordinates via accessibility service.
   * @param x - X coordinate
   * @param y - Y coordinate
   * @param durationMs - Duration of the tap in milliseconds
   */
  requestTapCoordinates(x: number, y: number, durationMs: number): Promise<A11yTapCoordinatesResult>;

  /**
   * Request an accessibility action on an element.
   * @param action - The action to perform (e.g., "click", "long_click")
   * @param resourceId - Optional resource ID of the target element
   */
  requestAction(action: string, resourceId?: string): Promise<A11yActionResult>;
}

/**
 * Default implementation of TalkBackNavigationDriver using AccessibilityServiceClient.
 */
export class DefaultTalkBackNavigationDriver implements TalkBackNavigationDriver {
  private accessibilityService: AccessibilityServiceClient;
  private screenSizeProvider: GetScreenSize;

  constructor(accessibilityService: AccessibilityServiceClient, screenSizeProvider: GetScreenSize) {
    this.accessibilityService = accessibilityService;
    this.screenSizeProvider = screenSizeProvider;
  }

  async requestTraversalOrder() {
    return this.accessibilityService.requestTraversalOrder();
  }

  async requestCurrentFocus() {
    return this.accessibilityService.requestCurrentFocus();
  }

  async requestSwipe(x1: number, y1: number, x2: number, y2: number, durationMs: number) {
    return this.accessibilityService.requestSwipe(x1, y1, x2, y2, durationMs);
  }

  async getScreenSize() {
    return this.screenSizeProvider.execute();
  }

  async requestTapCoordinates(x: number, y: number, durationMs: number): Promise<A11yTapCoordinatesResult> {
    return this.accessibilityService.requestTapCoordinates(x, y, durationMs);
  }

  async requestAction(action: string, resourceId?: string): Promise<A11yActionResult> {
    return this.accessibilityService.requestAction(action, resourceId);
  }
}

/**
 * Factory interface for creating TalkBackNavigationDriver instances.
 */
export interface TalkBackNavigationDriverFactory {
  createDriver(device: BootedDevice): TalkBackNavigationDriver;
}

/**
 * Default factory implementation for TalkBackNavigationDriver.
 */
export class DefaultTalkBackNavigationDriverFactory implements TalkBackNavigationDriverFactory {
  private adbFactory: AdbClientFactory;

  constructor(adbFactory: AdbClientFactory = defaultAdbClientFactory) {
    this.adbFactory = adbFactory;
  }

  createDriver(device: BootedDevice): TalkBackNavigationDriver {
    const accessibilityService = AccessibilityServiceClient.getInstance(device, this.adbFactory);
    const screenSizeProvider = new GetScreenSize(device, this.adbFactory);
    return new DefaultTalkBackNavigationDriver(accessibilityService, screenSizeProvider);
  }
}
