import { logger } from "../../../utils/logger";
import type { BootedDevice, PlanStep, Element } from "../../../models";
import type { GestureEmitter, GestureEvent, A11ySource } from "./types";
import { AccessibilityServiceClient } from "../../observe/android";
import { defaultAdbClientFactory } from "../../../utils/android-cmdline-tools/AdbClientFactory";
import { discoverTouchNode } from "./TouchNodeDiscovery";
import { buildAxisRanges, buildScaler, queryDensity, queryRotation } from "./AxisRanges";
import { GetEventReader } from "./GetEventReader";
import { defaultTimer, type Timer } from "../../../utils/SystemTimer";

/** An InteractionEvent from the AccessibilityService (subset of fields we use) */
interface ReceivedInteraction {
  type: string;
  timestamp: number;
  packageName?: string;
  screenClassName?: string;
  element?: Partial<Element>;
  text?: string;
  scrollDeltaX?: number;
  scrollDeltaY?: number;
}

interface PendingGesture {
  gesture: GestureEvent;
  arrivedAt: number;
  resolved: boolean;
}

/**
 * How long to wait for an AccessibilityService event to pair with a getevent gesture.
 * If no A11y event arrives within this window, the gesture step is dropped with a warning.
 */
export const MERGE_WINDOW_MS = 100;

/**
 * Merges GestureEvents from getevent with InteractionEvents from the AccessibilityService
 * to build AutoMobile plan steps with full gesture-type and element-identity information.
 *
 * Usage:
 *   const recorder = new DualTrackRecorder(device)
 *   await recorder.start()
 *   // ... user interacts ...
 *   const { steps } = await recorder.stop()
 */
export class DualTrackRecorder {
  private steps: PlanStep[] = [];
  private pendingGestures: PendingGesture[] = [];
  private bufferedInteractions: ReceivedInteraction[] = [];
  private lastInputText: { elementKey: string; text: string; stepIndex: number } | null = null;
  private activeEmitter: GestureEmitter | null = null;
  private unsubscribeA11y: (() => void) | null = null;
  /** Reference to the real AccessibilityServiceClient when not in test mode */
  private activeA11y: AccessibilityServiceClient | null = null;
  private stopped = false;

  get stepCount(): number {
    return this.steps.length;
  }

  constructor(
    private readonly device: BootedDevice,
    /** Optional override for testing — defaults to a real GetEventReader */
    private readonly gestureEmitter?: GestureEmitter,
    /** Optional override for testing — defaults to AccessibilityServiceClient */
    private readonly a11ySource?: A11ySource,
    /** Optional override for testing — defaults to the system timer */
    private readonly timer: Timer = defaultTimer
  ) {}

  async start(): Promise<void> {
    // In real mode (no test override), obtain the AccessibilityServiceClient directly
    // so we can send start/stop recording notifications to the Kotlin service.
    let a11yClient: AccessibilityServiceClient | undefined;
    if (!this.a11ySource) {
      a11yClient = AccessibilityServiceClient.getInstance(this.device);
    }

    const a11y: A11ySource = this.a11ySource ?? a11yClient!;

    const connected = await a11y.ensureConnected();
    if (!connected) {
      throw new Error(
        "[DualTrackRecorder] Unable to connect to the accessibility service."
      );
    }

    // Notify Kotlin service that recording is starting (enables interaction event emission)
    if (a11yClient) {
      a11yClient.notifyRecordingStarted();
      this.activeA11y = a11yClient;
    }

    const emitter = this.gestureEmitter ?? (await this.createGetEventReader());
    this.activeEmitter = emitter;
    emitter.start(
      e => this.handleGestureEvent(e),
      e => logger.warn(`[DualTrackRecorder] GetEventReader error: ${e.message}`)
    );

    this.unsubscribeA11y = a11y.onInteraction(
      e => this.handleInteractionEvent(e as unknown as ReceivedInteraction)
    );

    logger.debug("[DualTrackRecorder] Started dual-track recording");
  }

  async stop(): Promise<{ steps: PlanStep[]; stepCount: number }> {
    if (this.stopped) {
      return { steps: this.steps, stepCount: this.steps.length };
    }
    this.stopped = true;

    // Notify Kotlin service that recording is stopping before unsubscribing
    this.activeA11y?.notifyRecordingStopped();
    this.activeA11y = null;

    this.unsubscribeA11y?.();
    this.unsubscribeA11y = null;
    this.activeEmitter?.stop();
    this.activeEmitter = null;

    // Flush pending gestures that haven't been matched yet
    for (const pending of this.pendingGestures) {
      if (!pending.resolved) {
        this.resolveGesture(pending);
      }
    }
    this.pendingGestures = [];

    logger.debug(
      `[DualTrackRecorder] Stopped with ${this.steps.length} steps`
    );

    return { steps: this.steps, stepCount: this.steps.length };
  }

  // -------------------------------------------------------------------------
  // Private: event handlers
  // -------------------------------------------------------------------------

  private handleGestureEvent(gesture: GestureEvent): void {
    if (this.stopped) {return;}

    if (gesture.type === "pressButton") {
      this.steps.push(buildPressButtonStep(gesture));
      return;
    }

    if (gesture.type === "pinch") {
      this.steps.push(buildPinchStep(gesture));
      return;
    }

    // tap / doubleTap / longPress / swipe → hold for merge window
    const pending: PendingGesture = {
      gesture,
      arrivedAt: this.timer.now(),
      resolved: false,
    };
    this.pendingGestures.push(pending);

    this.timer.setTimeout(() => this.resolveGesture(pending), MERGE_WINDOW_MS);
  }

  private handleInteractionEvent(event: ReceivedInteraction): void {
    if (this.stopped) {return;}

    if (event.type === "windowChange") {
      // Screen navigation metadata — not a plan step
      return;
    }

    if (event.type === "inputText") {
      this.handleInputText(event);
      return;
    }

    // tap / longPress / swipe — try to match a pending gesture
    const matched = this.pendingGestures.find(
      p =>
        !p.resolved &&
        isCompatibleType(p.gesture.type, event.type) &&
        this.timer.now() - p.arrivedAt <= MERGE_WINDOW_MS &&
        gestureHitsElement(p.gesture, event.element)
    );

    if (matched) {
      matched.resolved = true;
      const step = buildMergedStep(matched.gesture, event);
      if (step) {this.steps.push(step);}
    } else {
      this.bufferedInteractions.push(event);
    }
  }

  private resolveGesture(pending: PendingGesture): void {
    if (pending.resolved) {return;}
    pending.resolved = true;

    // Prune stale buffered interactions (older than 2× merge window)
    const now = this.timer.now();
    const MAX_BUFFER_AGE_MS = MERGE_WINDOW_MS * 2;
    this.bufferedInteractions = this.bufferedInteractions.filter(
      e => now - e.timestamp <= MAX_BUFFER_AGE_MS
    );

    // Try to match against a buffered A11y interaction — require type + hit-test
    const idx = this.bufferedInteractions.findIndex(e =>
      isCompatibleType(pending.gesture.type, e.type) &&
      gestureHitsElement(pending.gesture, e.element)
    );

    if (idx >= 0) {
      const event = this.bufferedInteractions.splice(idx, 1)[0];
      const step = buildMergedStep(pending.gesture, event);
      if (step) {this.steps.push(step);}
    } else {
      logger.warn(
        `[DualTrackRecorder] No element match for ${pending.gesture.type} ` +
          `at (${pending.gesture.screenX}, ${pending.gesture.screenY}) — step skipped`
      );
    }
  }

  private handleInputText(event: ReceivedInteraction): void {
    const elementKey = buildElementKey(event);
    if (event.text === undefined) {return;}

    // Coalesce consecutive inputText events on the same element only when the
    // previous inputText is still the most recent step (no intervening actions)
    if (
      this.lastInputText &&
      elementKey &&
      this.lastInputText.elementKey === elementKey &&
      this.lastInputText.stepIndex === this.steps.length - 1
    ) {
      const existing = this.steps[this.lastInputText.stepIndex];
      if (existing && existing.tool === "inputText") {
        existing.params.text = event.text;
        return;
      }
    }

    const stepIndex = this.steps.length;
    this.steps.push({ tool: "inputText", params: { text: event.text } });
    if (elementKey) {
      this.lastInputText = { elementKey, text: event.text, stepIndex };
    }
  }

  // -------------------------------------------------------------------------
  // Private: factory
  // -------------------------------------------------------------------------

  private async createGetEventReader(): Promise<GestureEmitter> {
    const adb = defaultAdbClientFactory.create(this.device);
    const node = await discoverTouchNode(adb);
    if (!node) {
      throw new Error("[DualTrackRecorder] No multitouch input device found on this device");
    }
    const density = await queryDensity(adb);
    const rotation = await queryRotation(adb);
    const ranges = await buildAxisRanges(adb, node, rotation);
    const scaler = buildScaler(ranges);

    return new GetEventReader({
      deviceId: this.device.deviceId,
      touchNode: node,
      scaler,
      density,
    });
  }
}

// -------------------------------------------------------------------------
// Pure helper functions
// -------------------------------------------------------------------------

function isCompatibleType(gestureType: string, eventType: string): boolean {
  return (
    (gestureType === "tap" && eventType === "tap") ||
    (gestureType === "doubleTap" && eventType === "tap") ||
    (gestureType === "longPress" && eventType === "longPress") ||
    (gestureType === "swipe" && eventType === "swipe")
  );
}

function gestureHitsElement(
  gesture: GestureEvent,
  element?: Partial<Element>
): boolean {
  const bounds = element?.bounds;
  if (!bounds) {return false;}
  // Swipes use startX/startY; taps/longPress/doubleTap use screenX/screenY
  const x = gesture.screenX ?? gesture.startX;
  const y = gesture.screenY ?? gesture.startY;
  if (x === null || x === undefined || y === null || y === undefined) {return false;}
  const PAD = 20;
  return (
    x >= bounds.left - PAD &&
    x <= bounds.right + PAD &&
    y >= bounds.top - PAD &&
    y <= bounds.bottom + PAD
  );
}

function buildSelector(
  element?: Partial<Element>
): { elementId: string } | { text: string } | null {
  if (!element) {return null;}
  const resourceId = element["resource-id"];
  if (resourceId) {return { elementId: resourceId };}
  const text = element.text ?? element["content-desc"];
  if (text) {return { text };}
  return null;
}

function buildElementKey(event: ReceivedInteraction): string | null {
  const el = event.element;
  if (!el) {return null;}
  const resourceId = el["resource-id"] ?? "";
  const contentDesc = el["content-desc"] ?? "";
  const className = el["class"] ?? "";
  if (!resourceId && !contentDesc && !className) {return null;}
  return `${resourceId}|${contentDesc}|${className}`;
}

function resolveSwipeDirection(
  scrollDeltaX?: number,
  scrollDeltaY?: number
): "up" | "down" | "left" | "right" | null {
  const dx = scrollDeltaX ?? 0;
  const dy = scrollDeltaY ?? 0;
  if (dx === 0 && dy === 0) {return null;}
  if (Math.abs(dx) >= Math.abs(dy)) {return dx > 0 ? "left" : "right";}
  return dy > 0 ? "up" : "down";
}

function buildMergedStep(
  gesture: GestureEvent,
  event: ReceivedInteraction
): PlanStep | null {
  const selector = buildSelector(event.element);

  switch (gesture.type) {
    case "tap":
      if (!selector) {return null;}
      return { tool: "tapOn", params: { action: "tap", ...selector } };

    case "doubleTap":
      if (!selector) {return null;}
      return { tool: "tapOn", params: { action: "doubleTap", ...selector } };

    case "longPress":
      if (!selector) {return null;}
      return { tool: "tapOn", params: { action: "longPress", ...selector } };

    case "swipe": {
      const direction =
        gesture.direction ?? resolveSwipeDirection(event.scrollDeltaX, event.scrollDeltaY);
      if (!direction) {return null;}
      const params: Record<string, unknown> = { direction };
      if (selector) {
        params.container =
          "elementId" in selector
            ? { elementId: selector.elementId }
            : { text: selector.text };
      }
      if (gesture.speed === "fast") {params.speed = "fast";}
      return { tool: "swipeOn", params };
    }

    default:
      return null;
  }
}

function buildPressButtonStep(gesture: GestureEvent): PlanStep {
  return { tool: "pressButton", params: { button: gesture.button } };
}

function buildPinchStep(gesture: GestureEvent): PlanStep {
  return {
    tool: "pinchOn",
    params: {
      direction: gesture.pinchDirection,
      scale: gesture.scale,
    },
  };
}
