import { faker } from "@faker-js/faker";
import {
  ElementBounds,
  Element,
  ScreenSize,
  SystemInsets,
  Point,
  ObserveResult,
  ActiveWindowInfo,
  TapResult,
  TapOnTextResult,
  ExitDialogResult,
  LaunchAppResult,
  TerminateAppResult,
  ClearAppDataResult,
  InstallAppResult,
  OpenURLResult,
  SendTextResult,
  SendKeyEventResult,
  PressButtonResult,
  RotateResult,
  SwipeResult
} from "../../src/models";

/**
 * Utility class for generating fake model data for testing
 */
export class ResultFaker {
  /**
   * Set a seed for deterministic fake data generation
   */
  static setSeed(seed: number): void {
    faker.seed(seed);
  }

  /**
   * Generate fake ElementBounds
   */
  static elementBounds(overrides: Partial<ElementBounds> = {}): ElementBounds {
    return {
      left: overrides.left ?? faker.number.int({ min: 0, max: 1000 }),
      top: overrides.top ?? faker.number.int({ min: 0, max: 1600 }),
      right: overrides.right ?? faker.number.int({ min: overrides.left ?? 0, max: 1080 }),
      bottom: overrides.bottom ?? faker.number.int({ min: overrides.top ?? 0, max: 1920 })
    };
  }

  /**
   * Generate fake Element
   */
  static element(overrides: Partial<Element> = {}): Element {
    const bounds = overrides.bounds ?? this.elementBounds();

    return {
      bounds,
      "text": overrides.text ?? faker.helpers.maybe(() => faker.lorem.words({ min: 1, max: 5 })),
      "content-desc": overrides["content-desc"] ?? faker.helpers.maybe(() => faker.lorem.sentence()),
      "resource-id": overrides["resource-id"] ?? faker.helpers.maybe(() => `${faker.word.sample()}:id/${faker.word.sample()}_${faker.word.sample()}`),
      "class": overrides["class"] ?? faker.helpers.arrayElement(["android.widget.TextView", "android.widget.Button", "android.widget.ImageView"]),
      "package": overrides["package"] ?? `com.${faker.internet.domainWord()}.${faker.internet.domainWord()}`,
      "checkable": overrides.checkable ?? faker.datatype.boolean(),
      "checked": overrides.checked ?? faker.datatype.boolean(),
      "clickable": overrides.clickable ?? faker.datatype.boolean(0.7),
      "enabled": overrides.enabled ?? faker.datatype.boolean(0.9),
      "focusable": overrides.focusable ?? faker.datatype.boolean(0.5),
      "focused": overrides.focused ?? faker.datatype.boolean(0.2),
      "scrollable": overrides.scrollable ?? faker.datatype.boolean(0.3),
      "selected": overrides.selected ?? faker.datatype.boolean(0.3),
      ...overrides
    };
  }

  /**
   * Generate fake ScreenSize
   */
  static screenSize(overrides: Partial<ScreenSize> = {}): ScreenSize {
    return {
      width: overrides.width ?? faker.helpers.arrayElement([720, 1080, 1440]),
      height: overrides.height ?? faker.helpers.arrayElement([1280, 1920, 2560])
    };
  }

  /**
   * Generate fake SystemInsets
   */
  static systemInsets(overrides: Partial<SystemInsets> = {}): SystemInsets {
    return {
      top: overrides.top ?? faker.number.int({ min: 24, max: 80 }),
      right: overrides.right ?? faker.number.int({ min: 0, max: 48 }),
      bottom: overrides.bottom ?? faker.number.int({ min: 48, max: 144 }),
      left: overrides.left ?? faker.number.int({ min: 0, max: 48 })
    };
  }

  /**
   * Generate fake Point
   */
  static point(overrides: Partial<Point> = {}): Point {
    return {
      x: overrides.x ?? faker.number.int({ min: 0, max: 1080 }),
      y: overrides.y ?? faker.number.int({ min: 0, max: 1920 }),
      delay: overrides.delay ?? faker.helpers.maybe(() => faker.number.int({ min: 10, max: 500 }))
    };
  }

  /**
   * Generate fake ActiveWindowInfo
   */
  static activeWindowInfo(overrides: Partial<ActiveWindowInfo> = {}): ActiveWindowInfo {
    const packageName = overrides.appId ?? `com.${faker.internet.domainWord()}.${faker.internet.domainWord()}`;
    const word = faker.word.sample();
    const capitalizedWord = word.charAt(0).toUpperCase() + word.slice(1);

    return {
      appId: packageName,
      activityName: overrides.activityName ?? `${packageName}.activities.${capitalizedWord}Activity`,
      layoutSeqSum: overrides.layoutSeqSum ?? faker.number.int({ min: 100, max: 10000 })
    };
  }

  /**
   * Generate fake ObserveResult
   */
  static observeResult(overrides: Partial<ObserveResult> = {}): ObserveResult {
    const screenSize = overrides.screenSize ?? this.screenSize();
    const systemInsets = overrides.systemInsets ?? this.systemInsets();
    const timestamp = overrides.timestamp ?? Date.now();

    // Create some fake elements
    const elementCount = faker.number.int({ min: 5, max: 20 });
    const elements = Array.from({ length: elementCount }, () => this.element());

    return {
      timestamp,
      screenSize,
      systemInsets,
      viewHierarchy: overrides.viewHierarchy ?? {
        version: "1.0",
        nodes: elements.map(e => ({ ...e, children: [] }))
      },
      screenshotPath: overrides.screenshotPath ?? faker.helpers.maybe(() => `screenshots/screen_${timestamp}.png`),
      activeWindow: overrides.activeWindow ?? faker.helpers.maybe(() => this.activeWindowInfo()),
      elements: overrides.elements ?? {
        clickable: elements.filter(e => e.clickable),
        scrollable: elements.filter(e => e.scrollable),
        text: elements.filter(e => e.text)
      },
      error: overrides.error
    };
  }

  /**
   * Generate fake TapResult
   */
  static tapResult(overrides: Partial<TapResult> = {}): TapResult {
    const x = overrides.x ?? faker.number.int({ min: 0, max: 1080 });
    const y = overrides.y ?? faker.number.int({ min: 0, max: 1920 });

    return {
      success: overrides.success ?? true,
      x,
      y,
      observation: overrides.observation ?? this.observeResult(),
      error: overrides.error
    };
  }

  /**
   * Generate fake TapOnTextResult
   */
  static tapOnTextResult(overrides: Partial<TapOnTextResult> = {}): TapOnTextResult {
    const text = overrides.text ?? faker.lorem.words({ min: 1, max: 5 });
    const x = overrides.x ?? faker.number.int({ min: 0, max: 1080 });
    const y = overrides.y ?? faker.number.int({ min: 0, max: 1920 });

    return {
      success: overrides.success ?? true,
      text,
      element: overrides.element ?? this.element({ text }),
      x,
      y,
      observation: overrides.observation ?? this.observeResult(),
      error: overrides.error
    };
  }

  /**
   * Generate fake ExitDialogResult
   */
  static exitDialogResult(overrides: Partial<ExitDialogResult> = {}): ExitDialogResult {
    const success = overrides.success ?? faker.datatype.boolean(0.9);
    const elementFound = overrides.elementFound ?? success;

    return {
      success,
      elementFound,
      element: elementFound ? (overrides.element ?? this.element({
        text: faker.helpers.arrayElement(["Close", "Cancel", "X", "Exit", "No thanks"]),
        clickable: true
      })) : undefined,
      x: elementFound ? (overrides.x ?? faker.number.int({ min: 0, max: 1080 })) : undefined,
      y: elementFound ? (overrides.y ?? faker.number.int({ min: 0, max: 1920 })) : undefined,
      observation: overrides.observation ?? this.observeResult(),
      error: overrides.error ?? (!success ? "Failed to exit dialog" : undefined)
    };
  }

  /**
   * Generate fake LaunchAppResult
   */
  static launchAppResult(overrides: Partial<LaunchAppResult> = {}): LaunchAppResult {
    const packageName = overrides.packageName ?? `com.${faker.internet.domainWord()}.${faker.internet.domainWord()}`;

    return {
      success: overrides.success ?? true,
      packageName,
      activityName: overrides.activityName ?? `${packageName}.MainActivity`,
      observation: overrides.observation ?? this.observeResult({
        activeWindow: this.activeWindowInfo({ appId: packageName })
      }),
      error: overrides.error
    };
  }

  /**
   * Generate fake TerminateAppResult
   */
  static terminateAppResult(overrides: Partial<TerminateAppResult> = {}): TerminateAppResult {
    const packageName = overrides.packageName ?? `com.${faker.internet.domainWord()}.${faker.internet.domainWord()}`;

    return {
      success: overrides.success ?? true,
      packageName,
      wasInstalled: overrides.wasInstalled ?? true,
      wasRunning: overrides.wasRunning ?? faker.datatype.boolean(0.7),
      wasForeground: overrides.wasForeground ?? faker.datatype.boolean(0.5),
      observation: overrides.observation ?? this.observeResult(),
      error: overrides.error
    };
  }

  /**
   * Generate fake ClearAppDataResult
   */
  static clearAppDataResult(overrides: Partial<ClearAppDataResult> = {}): ClearAppDataResult {
    const packageName = overrides.packageName ?? `com.${faker.internet.domainWord()}.${faker.internet.domainWord()}`;

    return {
      success: overrides.success ?? true,
      packageName,
      observation: overrides.observation ?? this.observeResult(),
      error: overrides.error
    };
  }

  /**
   * Generate fake InstallAppResult
   */
  static installAppResult(overrides: Partial<InstallAppResult> = {}): InstallAppResult {
    return {
      success: overrides.success ?? true,
      apkPath: overrides.apkPath ?? `/path/to/${faker.system.fileName({ extensionCount: 0 })}.apk`,
      observation: overrides.observation ?? this.observeResult(),
      error: overrides.error
    };
  }

  /**
   * Generate fake OpenURLResult
   */
  static openURLResult(overrides: Partial<OpenURLResult> = {}): OpenURLResult {
    return {
      success: overrides.success ?? true,
      url: overrides.url ?? faker.internet.url(),
      observation: overrides.observation ?? this.observeResult({
        activeWindow: this.activeWindowInfo({ appId: "com.android.chrome" })
      }),
      error: overrides.error
    };
  }

  /**
   * Generate fake SendTextResult
   */
  static sendTextResult(overrides: Partial<SendTextResult> = {}): SendTextResult {
    return {
      success: overrides.success ?? true,
      text: overrides.text ?? faker.lorem.sentence(),
      observation: overrides.observation ?? this.observeResult(),
      error: overrides.error
    };
  }

  /**
   * Generate fake SendKeyEventResult
   */
  static sendKeyEventResult(overrides: Partial<SendKeyEventResult> = {}): SendKeyEventResult {
    return {
      success: overrides.success ?? true,
      keyCode: overrides.keyCode ?? faker.number.int({ min: 0, max: 280 }),
      observation: overrides.observation ?? this.observeResult(),
      error: overrides.error
    };
  }

  /**
   * Generate fake PressButtonResult
   */
  static pressButtonResult(overrides: Partial<PressButtonResult> = {}): PressButtonResult {
    const button = overrides.button ?? faker.helpers.arrayElement(["home", "back", "menu", "power", "volume_up", "volume_down"]);

    // Map button names to keycodes
    const keyCodeMap: Record<string, number> = {
      home: 3,
      back: 4,
      menu: 82,
      power: 26,
      volume_up: 24,
      volume_down: 25
    };

    return {
      success: overrides.success ?? true,
      button,
      keyCode: overrides.keyCode ?? keyCodeMap[button] ?? 0,
      observation: overrides.observation ?? this.observeResult(),
      error: overrides.error
    };
  }

  /**
   * Generate fake RotateResult
   */
  static rotateResult(overrides: Partial<RotateResult> = {}): RotateResult {
    const orientation = overrides.orientation ?? faker.helpers.arrayElement(["portrait", "landscape"]);

    return {
      success: overrides.success ?? true,
      orientation,
      value: overrides.value ?? (orientation === "portrait" ? 0 : 1),
      observation: overrides.orientation === "portrait"
        ? this.observeResult({ screenSize: { width: 1080, height: 1920 } })
        : this.observeResult({ screenSize: { width: 1920, height: 1080 } }),
      error: overrides.error
    };
  }

  /**
   * Generate fake SwipeResult
   */
  static swipeResult(overrides: Partial<SwipeResult> = {}): SwipeResult {
    const x1 = overrides.x1 ?? faker.number.int({ min: 0, max: 1080 });
    const y1 = overrides.y1 ?? faker.number.int({ min: 0, max: 1920 });
    const x2 = overrides.x2 ?? faker.number.int({ min: 0, max: 1080 });
    const y2 = overrides.y2 ?? faker.number.int({ min: 0, max: 1920 });

    return {
      success: overrides.success ?? true,
      x1,
      y1,
      x2,
      y2,
      duration: overrides.duration ?? faker.number.int({ min: 200, max: 800 }),
      path: overrides.path,
      easing: overrides.easing ?? faker.helpers.arrayElement(["linear", "decelerate", "accelerate", "accelerateDecelerate"]),
      observation: overrides.observation ?? this.observeResult(),
      error: overrides.error
    };
  }
}
