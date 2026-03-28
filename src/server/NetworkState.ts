import { ResourceRegistry } from "./resourceRegistry";
import { logger } from "../utils/logger";
import { defaultTimer, type Timer } from "../utils/SystemTimer";

export type NotifFilter = "all" | "errors" | "slow";

export type SimulatedErrorType =
  | "http500"
  | "timeout"
  | "connectionRefused"
  | "dnsFailure"
  | "tlsFailure";

export interface SimulationConfig {
  errorType: SimulatedErrorType;
  limit: number | null;
  remaining: number | null;
  expiresAt: number;
}

export interface MockRule {
  mockId: string;
  host: string;
  path: string;
  method: string;
  limit: number | null;
  remaining: number | null;
  statusCode: number;
  responseHeaders: Record<string, string>;
  responseBody: string;
  contentType: string;
}

export interface NetworkNotification {
  id: number;
  timestamp: number;
  method: string;
  url: string;
  host: string | null;
  path: string | null;
  statusCode: number;
  durationMs: number;
  contentType: string | null;
  error: string | null;
}

export interface NetworkStateSnapshot {
  capturing: boolean;
  simulatingErrors?: {
    errorType: SimulatedErrorType;
    limit?: number;
    remainingSeconds: number;
  };
  notifFilter: NotifFilter;
  notifDebounceMs: number;
  slowThresholdMs: number;
}

export interface ResourceNotifier {
  notifyResourceUpdated(uri: string): void;
}

export interface NetworkStateConfig {
  timer?: Timer;
  notifier?: ResourceNotifier;
}

const defaultNotifier: ResourceNotifier = {
  notifyResourceUpdated(uri: string): void {
    void ResourceRegistry.notifyResourceUpdated(uri);
  },
};

export class NetworkState {
  private static instance: NetworkState | null = null;

  private _capturing = false;
  private _simulation: SimulationConfig | null = null;
  private _simulationTimeout: NodeJS.Timeout | null = null;
  private _notifFilter: NotifFilter = "all";
  private _notifDebounceMs = 100;
  private _slowThresholdMs = 2000;
  private _mocks: Map<string, MockRule> = new Map();
  private _nextMockId = 1;

  private _debounceTimeout: NodeJS.Timeout | null = null;
  private _pendingNotifications: NetworkNotification[] = [];

  readonly timer: Timer;
  private readonly notifier: ResourceNotifier;

  constructor(config: NetworkStateConfig = {}) {
    this.timer = config.timer ?? defaultTimer;
    this.notifier = config.notifier ?? defaultNotifier;
  }

  static getInstance(): NetworkState {
    if (!NetworkState.instance) {
      NetworkState.instance = new NetworkState();
    }
    return NetworkState.instance;
  }

  static resetInstance(): void {
    if (NetworkState.instance) {
      NetworkState.instance.dispose();
    }
    NetworkState.instance = null;
  }

  dispose(): void {
    if (this._simulationTimeout) {
      this.timer.clearTimeout(this._simulationTimeout);
      this._simulationTimeout = null;
    }
    if (this._debounceTimeout) {
      this.timer.clearTimeout(this._debounceTimeout);
      this._debounceTimeout = null;
    }
    this._simulation = null;
    this._pendingNotifications = [];
  }

  // --- Capture ---

  get capturing(): boolean {
    return this._capturing;
  }

  setCapture(enabled: boolean): void {
    this._capturing = enabled;
  }

  // --- Error Simulation ---

  get simulation(): SimulationConfig | null {
    if (this._simulation && this.timer.now() >= this._simulation.expiresAt) {
      this._simulation = null;
    }
    return this._simulation;
  }

  startSimulation(
    errorType: SimulatedErrorType,
    durationSeconds: number,
    limit: number | null
  ): void {
    if (this._simulationTimeout) {
      this.timer.clearTimeout(this._simulationTimeout);
    }
    const expiresAt = this.timer.now() + durationSeconds * 1000;
    this._simulation = {
      errorType,
      limit,
      remaining: limit,
      expiresAt,
    };
    this._simulationTimeout = this.timer.setTimeout(() => {
      this._simulation = null;
      this._simulationTimeout = null;
    }, durationSeconds * 1000);
  }

  cancelSimulation(): void {
    if (this._simulationTimeout) {
      this.timer.clearTimeout(this._simulationTimeout);
      this._simulationTimeout = null;
    }
    this._simulation = null;
  }

  // --- Notification Config ---

  get notifFilter(): NotifFilter {
    return this._notifFilter;
  }

  setNotifFilter(filter: NotifFilter): void {
    this._notifFilter = filter;
  }

  get notifDebounceMs(): number {
    return this._notifDebounceMs;
  }

  setNotifDebounceMs(ms: number): void {
    this._notifDebounceMs = ms;
  }

  get slowThresholdMs(): number {
    return this._slowThresholdMs;
  }

  setSlowThresholdMs(ms: number): void {
    this._slowThresholdMs = ms;
  }

  // --- Mocks ---

  addMock(rule: Omit<MockRule, "mockId">): MockRule {
    const mockId = `mock-${this._nextMockId++}`;
    const mock: MockRule = { ...rule, mockId };
    this._mocks.set(mockId, mock);
    return mock;
  }

  removeMock(mockId: string): boolean {
    return this._mocks.delete(mockId);
  }

  clearAllMocks(): number {
    const count = this._mocks.size;
    this._mocks.clear();
    return count;
  }

  getMocks(): Map<string, MockRule> {
    return new Map(this._mocks);
  }

  getMockSummary(): Record<string, number> {
    const summary: Record<string, number> = {};
    for (const mock of this._mocks.values()) {
      const key = `${mock.method} ${mock.host}${mock.path}`;
      summary[key] = mock.remaining ?? -1;
    }
    return summary;
  }

  // --- Snapshot ---

  getSnapshot(): NetworkStateSnapshot {
    const snapshot: NetworkStateSnapshot = {
      capturing: this._capturing,
      notifFilter: this._notifFilter,
      notifDebounceMs: this._notifDebounceMs,
      slowThresholdMs: this._slowThresholdMs,
    };

    const sim = this.simulation;
    if (sim) {
      snapshot.simulatingErrors = {
        errorType: sim.errorType,
        remainingSeconds: Math.max(
          0,
          Math.ceil((sim.expiresAt - this.timer.now()) / 1000)
        ),
      };
      if (sim.limit !== null) {
        snapshot.simulatingErrors.limit = sim.limit;
      }
    }

    return snapshot;
  }

  // --- Notification Dispatch ---

  onNetworkEvent(notification: NetworkNotification): void {
    if (!this._capturing) {
      return;
    }

    const isError = notification.statusCode >= 400;
    const isSlow = notification.durationMs >= this._slowThresholdMs;

    // Gate by filter
    if (this._notifFilter === "errors" && !isError) {
      return;
    }
    if (this._notifFilter === "slow" && !isSlow) {
      return;
    }

    this._pendingNotifications.push(notification);

    if (this._debounceTimeout) {
      return;
    }

    this._debounceTimeout = this.timer.setTimeout(() => {
      this.flushNotifications();
      this._debounceTimeout = null;
    }, this._notifDebounceMs);
  }

  get pendingNotificationCount(): number {
    return this._pendingNotifications.length;
  }

  private flushNotifications(): void {
    const pending = this._pendingNotifications;
    this._pendingNotifications = [];

    if (pending.length === 0) {
      return;
    }

    const hasErrors = pending.some(n => n.statusCode >= 400);
    const hasSlow = pending.some(n => n.durationMs >= this._slowThresholdMs);

    try {
      // Always notify the live traffic resource
      this.notifier.notifyResourceUpdated("automobile://network/traffic/live");

      // Notify errors resource if any errors in batch
      if (hasErrors) {
        this.notifier.notifyResourceUpdated(
          "automobile://network/traffic/errors"
        );
      }

      // Notify slow resource if any slow requests in batch
      if (hasSlow) {
        this.notifier.notifyResourceUpdated(
          "automobile://network/traffic/slow"
        );
      }

      // Stats resource always gets notified (it computes aggregates on read)
      this.notifier.notifyResourceUpdated("automobile://network/stats");
    } catch (e) {
      logger.error(`[NetworkState] Failed to send notifications: ${e}`);
    }
  }
}
