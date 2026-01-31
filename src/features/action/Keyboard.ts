import { AdbClientFactory, defaultAdbClientFactory } from "../../utils/android-cmdline-tools/AdbClientFactory";
import type { AdbExecutor } from "../../utils/android-cmdline-tools/interfaces/AdbExecutor";
import { BootedDevice, Element, ElementBounds, KeyboardResult, ViewHierarchyResult } from "../../models";
import { ElementUtils } from "../utility/ElementUtils";
import { ViewHierarchy } from "../observe/ViewHierarchy";
import { NoOpPerformanceTracker } from "../../utils/PerformanceTracker";
import { Timer, defaultTimer } from "../../utils/SystemTimer";

export type KeyboardAction = "open" | "close" | "detect";

export interface KeyboardHierarchyProvider {
  getViewHierarchy(signal?: AbortSignal): Promise<ViewHierarchyResult | null>;
}

class DefaultKeyboardHierarchyProvider implements KeyboardHierarchyProvider {
  private viewHierarchy: ViewHierarchy;

  constructor(viewHierarchy: ViewHierarchy) {
    this.viewHierarchy = viewHierarchy;
  }

  async getViewHierarchy(signal?: AbortSignal): Promise<ViewHierarchyResult | null> {
    return this.viewHierarchy.getViewHierarchy(
      undefined,
      new NoOpPerformanceTracker(),
      false,
      0,
      signal
    );
  }
}

type KeyboardDetection = {
  open: boolean;
  bounds?: ElementBounds[];
  error?: string;
};

export class Keyboard {
  private static readonly INPUT_METHOD_WINDOW_TYPE = 2;
  private static readonly POST_ACTION_DELAY_MS = 100;
  private device: BootedDevice;
  private adb: AdbExecutor;
  private hierarchyProvider: KeyboardHierarchyProvider;
  private elementUtils: ElementUtils;
  private timer: Timer;

  constructor(
    device: BootedDevice,
    adbFactory: AdbClientFactory = defaultAdbClientFactory,
    hierarchyProvider?: KeyboardHierarchyProvider,
    timer: Timer = defaultTimer
  ) {
    this.device = device;
    this.adb = adbFactory.create(device);
    this.elementUtils = new ElementUtils();
    this.timer = timer;

    if (hierarchyProvider) {
      this.hierarchyProvider = hierarchyProvider;
    } else {
      this.hierarchyProvider = new DefaultKeyboardHierarchyProvider(
        new ViewHierarchy(device, adbFactory)
      );
    }
  }

  async execute(action: KeyboardAction, signal?: AbortSignal): Promise<KeyboardResult> {
    if (this.device.platform === "ios") {
      return {
        success: false,
        open: false,
        message: "iOS keyboard management is not yet supported",
        error: "iOS keyboard management is not yet supported"
      };
    }

    switch (action) {
      case "detect": {
        return this.detect(signal);
      }
      case "open": {
        return this.open(signal);
      }
      case "close": {
        return this.close(signal);
      }
      default:
        return {
          success: false,
          open: false,
          message: `Unsupported keyboard action: ${action}`,
          error: `Unsupported keyboard action: ${action}`
        };
    }
  }

  private async detect(signal?: AbortSignal): Promise<KeyboardResult> {
    const { state } = await this.getHierarchyWithState(signal);
    if (state.error) {
      return {
        success: false,
        open: state.open,
        bounds: state.bounds,
        message: state.error,
        error: state.error
      };
    }

    return {
      success: true,
      open: state.open,
      bounds: state.bounds,
      message: state.open ? "Keyboard is open" : "Keyboard is closed"
    };
  }

  private async open(signal?: AbortSignal): Promise<KeyboardResult> {
    const { hierarchy, state } = await this.getHierarchyWithState(signal);
    if (state.error) {
      return {
        success: false,
        open: state.open,
        bounds: state.bounds,
        message: state.error,
        error: state.error
      };
    }

    if (state.open) {
      return {
        success: true,
        open: true,
        bounds: state.bounds,
        message: "Keyboard already open"
      };
    }

    const focusedInput = hierarchy ? this.findFocusedTextInput(hierarchy) : null;
    if (!focusedInput) {
      return {
        success: false,
        open: false,
        message: "No focused text input to open keyboard",
        error: "No focused text input to open keyboard"
      };
    }

    await this.tapOnElement(focusedInput, signal);
    await this.timer.sleep(Keyboard.POST_ACTION_DELAY_MS);

    const { state: afterState } = await this.getHierarchyWithState(signal);
    const success = afterState.open && !afterState.error;
    const message = success
      ? "Keyboard opened"
      : afterState.error ?? "Failed to open keyboard";

    return {
      success,
      open: afterState.open,
      bounds: afterState.bounds,
      message,
      ...(afterState.error ? { error: afterState.error } : {})
    };
  }

  private async close(signal?: AbortSignal): Promise<KeyboardResult> {
    const { state } = await this.getHierarchyWithState(signal);
    if (state.error) {
      return {
        success: false,
        open: state.open,
        bounds: state.bounds,
        message: state.error,
        error: state.error
      };
    }

    if (!state.open) {
      return {
        success: true,
        open: false,
        message: "Keyboard already closed"
      };
    }

    await this.adb.executeCommand("shell input keyevent KEYCODE_BACK", undefined, undefined, undefined, signal);
    await this.timer.sleep(Keyboard.POST_ACTION_DELAY_MS);

    const { state: afterState } = await this.getHierarchyWithState(signal);
    const success = !afterState.open && !afterState.error;
    const message = success
      ? "Keyboard closed"
      : afterState.error ?? "Failed to close keyboard";

    return {
      success,
      open: afterState.open,
      bounds: afterState.bounds,
      message,
      ...(afterState.error ? { error: afterState.error } : {})
    };
  }

  private async getHierarchyWithState(
    signal?: AbortSignal
  ): Promise<{ hierarchy: ViewHierarchyResult | null; state: KeyboardDetection }> {
    const hierarchy = await this.hierarchyProvider.getViewHierarchy(signal);
    return { hierarchy, state: this.resolveKeyboardState(hierarchy) };
  }

  private resolveKeyboardState(viewHierarchy: ViewHierarchyResult | null): KeyboardDetection {
    if (!viewHierarchy) {
      return { open: false, error: "No view hierarchy available" };
    }

    const windowBounds = this.findKeyboardWindowBounds(viewHierarchy);
    if (windowBounds) {
      return { open: true, bounds: [windowBounds] };
    }

    if (this.detectKeyboardInHierarchy(viewHierarchy)) {
      return { open: true };
    }

    const hierarchyError = viewHierarchy.hierarchy?.error;
    if (hierarchyError) {
      return { open: false, error: hierarchyError };
    }

    return { open: false };
  }

  private findKeyboardWindowBounds(viewHierarchy: ViewHierarchyResult): ElementBounds | null {
    const windows = viewHierarchy.windows ?? [];
    for (const windowInfo of windows) {
      if (windowInfo.type !== Keyboard.INPUT_METHOD_WINDOW_TYPE) {
        continue;
      }
      if (windowInfo.bounds && this.isValidBounds(windowInfo.bounds)) {
        return windowInfo.bounds;
      }
    }
    return null;
  }

  private isValidBounds(bounds: ElementBounds): boolean {
    return bounds.right > bounds.left && bounds.bottom > bounds.top;
  }

  private detectKeyboardInHierarchy(viewHierarchy: ViewHierarchyResult): boolean {
    const rootNodes = this.elementUtils.extractRootNodes(viewHierarchy);
    const indicators = ["delete", "enter", "keyboard", "emoji", "shift"];
    for (const rootNode of rootNodes) {
      let found = false;
      this.elementUtils.traverseNode(rootNode, (node: any) => {
        if (found) {
          return;
        }
        const props = this.elementUtils.extractNodeProperties(node);
        const resourceId = this.getStringProp(props, "resource-id", "resourceId");
        const contentDesc = this.getStringProp(props, "content-desc", "contentDesc");
        const resourceValue = resourceId?.toLowerCase();
        const contentValue = contentDesc?.toLowerCase();

        if (resourceValue && (resourceValue.includes("keyboard") || resourceValue.includes("inputmethod"))) {
          found = true;
          return;
        }
        if (contentValue && indicators.some(indicator => contentValue.includes(indicator))) {
          found = true;
        }
      });
      if (found) {
        return true;
      }
    }

    return false;
  }

  private getStringProp(props: Record<string, unknown>, primary: string, fallback: string): string | undefined {
    const primaryValue = props[primary];
    if (typeof primaryValue === "string") {
      return primaryValue;
    }
    const fallbackValue = props[fallback];
    if (typeof fallbackValue === "string") {
      return fallbackValue;
    }
    return undefined;
  }

  private findFocusedTextInput(viewHierarchy: ViewHierarchyResult): Element | null {
    const focusedElement = this.elementUtils.findFocusedTextInput(viewHierarchy);
    if (!focusedElement || !focusedElement.bounds) {
      return null;
    }
    return focusedElement as Element;
  }

  private async tapOnElement(element: Element, signal?: AbortSignal): Promise<void> {
    const center = this.elementUtils.getElementCenter(element);
    const x = Math.round(center.x);
    const y = Math.round(center.y);
    await this.adb.executeCommand(`shell input tap ${x} ${y}`, undefined, undefined, undefined, signal);
  }
}
