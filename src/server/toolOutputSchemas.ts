import { z } from "zod";

export const elementBoundsSchema = z.object({
  left: z.number().int(),
  top: z.number().int(),
  right: z.number().int(),
  bottom: z.number().int(),
  centerX: z.number().int().optional(),
  centerY: z.number().int().optional()
});

export const elementSchema = z.object({
  "bounds": elementBoundsSchema,
  "text": z.string().optional(),
  "resource-id": z.string().optional(),
  "content-desc": z.string().optional(),
  "class": z.string().optional(),
  "package": z.string().optional(),
  "checkable": z.boolean().optional(),
  "checked": z.boolean().optional(),
  "clickable": z.boolean().optional(),
  "enabled": z.boolean().optional(),
  "focusable": z.boolean().optional(),
  "focused": z.boolean().optional(),
  "accessibility-focused": z.boolean().optional(),
  "scrollable": z.boolean().optional(),
  "selected": z.boolean().optional()
}).passthrough();

export const selectedElementStateSchema = z.object({
  method: z.enum(["accessibility", "visual"]),
  confidence: z.number(),
  reason: z.string().optional()
});

export const selectedElementSchema = z.object({
  text: z.string().optional(),
  resourceId: z.string().optional(),
  contentDesc: z.string().optional(),
  bounds: elementBoundsSchema.optional(),
  indexInMatches: z.number().int().optional(),
  totalMatches: z.number().int().optional(),
  selectionStrategy: z.string().optional(),
  selectedState: selectedElementStateSchema.optional()
}).passthrough();

export const activeWindowSchema = z.object({
  appId: z.string().optional(),
  activityName: z.string().optional(),
  layoutSeqSum: z.number().int().optional(),
  type: z.string().optional()
}).passthrough();

export const observationSummarySchema = z.object({
  selectedElements: z.array(selectedElementSchema).optional(),
  focusedElement: elementSchema.optional(),
  accessibilityFocusedElement: elementSchema.optional(),
  activeWindow: activeWindowSchema.optional()
}).passthrough();

export const screenSizeSchema = z.object({
  width: z.number().int(),
  height: z.number().int()
});

export const systemInsetsSchema = z.object({
  top: z.number().int(),
  right: z.number().int(),
  bottom: z.number().int(),
  left: z.number().int()
});

export const scrollableCandidateSchema = z.object({
  elementId: z.string().optional(),
  text: z.string().optional(),
  contentDesc: z.string().optional(),
  className: z.string().optional()
}).passthrough();

export const predictionTargetSchema = z.object({
  text: z.string().optional(),
  elementId: z.string().optional(),
  contentDesc: z.string().optional(),
  container: z.object({
    text: z.string().optional(),
    elementId: z.string().optional(),
    contentDesc: z.string().optional()
  }).optional(),
  lookFor: z.object({
    text: z.string().optional(),
    elementId: z.string().optional(),
    contentDesc: z.string().optional()
  }).optional()
}).passthrough();

export const predictedActionSchema = z.object({
  action: z.string(),
  target: predictionTargetSchema,
  predictedScreen: z.string(),
  predictedElements: z.array(z.string()).optional(),
  confidence: z.number()
}).passthrough();

export const interactablePredictionSchema = z.object({
  elementId: z.string().optional(),
  elementText: z.string().optional(),
  elementContentDesc: z.string().optional(),
  predictedOutcome: z.object({
    screenName: z.string(),
    basedOn: z.enum(["navigation_graph"])
  }).optional()
}).passthrough();

export const predictionsSchema = z.object({
  likelyActions: z.array(predictedActionSchema),
  interactableElements: z.array(interactablePredictionSchema)
}).passthrough();

export const freshnessSchema = z.object({
  requestedAfter: z.number().int().optional(),
  actualTimestamp: z.number().int().optional(),
  isFresh: z.boolean(),
  staleDurationMs: z.number().int().optional(),
  warning: z.string().optional()
}).passthrough();

export const accessibilityStateSchema = z.object({
  enabled: z.boolean(),
  service: z.enum(["talkback", "unknown"])
}).passthrough();
