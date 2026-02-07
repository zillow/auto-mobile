/**
 * Claude Vision API client for UI element detection
 */

import Anthropic from "@anthropic-ai/sdk";
import fs from "fs";
import type {
  ElementSearchCriteria,
  ClaudeVisionAnalysis,
  VisionFallbackResult,
  NavigationStep,
  AlternativeSelector,
} from "./VisionTypes";
import type { ViewHierarchyNode } from "../models/ViewHierarchyResult";
import type { Timer } from "../utils/SystemTimer";
import { defaultTimer } from "../utils/SystemTimer";

export class ClaudeVisionClient {
  private client: Anthropic;
  private model: string;
  private timer: Timer;

  constructor(apiKey?: string, model: string = "claude-sonnet-4-5", timer: Timer = defaultTimer) {
    this.client = new Anthropic({
      apiKey: apiKey || process.env.ANTHROPIC_API_KEY,
    });
    this.model = model;
    this.timer = timer;
  }

  async analyzeUIElement(
    screenshotPath: string,
    searchCriteria: ElementSearchCriteria,
    viewHierarchy?: ViewHierarchyNode
  ): Promise<VisionFallbackResult> {
    const startTime = this.timer.now();

    try {
      // Build the analysis prompt
      const prompt = this.buildAnalysisPrompt(searchCriteria, viewHierarchy);

      // Read screenshot as base64
      const imageData = fs.readFileSync(screenshotPath);
      const base64Image = imageData.toString("base64");

      // Call Claude vision API
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: 2048,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: {
                  type: "base64",
                  media_type: "image/png",
                  data: base64Image,
                },
              },
              {
                type: "text",
                text: prompt,
              },
            ],
          },
        ],
      });

      // Parse response
      const analysis = this.parseClaudeResponse(response);

      // Calculate cost (approximate)
      const inputTokens = response.usage.input_tokens;
      const outputTokens = response.usage.output_tokens;
      const costUsd = this.calculateCost(inputTokens, outputTokens);

      const durationMs = this.timer.now() - startTime;

      // Convert analysis to VisionFallbackResult
      return this.convertToFallbackResult(
        analysis,
        costUsd,
        durationMs,
        screenshotPath
      );
    } catch (error) {
      console.error("Claude Vision API error:", error);
      throw error;
    }
  }

  private buildAnalysisPrompt(
    criteria: ElementSearchCriteria,
    hierarchy?: ViewHierarchyNode
  ): string {
    const parts: string[] = [];

    parts.push("You are an Android UI automation expert analyzing a screenshot to help locate a specific UI element.");
    parts.push("");

    parts.push("SEARCH CRITERIA:");
    if (criteria.text) {
      parts.push(`- Text: "${criteria.text}"`);
    }
    if (criteria.resourceId) {
      parts.push(`- Resource ID: "${criteria.resourceId}"`);
    }
    if (criteria.description) {
      parts.push(`- Description: ${criteria.description}`);
    }
    parts.push("");

    if (hierarchy) {
      parts.push("VIEW HIERARCHY (for reference):");
      parts.push("```json");
      parts.push(JSON.stringify(hierarchy, null, 2).slice(0, 5000)); // Limit size
      parts.push("```");
      parts.push("");
    }

    parts.push("ANALYSIS TASKS:");
    parts.push("1. **Locate Element**: Find the element matching the criteria in the screenshot");
    parts.push("   - If found, provide exact coordinates and bounds");
    parts.push("   - If not visible, explain why (scrolled off-screen, hidden, doesn't exist)");
    parts.push("");

    parts.push("2. **Alternative Selectors**: If element visible but criteria don't match exactly");
    parts.push("   - Suggest corrected text or resource ID values");
    parts.push("   - Explain what changed (typo, UI update, etc.)");
    parts.push("");

    parts.push("3. **Navigation Steps**: If element exists but requires navigation to reach");
    parts.push("   - Provide step-by-step instructions to reach it");
    parts.push("   - Include specific UI elements to interact with");
    parts.push("   - Only suggest if you have HIGH confidence (>90%)");
    parts.push("");

    parts.push("4. **Similar Elements**: List elements that might be what the user intended");
    parts.push("   - Include their text, resource IDs, and visual appearance");
    parts.push("   - Explain why they might be confused");
    parts.push("");

    parts.push("RESPONSE FORMAT (JSON only):");
    parts.push("```json");
    parts.push("{");
    parts.push('  "elementFound": boolean,');
    parts.push('  "elementLocation": {"x": number, "y": number, "width": number, "height": number} | null,');
    parts.push('  "suggestedText": string | null,');
    parts.push('  "suggestedResourceId": string | null,');
    parts.push('  "navigationRequired": boolean,');
    parts.push('  "steps": [');
    parts.push('    {"action": "tap|swipe|scroll|input", "target": string, "reasoning": string}');
    parts.push("  ] | null,");
    parts.push('  "visualDescription": string,');
    parts.push('  "similarElements": string[],');
    parts.push('  "confidence": number,  // 0-1');
    parts.push('  "reasoning": string');
    parts.push("}");
    parts.push("```");
    parts.push("");

    parts.push("IMPORTANT:");
    parts.push("- Only suggest navigation steps if confidence > 0.9");
    parts.push("- Be specific about element positions and attributes");
    parts.push("- If unsure, explain what you see and why it's ambiguous");
    parts.push("- Return ONLY the JSON, no additional text");

    return parts.join("\n");
  }

  private parseClaudeResponse(response: Anthropic.Message): ClaudeVisionAnalysis {
    // Extract text from response
    let responseText = "";
    for (const block of response.content) {
      if (block.type === "text") {
        responseText += block.text;
      }
    }

    // Try to extract JSON from the response
    const jsonMatch = responseText.match(/```json\n([\s\S]*?)\n```/) || responseText.match(/\{[\s\S]*\}/);

    if (!jsonMatch) {
      throw new Error("Failed to parse JSON from Claude response");
    }

    const jsonStr = jsonMatch[1] || jsonMatch[0];
    const parsed = JSON.parse(jsonStr);

    return {
      elementFound: parsed.elementFound || false,
      elementLocation: parsed.elementLocation || undefined,
      suggestedText: parsed.suggestedText || undefined,
      suggestedResourceId: parsed.suggestedResourceId || undefined,
      navigationRequired: parsed.navigationRequired || false,
      steps: parsed.steps || undefined,
      visualDescription: parsed.visualDescription || "",
      similarElements: parsed.similarElements || [],
      confidence: parsed.confidence || 0,
      reasoning: parsed.reasoning || "",
    };
  }

  private convertToFallbackResult(
    analysis: ClaudeVisionAnalysis,
    costUsd: number,
    durationMs: number,
    screenshotPath: string
  ): VisionFallbackResult {
    // Determine confidence level
    const confidenceLevel: "high" | "medium" | "low" =
      analysis.confidence >= 0.9 ? "high" :
        analysis.confidence >= 0.7 ? "medium" : "low";

    // Build navigation steps if provided
    const navigationSteps: NavigationStep[] | undefined = analysis.steps?.map(step => ({
      action: this.mapAction(step.action),
      target: step.target,
      description: step.reasoning,
    }));

    // Build alternative selectors
    const alternativeSelectors: AlternativeSelector[] = [];
    if (analysis.suggestedText) {
      alternativeSelectors.push({
        type: "text",
        value: analysis.suggestedText,
        confidence: analysis.confidence,
        reasoning: "Claude suggested this text as alternative",
      });
    }
    if (analysis.suggestedResourceId) {
      alternativeSelectors.push({
        type: "resourceId",
        value: analysis.suggestedResourceId,
        confidence: analysis.confidence,
        reasoning: "Claude suggested this resource ID as alternative",
      });
    }

    return {
      found: analysis.elementFound,
      confidence: confidenceLevel,
      navigationSteps: navigationSteps && navigationSteps.length > 0 ? navigationSteps : undefined,
      alternativeSelectors: alternativeSelectors.length > 0 ? alternativeSelectors : undefined,
      reason: !analysis.elementFound ? analysis.reasoning : undefined,
      similarElements: analysis.similarElements,
      costUsd,
      durationMs,
      screenshotPath,
      provider: "claude",
    };
  }

  private mapAction(action: string): NavigationStep["action"] {
    const normalized = action.toLowerCase();
    if (normalized.includes("tap") || normalized.includes("click")) {return "tap";}
    if (normalized.includes("swipe")) {return "swipe";}
    if (normalized.includes("scroll")) {return "scroll";}
    if (normalized.includes("input") || normalized.includes("type")) {return "input";}
    if (normalized.includes("wait")) {return "wait";}
    return "tap"; // Default
  }

  private calculateCost(inputTokens: number, outputTokens: number): number {
    // Claude Sonnet 4.5 pricing (as of 2025)
    // Input: $3 per million tokens
    // Output: $15 per million tokens
    const inputCost = (inputTokens / 1_000_000) * 3.0;
    const outputCost = (outputTokens / 1_000_000) * 15.0;
    return inputCost + outputCost;
  }
}
