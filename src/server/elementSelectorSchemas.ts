import { z } from "zod";

export const elementContainerSchema = z.union([
  z.object({
    elementId: z.string().describe("Container resource ID")
  }).strict(),
  z.object({
    text: z.string().describe("Container text")
  }).strict()
]);

export const elementIdTextSchema = z.object({
  id: z.string().describe("Element resource ID / accessibility identifier").optional(),
  text: z.string().describe("Element text").optional()
}).strict();

export const elementSelectionStrategySchema = z.enum(["first", "random"]);
