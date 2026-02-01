import type { BootedDevice } from "../../models";
import type { AdbClientFactory } from "../../utils/android-cmdline-tools/AdbClientFactory";
import type { ScreenshotService } from "./interfaces/ScreenshotService";
import type { ScreenSize } from "./interfaces/ScreenSize";
import type { SystemInsets } from "./interfaces/SystemInsets";
import type { ViewHierarchy } from "./interfaces/ViewHierarchy";
import type { Window } from "./interfaces/Window";
import type { DumpsysWindow } from "./interfaces/DumpsysWindow";
import type { BackStack } from "./interfaces/BackStack";
import type { PredictiveUIState } from "./interfaces/PredictiveUIState";

/**
 * Dependencies for ObserveScreen that can be injected for testing.
 * All properties are optional - defaults will be created if not provided.
 */
export interface ObserveScreenDependencies {
  screenSize?: ScreenSize;
  systemInsets?: SystemInsets;
  viewHierarchy?: ViewHierarchy;
  window?: Window;
  screenshot?: ScreenshotService;
  dumpsysWindow?: DumpsysWindow;
  backStack?: BackStack;
  predictiveUIState?: PredictiveUIState;
}

/**
 * Create default dependency implementations for ObserveScreen.
 * @param device - The booted device
 * @param adbFactory - ADB client factory
 * @returns Required dependencies with all implementations created
 */
export function createDefaultDependencies(
  device: BootedDevice,
  adbFactory: AdbClientFactory
): Required<ObserveScreenDependencies> {
  // Import implementations lazily to avoid circular dependencies
  const { GetScreenSize } = require("./GetScreenSize");
  const { GetSystemInsets } = require("./GetSystemInsets");
  const { ViewHierarchy } = require("./ViewHierarchy");
  const { Window } = require("./Window");
  const { TakeScreenshot } = require("./TakeScreenshot");
  const { GetDumpsysWindow } = require("./GetDumpsysWindow");
  const { GetBackStack } = require("./GetBackStack");
  const { PredictiveUIState } = require("./PredictiveUIState");

  return {
    screenSize: new GetScreenSize(device, adbFactory),
    systemInsets: new GetSystemInsets(device, adbFactory),
    viewHierarchy: new ViewHierarchy(device, adbFactory),
    window: new Window(device, adbFactory),
    screenshot: new TakeScreenshot(device, adbFactory),
    dumpsysWindow: new GetDumpsysWindow(device, adbFactory),
    backStack: new GetBackStack(adbFactory, device),
    predictiveUIState: new PredictiveUIState()
  };
}
