import { z } from "zod";

export const elementContainerSchema = z.union([
  z.object({
    elementId: z.string().describe("Container resource ID")
  }).strict(),
  z.object({
    text: z.string().describe("Container text")
  }).strict()
]);

export const elementSelectorSchema = z.union([
  z.object({
    text: z.string().describe("Element text")
  }).strict(),
  z.object({
    id: z.string().describe("Element ID")
  }).strict()
]);

export const elementSelectionStrategySchema = z.enum(["first", "random"]);
