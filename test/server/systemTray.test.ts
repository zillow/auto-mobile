import { afterEach, describe, expect, test } from "bun:test";
import {
  resetSystemTrayDependencies,
  setSystemTrayDependencies,
  waitForNotificationMatch
} from "../../src/server/interactionTools";
import { FakeTimer } from "../fakes/FakeTimer";
import { FakeAdbExecutor } from "../fakes/FakeAdbExecutor";
import { FakeObserveScreen } from "../fakes/FakeObserveScreen";
import type { BootedDevice, ObserveResult, ViewHierarchyResult } from "../../src/models";

const POLL_INTERVAL_MS = 250;
const SYSTEM_TRAY_PACKAGE = "com.android.systemui";

class SequencedFakeAdbExecutor extends FakeAdbExecutor {
  private timestamps: number[];

  constructor(timestamps: number[]) {
    super();
    this.timestamps = [...timestamps];
  }

  setTimestamps(timestamps: number[]): void {
    this.timestamps = [...timestamps];
  }

  async getDeviceTimestampMs(): Promise<number> {
    if (this.timestamps.length > 0) {
      return this.timestamps.shift() as number;
    }
    return super.getDeviceTimestampMs();
  }
}

class SequencedObserveScreen extends FakeObserveScreen {
  private results: ObserveResult[];
  private index = 0;
  private minTimestamps: Array<number | undefined> = [];

  constructor(results: ObserveResult[]) {
    super();
    this.results = results;
    this.setObserveResult(() => this.nextResult());
  }

  async execute(
    queryOptions?: unknown,
    perf?: unknown,
    skipWaitForFresh?: boolean,
    minTimestamp?: number,
    signal?: AbortSignal
  ): Promise<ObserveResult> {
    this.minTimestamps.push(minTimestamp);
    return super.execute(queryOptions, perf, skipWaitForFresh, minTimestamp, signal);
  }

  getMinTimestamps(): Array<number | undefined> {
    return [...this.minTimestamps];
  }

  private nextResult(): ObserveResult {
    const result = this.results[Math.min(this.index, this.results.length - 1)];
    this.index += 1;
    return result;
  }
}

const createObservation = (viewHierarchy?: ViewHierarchyResult): ObserveResult => ({
  updatedAt: 0,
  screenSize: { width: 1080, height: 1920 },
  systemInsets: { top: 0, right: 0, bottom: 0, left: 0 },
  viewHierarchy
});

const createClosedHierarchy = (text: string = ""): ViewHierarchyResult => ({
  packageName: "com.google.android.apps.nexuslauncher",
  hierarchy: {
    node: {
      $: {
        "resource-id": "launcher_root",
        "class": "Launcher",
        "packageName": "com.google.android.apps.nexuslauncher",
        text,
        "bounds": "[0,0][100,100]"
      }
    }
  }
});

const createTrayHierarchy = (title: string): ViewHierarchyResult => ({
  packageName: SYSTEM_TRAY_PACKAGE,
  hierarchy: {
    node: {
      $: {
        "resource-id": "com.android.systemui:id/notification_stack_scroller",
        "class": "NotificationShade",
        "packageName": SYSTEM_TRAY_PACKAGE,
        "bounds": "[0,0][100,100]"
      },
      node: [{
        $: {
          "resource-id": "com.android.systemui:id/notification_row_1",
          "class": "ExpandableNotificationRow",
          "packageName": SYSTEM_TRAY_PACKAGE,
          "text": title,
          "bounds": "[0,0][100,50]"
        }
      }]
    }
  }
});

const device: BootedDevice = {
  name: "Pixel_6",
  platform: "android",
  deviceId: "device-1",
  source: "local"
};

const waitForPendingSleep = async (timer: FakeTimer): Promise<void> => {
  for (let i = 0; i < 50 && timer.getPendingSleepCount() === 0; i += 1) {
    await Promise.resolve();
  }
  expect(timer.getPendingSleepCount()).toBeGreaterThan(0);
};

const advancePendingSleeps = async (timer: FakeTimer, steps: number): Promise<void> => {
  for (let step = 0; step < steps; step += 1) {
    for (let i = 0; i < 50 && timer.getPendingSleepCount() === 0; i += 1) {
      await Promise.resolve();
    }
    if (timer.getPendingSleepCount() > 0) {
      timer.advanceTime(POLL_INTERVAL_MS);
    }
  }
};

describe("systemTray find", () => {
  afterEach(() => {
    resetSystemTrayDependencies();
  });

  test("waits for the tray to open before matching", async () => {
    const fakeTimer = new FakeTimer();
    fakeTimer.setManualMode();
    const fakeAdb = new SequencedFakeAdbExecutor([1000, 2000]);
    const fakeObserveScreen = new SequencedObserveScreen([
      createObservation(createClosedHierarchy()),
      createObservation(createClosedHierarchy()),
      createObservation(createTrayHierarchy("Test Notification"))
    ]);

    setSystemTrayDependencies({
      timer: fakeTimer,
      adbFactory: () => fakeAdb,
      observeScreenFactory: () => fakeObserveScreen
    });

    const resultPromise = waitForNotificationMatch(
      device,
      { title: "Test Notification" },
      [],
      500
    );

    await waitForPendingSleep(fakeTimer);
    fakeTimer.advanceTime(POLL_INTERVAL_MS);

    const result = await resultPromise;

    expect(result.match).not.toBeNull();
    expect(result.observation.viewHierarchy?.packageName).toBe(SYSTEM_TRAY_PACKAGE);
    expect(fakeAdb.wasCommandExecuted("cmd statusbar expand-notifications")).toBe(true);
    const minTimestamps = fakeObserveScreen.getMinTimestamps();
    expect(minTimestamps[0]).toBe(1000);
    expect(minTimestamps[1]).toBe(2000);
  });

  test("does not return matches while the tray is closed", async () => {
    const fakeTimer = new FakeTimer();
    fakeTimer.setManualMode();
    const fakeAdb = new SequencedFakeAdbExecutor([1000, 2000]);
    const fakeObserveScreen = new SequencedObserveScreen([
      createObservation(createClosedHierarchy("Test Notification")),
      createObservation(createClosedHierarchy("Test Notification")),
      createObservation(createClosedHierarchy("Test Notification"))
    ]);

    setSystemTrayDependencies({
      timer: fakeTimer,
      adbFactory: () => fakeAdb,
      observeScreenFactory: () => fakeObserveScreen
    });

    const resultPromise = waitForNotificationMatch(
      device,
      { title: "Test Notification" },
      [],
      500
    );

    await advancePendingSleeps(fakeTimer, 3);

    const result = await resultPromise;

    expect(result.match).toBeNull();
    expect(result.observation.viewHierarchy?.packageName).toBe("com.google.android.apps.nexuslauncher");
    expect(fakeAdb.wasCommandExecuted("cmd statusbar expand-notifications")).toBe(true);
    expect(fakeObserveScreen.getExecuteCallCount()).toBeGreaterThan(1);
  });
});
