import { z } from "zod";
import { AdbClient } from "../../utils/android-cmdline-tools/AdbClient";
import { DeviceSessionManager } from "../../utils/DeviceSessionManager";
import { NoOpPerformanceTracker } from "../../utils/PerformanceTracker";
import { AccessibilityServiceClient } from "../observe/AccessibilityServiceClient";
import {
  ActionableError,
  BootedDevice,
  HighlightBounds,
  HighlightEntry,
  HighlightOperationResult,
  HighlightShape,
  HighlightStyle,
  Platform
} from "../../models";

const DEFAULT_HIGHLIGHT_TIMEOUT_MS = 5000;

const normalizeNullableNumber = (value: number | null | undefined): number | undefined => (
  value === null ? undefined : value
);

const normalizeNullableString = (value: string | null | undefined): string | undefined => (
  value === null ? undefined : value
);

export const highlightBoundsSchema: z.ZodType<HighlightBounds> = z.object({
  x: z.number().int(),
  y: z.number().int(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  sourceWidth: z.number().int().positive().nullable().optional(),
  sourceHeight: z.number().int().positive().nullable().optional()
}).superRefine((value, ctx) => {
  const sourceWidth = normalizeNullableNumber(value.sourceWidth);
  const sourceHeight = normalizeNullableNumber(value.sourceHeight);
  const hasSourceWidth = sourceWidth !== undefined;
  const hasSourceHeight = sourceHeight !== undefined;

  if (hasSourceWidth !== hasSourceHeight) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "bounds.sourceWidth and bounds.sourceHeight must be provided together"
    });
  }
});

const highlightStyleSchema: z.ZodType<HighlightStyle> = z.object({
  strokeColor: z.string().min(1).nullable().optional(),
  strokeWidth: z.number().positive().nullable().optional(),
  dashPattern: z.array(z.number().positive()).nonempty().nullable().optional(),
  smoothing: z.enum(["none", "catmull-rom", "bezier", "douglas-peucker"]).nullable().optional(),
  tension: z.number().min(0).max(1).nullable().optional(),
  capStyle: z.enum(["butt", "round", "square"]).nullable().optional(),
  joinStyle: z.enum(["miter", "round", "bevel"]).nullable().optional()
}).superRefine((value, ctx) => {
  const strokeColor = normalizeNullableString(value.strokeColor);
  const strokeWidth = normalizeNullableNumber(value.strokeWidth);
  const dashPattern = value.dashPattern ?? undefined;
  const smoothing = value.smoothing ?? undefined;
  const tension = normalizeNullableNumber(value.tension);
  const capStyle = value.capStyle ?? undefined;
  const joinStyle = value.joinStyle ?? undefined;

  const hasStroke = strokeColor !== undefined
    || strokeWidth !== undefined
    || dashPattern !== undefined
    || smoothing !== undefined
    || tension !== undefined
    || capStyle !== undefined
    || joinStyle !== undefined;

  if (!hasStroke) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Highlight style must include stroke settings"
    });
  }
});

const highlightPointSchema = z.object({
  x: z.number(),
  y: z.number()
});

const highlightBoxShapeSchema = z.object({
  type: z.literal("box"),
  bounds: highlightBoundsSchema,
  style: highlightStyleSchema.nullable().optional()
});

const highlightCircleShapeSchema = z.object({
  type: z.literal("circle"),
  bounds: highlightBoundsSchema,
  style: highlightStyleSchema.nullable().optional()
});

const highlightPathShapeSchema = z.object({
  type: z.literal("path"),
  points: z.array(highlightPointSchema).min(2),
  bounds: highlightBoundsSchema.nullable().optional(),
  style: highlightStyleSchema.nullable().optional()
});

export const highlightShapeSchema: z.ZodType<HighlightShape> = z.discriminatedUnion("type", [
  highlightBoxShapeSchema,
  highlightCircleShapeSchema,
  highlightPathShapeSchema
]);

const highlightStyleResponseSchema = z.object({
  strokeColor: z.string().nullable().optional(),
  strokeWidth: z.number().nullable().optional(),
  dashPattern: z.array(z.number().positive()).nullable().optional(),
  smoothing: z.enum(["none", "catmull-rom", "bezier", "douglas-peucker"]).nullable().optional(),
  tension: z.number().nullable().optional(),
  capStyle: z.enum(["butt", "round", "square"]).nullable().optional(),
  joinStyle: z.enum(["miter", "round", "bevel"]).nullable().optional()
}).nullable().optional();

const highlightShapeResponseSchema: z.ZodType<HighlightShape> = z.discriminatedUnion("type", [
  highlightBoxShapeSchema.extend({ style: highlightStyleResponseSchema }),
  highlightCircleShapeSchema.extend({ style: highlightStyleResponseSchema }),
  highlightPathShapeSchema.extend({ style: highlightStyleResponseSchema })
]);

const highlightEntryResponseSchema: z.ZodType<HighlightEntry> = z.object({
  id: z.string().min(1),
  shape: highlightShapeResponseSchema
});

const highlightResponseSchema: z.ZodType<HighlightOperationResult> = z.object({
  success: z.boolean(),
  error: z.string().nullable().optional(),
  highlights: z.array(highlightEntryResponseSchema),
  requestId: z.string().optional(),
  timestamp: z.number().optional()
}).passthrough();

export interface HighlightOptions {
  deviceId: string;
  platform: Platform;
  sessionUuid?: string;
  timeoutMs?: number;
}

export interface HighlightOperationOptions {
  timeoutMs?: number;
}

export class VisualHighlight {
  private device: BootedDevice;
  private readonly adb: AdbClient;
  private accessibilityServiceClient: AccessibilityServiceClient;

  constructor(
    device: BootedDevice,
    adb: AdbClient | null = null,
    accessibilityServiceClient?: AccessibilityServiceClient
  ) {
    this.device = device;
    this.adb = adb || new AdbClient(device);
    this.accessibilityServiceClient = accessibilityServiceClient
      || AccessibilityServiceClient.getInstance(device, this.adb);
  }

  async addHighlight(
    id: string,
    shape: HighlightShape,
    options: HighlightOperationOptions = {}
  ): Promise<HighlightOperationResult> {
    this.ensureAndroidDevice();
    const highlightId = this.parseHighlightId(id);
    const highlightShape = this.parseHighlightShape(shape);
    const timeoutMs = options.timeoutMs ?? DEFAULT_HIGHLIGHT_TIMEOUT_MS;
    const response = await this.accessibilityServiceClient.requestAddHighlight(
      highlightId,
      highlightShape,
      timeoutMs,
      new NoOpPerformanceTracker()
    );
    return this.parseHighlightResponse(response);
  }

  async removeHighlight(
    id: string,
    options: HighlightOperationOptions = {}
  ): Promise<HighlightOperationResult> {
    this.ensureAndroidDevice();
    const highlightId = this.parseHighlightId(id);
    const timeoutMs = options.timeoutMs ?? DEFAULT_HIGHLIGHT_TIMEOUT_MS;
    const response = await this.accessibilityServiceClient.requestRemoveHighlight(
      highlightId,
      timeoutMs,
      new NoOpPerformanceTracker()
    );
    return this.parseHighlightResponse(response);
  }

  async clearHighlights(
    options: HighlightOperationOptions = {}
  ): Promise<HighlightOperationResult> {
    this.ensureAndroidDevice();
    const timeoutMs = options.timeoutMs ?? DEFAULT_HIGHLIGHT_TIMEOUT_MS;
    const response = await this.accessibilityServiceClient.requestClearHighlights(
      timeoutMs,
      new NoOpPerformanceTracker()
    );
    return this.parseHighlightResponse(response);
  }

  async listHighlights(
    options: HighlightOperationOptions = {}
  ): Promise<HighlightOperationResult> {
    this.ensureAndroidDevice();
    const timeoutMs = options.timeoutMs ?? DEFAULT_HIGHLIGHT_TIMEOUT_MS;
    const response = await this.accessibilityServiceClient.requestListHighlights(
      timeoutMs,
      new NoOpPerformanceTracker()
    );
    return this.parseHighlightResponse(response);
  }

  private parseHighlightId(id: string): string {
    const result = z.string().min(1, "Highlight id must be a non-empty string").safeParse(id);
    if (!result.success) {
      throw new ActionableError(result.error.issues.map(issue => issue.message).join("; "));
    }
    return result.data;
  }

  private parseHighlightShape(shape: HighlightShape): HighlightShape {
    const result = highlightShapeSchema.safeParse(shape);
    if (!result.success) {
      const message = result.error.issues
        .map(issue => issue.message)
        .join("; ");
      throw new ActionableError(message);
    }
    return result.data;
  }

  private parseHighlightResponse(
    response: HighlightOperationResult
  ): HighlightOperationResult {
    const result = highlightResponseSchema.safeParse(response);
    if (!result.success) {
      const message = result.error.issues
        .map(issue => issue.message)
        .join("; ");
      throw new ActionableError(`Invalid highlight response: ${message}`);
    }
    return result.data;
  }

  private ensureAndroidDevice(): void {
    if (this.device.platform !== "android") {
      throw new ActionableError("Visual highlights are only supported on Android devices.");
    }
  }
}

export class VisualHighlightClient {
  private readonly deviceSessionManager: DeviceSessionManager;
  private readonly visualHighlightFactory: (device: BootedDevice) => VisualHighlight;

  constructor(
    deviceSessionManager: DeviceSessionManager = DeviceSessionManager.getInstance(),
    visualHighlightFactory: (device: BootedDevice) => VisualHighlight = device => new VisualHighlight(device)
  ) {
    this.deviceSessionManager = deviceSessionManager;
    this.visualHighlightFactory = visualHighlightFactory;
  }

  async addHighlight(
    id: string,
    shape: HighlightShape,
    options: HighlightOptions
  ): Promise<void> {
    const highlight = await this.resolveHighlight(options);
    const result = await highlight.addHighlight(id, shape, { timeoutMs: options.timeoutMs });
    if (!result.success) {
      throw new ActionableError(result.error || "Failed to add highlight");
    }
  }

  async removeHighlight(
    id: string,
    options: HighlightOptions
  ): Promise<void> {
    const highlight = await this.resolveHighlight(options);
    const result = await highlight.removeHighlight(id, { timeoutMs: options.timeoutMs });
    if (!result.success) {
      throw new ActionableError(result.error || "Failed to remove highlight");
    }
  }

  async clearHighlights(options: HighlightOptions): Promise<void> {
    const highlight = await this.resolveHighlight(options);
    const result = await highlight.clearHighlights({ timeoutMs: options.timeoutMs });
    if (!result.success) {
      throw new ActionableError(result.error || "Failed to clear highlights");
    }
  }

  async listHighlights(options: HighlightOptions): Promise<HighlightShape[]> {
    const highlight = await this.resolveHighlight(options);
    const result = await highlight.listHighlights({ timeoutMs: options.timeoutMs });
    if (!result.success) {
      throw new ActionableError(result.error || "Failed to list highlights");
    }
    return result.highlights.map(entry => entry.shape);
  }

  private async resolveHighlight(options: HighlightOptions): Promise<VisualHighlight> {
    if (options.platform !== "android") {
      throw new ActionableError("Visual highlights are only supported on Android devices.");
    }
    const device = await this.deviceSessionManager.ensureDeviceReady(options.platform, options.deviceId);
    return this.visualHighlightFactory(device);
  }
}
