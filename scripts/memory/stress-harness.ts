import fs from "node:fs";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { RealObserveScreen } from "../../src/features/observe/ObserveScreen";
import type { ObserveScreen } from "../../src/features/observe/interfaces/ObserveScreen";
import { TapOnElement } from "../../src/features/action/TapOnElement";
import { SwipeOn } from "../../src/features/action/SwipeOn";
import { InputText } from "../../src/features/action/InputText";
import { ViewHierarchy } from "../../src/features/observe/ViewHierarchy";
import { AccessibilityServiceClient } from "../../src/features/observe/AccessibilityServiceClient";
import { SharpImageUtils } from "../../src/utils/image-utils";
import type { BootedDevice } from "../../src/models";
import { FakeAdbExecutor } from "../../test/fakes/FakeAdbExecutor";
import { FakeAccessibilityDetector } from "../../test/fakes/FakeAccessibilityDetector";

export type StressOperation = "observe" | "tapOn" | "swipeOn" | "inputText";

export interface StressRunConfig {
  iterations: number;
  opsPerSecond: number;
  operations: StressOperation[];
  gcEvery: number;
}

export interface StressRunResult {
  iterations: number;
  durationMs: number;
  operationCounts: Record<StressOperation, number>;
}

export interface StressHarnessResources {
  device: BootedDevice;
  viewHierarchy: ViewHierarchy;
  observeScreen: ObserveScreen;
  fixtureImagePaths: string[];
  xmlSamples: string[];
}

export interface StressHarness {
  operations: Record<StressOperation, () => Promise<void>>;
  cleanup: () => Promise<void>;
  resources: StressHarnessResources;
}

const DEFAULT_XML_SAMPLE = [
  "<?xml version=\"1.0\" encoding=\"UTF-8\"?>",
  "<hierarchy>",
  "  <node text=\"Sample\" resource-id=\"com.example:id/button\" clickable=\"true\" bounds=\"[0,0][100,100]\" />",
  "</hierarchy>"
].join("\n");

const DUMPSYS_WINDOW_OUTPUT = [
  "mRotation=0",
  "statusBars=Window{123 u0 StatusBar} frame=[0,0][1080,74]",
  "navigationBars=Window{456 u0 NavigationBar} frame=[0,2337][1080,2400]",
  "systemGestures=InsetsSource sideHint=LEFT frame=[0,0][78,2400]",
  "systemGestures=InsetsSource sideHint=RIGHT frame=[1002,0][1080,2400]"
].join("\n");

const DUMPSYS_WINDOW_WINDOWS_OUTPUT = [
  "WINDOW MANAGER WINDOWS (dumpsys window windows)",
  "  imeControlTarget in display# 0 Window{abc u0 com.example.app/com.example.app.MainActivity}"
].join("\n");

const DUMPSYS_ACTIVITY_OUTPUT = [
  "Task id #123",
  "  affinity=com.example.app",
  "  * Hist #0: ActivityRecord{111 u0 com.example.app/.MainActivity t123}",
  "mResumedActivity: ActivityRecord{111 u0 com.example.app/.MainActivity t123}"
].join("\n");

const DEFAULT_OPERATIONS: StressOperation[] = ["observe", "tapOn", "swipeOn", "inputText"];
const DEFAULT_ITERATIONS = 1000;
const DEFAULT_OPS_PER_SECOND = 10;
const DEFAULT_GC_EVERY = 100;
const DEFAULT_WARMUP_ITERATIONS = 100;

export interface StressCliOptions {
  iterations?: number;
  durationMs?: number;
  opsPerSecond?: number;
  operations?: StressOperation[];
  gcEvery?: number;
  warmupIterations?: number;
}

export interface ResolvedStressConfig {
  runConfig: StressRunConfig;
  warmupIterations: number;
}

function resolveFixtureImages(): string[] {
  const fixtureDir = path.join(process.cwd(), "test", "fixtures", "screenshots");
  const candidates = [
    "black-on-white.png",
    "white-on-black.png",
    "blue-on-yellow.png"
  ];
  return candidates
    .map(file => path.join(fixtureDir, file))
    .filter(filePath => fs.existsSync(filePath));
}

function createMockDevice(): BootedDevice {
  return {
    name: "memory-stress-device",
    platform: "android",
    deviceId: "memory-stress-001",
    source: "local"
  };
}

function parseDurationMs(value: string): number {
  const match = value.trim().match(/^(\d+)(ms|s|m|h)?$/i);
  if (!match) {
    throw new Error(`Invalid duration format: ${value}`);
  }
  const amount = Number.parseInt(match[1], 10);
  const unit = (match[2] || "ms").toLowerCase();
  const multipliers: Record<string, number> = {
    ms: 1,
    s: 1000,
    m: 60_000,
    h: 3_600_000
  };
  return amount * (multipliers[unit] ?? 1);
}

export function parseStressArgs(argv: string[]): StressCliOptions {
  const options: StressCliOptions = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = argv[i + 1];

    if (arg === "--iterations" || arg === "-i") {
      options.iterations = Number.parseInt(next, 10);
      i++;
      continue;
    }

    if (arg === "--duration") {
      options.durationMs = parseDurationMs(next);
      i++;
      continue;
    }

    if (arg === "--ops-per-second" || arg === "--ops") {
      options.opsPerSecond = Number.parseFloat(next);
      i++;
      continue;
    }

    if (arg === "--operations") {
      const parsed = next.split(",").map(item => item.trim()).filter(Boolean) as StressOperation[];
      options.operations = parsed;
      i++;
      continue;
    }

    if (arg === "--gc-every") {
      options.gcEvery = Number.parseInt(next, 10);
      i++;
      continue;
    }

    if (arg === "--warmup") {
      options.warmupIterations = Number.parseInt(next, 10);
      i++;
    }
  }
  return options;
}

export function resolveStressConfig(options: StressCliOptions = {}): ResolvedStressConfig {
  const opsPerSecond = options.opsPerSecond ?? DEFAULT_OPS_PER_SECOND;
  const operations = options.operations ?? DEFAULT_OPERATIONS;
  const gcEvery = options.gcEvery ?? DEFAULT_GC_EVERY;
  const warmupIterations = options.warmupIterations ?? DEFAULT_WARMUP_ITERATIONS;

  let iterations = options.iterations ?? DEFAULT_ITERATIONS;
  if (!options.iterations && options.durationMs && opsPerSecond > 0) {
    iterations = Math.max(1, Math.floor((options.durationMs / 1000) * opsPerSecond));
  }

  return {
    runConfig: {
      iterations,
      opsPerSecond,
      operations,
      gcEvery
    },
    warmupIterations
  };
}

function createFakeAccessibilityClient() {
  const staticHierarchy = {
    hierarchy: {
      node: {
        $: {
          "text": "Mock Button",
          "resource-id": "com.example:id/mock",
          "clickable": "true",
          "bounds": "[0,0][100,100]"
        }
      }
    },
    packageName: "com.example.app",
    updatedAt: Date.now()
  };

  return {
    async getAccessibilityHierarchy() {
      return staticHierarchy;
    },
    async requestAction() {
      return { success: true, totalTimeMs: 1 };
    },
    async requestSwipe() {
      return { success: true, totalTimeMs: 1 };
    },
    async requestSetText() {
      return { success: true, totalTimeMs: 1 };
    },
    async requestImeAction(action: string) {
      return { success: true, action, totalTimeMs: 1 };
    },
    async requestClearText() {
      return { success: true, totalTimeMs: 1 };
    },
    async requestSelectAll() {
      return { success: true, totalTimeMs: 1 };
    },
    async setRecompositionTrackingEnabled() {
      return;
    },
    invalidateCache() {
      return;
    },
    hasCachedHierarchy() {
      return true;
    },
    isConnected() {
      return true;
    }
  };
}

function createFakeAdb(screenshotBase64: string): FakeAdbExecutor {
  const fakeAdb = new FakeAdbExecutor();
  fakeAdb.setCommandResponse("wm size", { stdout: "Physical size: 1080x2400", stderr: "" });
  fakeAdb.setCommandResponse("dumpsys window windows", { stdout: DUMPSYS_WINDOW_WINDOWS_OUTPUT, stderr: "" });
  fakeAdb.setCommandResponse("dumpsys window", { stdout: DUMPSYS_WINDOW_OUTPUT, stderr: "" });
  fakeAdb.setCommandResponse("dumpsys activity activities", { stdout: DUMPSYS_ACTIVITY_OUTPUT, stderr: "" });
  fakeAdb.setCommandResponse("uiautomator dump", { stdout: DEFAULT_XML_SAMPLE, stderr: "" });
  fakeAdb.setCommandResponse("screencap -p", { stdout: screenshotBase64, stderr: "" });
  return fakeAdb;
}

export async function createStressHarness(): Promise<StressHarness> {
  const fixtureImages = resolveFixtureImages();
  const fallbackImage = fixtureImages[0] ?? path.join(process.cwd(), "test", "fixtures", "screenshots", "black-on-white.png");
  const imageBuffers = fixtureImages.length > 0
    ? fixtureImages.map(filePath => fs.readFileSync(filePath))
    : [fs.readFileSync(fallbackImage)];
  const screenshotBase64 = imageBuffers[0].toString("base64");

  const device = createMockDevice();
  const fakeAdb = createFakeAdb(screenshotBase64);
  const fakeAccessibilityDetector = new FakeAccessibilityDetector();
  fakeAccessibilityDetector.setTalkBackEnabled(false);

  // Create a factory that returns the fake ADB executor
  const fakeAdbFactory: AdbClientFactory = {
    create: () => fakeAdb,
  };

  const fakeA11yClient = createFakeAccessibilityClient();
  const originalGetInstance = AccessibilityServiceClient.getInstance;
  (AccessibilityServiceClient as unknown as { getInstance: () => unknown }).getInstance = () => fakeA11yClient;

  const mockTakeScreenshot = {
    async execute() {
      return { success: true, path: fallbackImage };
    }
  };

  const viewHierarchy = new ViewHierarchy(
    device,
    fakeAdbFactory,
    null,
    mockTakeScreenshot as unknown as any,
    fakeA11yClient as unknown as any
  );

  const observeScreen = new RealObserveScreen(device, fakeAdbFactory);
  (observeScreen as unknown as { viewHierarchy: ViewHierarchy }).viewHierarchy = viewHierarchy;

  const tapOnElement = new TapOnElement(
    device,
    fakeAdb as unknown as any,
    undefined, // visionConfig
    undefined, // selectionStateTracker
    fakeAccessibilityDetector
  );

  const swipeOn = new SwipeOn(
    device,
    fakeAdb as unknown as any,
    {
      executeGesture: {
        async swipe() {
          return { success: true, totalTimeMs: 1 };
        }
      },
      accessibilityDetector: fakeAccessibilityDetector
    }
  );

  const inputText = new InputText(device, fakeAdb as unknown as any);
  const imageUtils = new SharpImageUtils();
  const xmlSamples = [DEFAULT_XML_SAMPLE];

  let imageIndex = 0;
  let xmlIndex = 0;

  const operations: Record<StressOperation, () => Promise<void>> = {
    observe: async () => {
      await observeScreen.execute();
      const xml = xmlSamples[xmlIndex++ % xmlSamples.length];
      await viewHierarchy.processXmlData(xml);
      const screenshotPath = fixtureImages[imageIndex++ % fixtureImages.length] ?? fallbackImage;
      await viewHierarchy.getOrCreateScreenshotBuffer(screenshotPath);
      const buffer = imageBuffers[imageIndex % imageBuffers.length];
      await imageUtils.resize(buffer, 120);
    },
    tapOn: async () => {
      const element = {
        "bounds": { left: 0, top: 0, right: 100, bottom: 50 },
        "resource-id": "com.example:id/button"
      };
      await (tapOnElement as unknown as any).executeAndroidTap(
        "tap",
        10,
        10,
        50,
        element
      );
    },
    swipeOn: async () => {
      await (swipeOn as unknown as any).executeSwipeGesture(
        10,
        10,
        200,
        10,
        "right",
        null
      );
    },
    inputText: async () => {
      await (inputText as unknown as any).executeAndroidTextInput("memory-test");
    }
  };

  const cleanup = async () => {
    (AccessibilityServiceClient as unknown as { getInstance: unknown }).getInstance = originalGetInstance;
    AccessibilityServiceClient.resetInstances();
    RealObserveScreen.clearCache();
  };

  return {
    operations,
    cleanup,
    resources: {
      device,
      viewHierarchy,
      observeScreen,
      fixtureImagePaths: fixtureImages.length > 0 ? fixtureImages : [fallbackImage],
      xmlSamples
    }
  };
}

export async function runStressOperations(
  harness: StressHarness,
  config: StressRunConfig
): Promise<StressRunResult> {
  const operations = config.operations.length > 0 ? config.operations : DEFAULT_OPERATIONS;
  const operationCounts = operations.reduce((acc, op) => {
    acc[op] = 0;
    return acc;
  }, {} as Record<StressOperation, number>);

  const delayMs = config.opsPerSecond > 0 ? 1000 / config.opsPerSecond : 0;
  const startTime = performance.now();

  for (let i = 0; i < config.iterations; i++) {
    const operation = operations[i % operations.length];
    const opStart = performance.now();
    await harness.operations[operation]();
    operationCounts[operation] += 1;

    if (config.gcEvery > 0 && typeof global.gc === "function" && i > 0 && i % config.gcEvery === 0) {
      global.gc();
    }

    if (delayMs > 0) {
      const elapsed = performance.now() - opStart;
      const remaining = delayMs - elapsed;
      if (remaining > 0) {
        await new Promise(resolve => setTimeout(resolve, remaining));
      }
    }
  }

  const durationMs = performance.now() - startTime;

  return {
    iterations: config.iterations,
    durationMs,
    operationCounts
  };
}
