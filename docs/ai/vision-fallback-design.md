# Vision Fallback Architecture Design

## Overview
Implements AI-powered element search fallbacks using a **hybrid vision approach** when traditional element finding methods fail:
- **Tier 1**: Fast, free local models (Florence-2, PaddleOCR) for common cases
- **Tier 2**: Claude's vision API for complex navigation and analysis

## Design Principles
1. **Last Resort**: Only activate after all existing fallback mechanisms exhausted
2. **Cost Conscious**: Prefer local models (80% cases), escalate to Claude only when needed
3. **High Confidence**: Only suggest navigation steps when confidence is high
4. **Transparent**: Clear error messages when fallback cannot help
5. **Fast & Offline**: Local models provide <500ms responses without internet

## Architecture

### Data Flow (Hybrid Approach)

```
┌─────────────────────────────────────────────────────────────┐
│ Element Interaction Tool (tapOn, swipeOn, etc.)             │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│ ElementFinder.findElementBy{Text|ResourceId}                │
│ - Exact match                                               │
│ - Fuzzy match                                               │
│ - Clickable elements fallback                               │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼ Element not found
┌─────────────────────────────────────────────────────────────┐
│ Retry Loop (5 attempts with exponential backoff)            │
│ - Request fresh hierarchy                                   │
│ - Re-attempt element finding                                │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼ Still not found
┌─────────────────────────────────────────────────────────────┐
│ TIER 1: Local Vision Models (0-500ms, $0)                   │
│                                                             │
│ 1. Florence-2: OCR + Object Detection + Captioning          │
│    - Extract all text with bounding boxes                   │
│    - Detect UI elements (buttons, inputs, etc.)             │
│    - Generate element descriptions                          │
│                                                             │
│ 2. PaddleOCR (fallback): Deep text extraction + layout      │
│    - If Florence-2 confidence < 0.7                         │
│    - Specialized for complex text/multi-language            │
└────────────────────┬────────────────────────────────────────┘
                     │
         ┌───────────┴───────────┐
         │                       │
         ▼ Found (80%)          ▼ Not found (20%)
┌─────────────────────┐   ┌─────────────────────────────────┐
│ Return alternative  │   │ TIER 2: Claude Vision API       │
│ selectors:          │   │ (2-5s, $0.01-0.05)              │
│ - Better text       │   │                                 │
│ - Better resourceId │   │ 1. Optional: Set-of-Mark        │
│ - Element position  │   │    preprocessing                │
│ - Confidence score  │   │ 2. Analyze with Claude          │
└─────────────────────┘   │ 3. Generate navigation steps    │
                          │    OR detailed error            │
                          └────────────┬────────────────────┘
                                       │
                           ┌───────────┴──────────┐
                           │                      │
                           ▼ High confidence      ▼ Low confidence
                    ┌──────────────────┐   ┌─────────────────────┐
                    │ Return navigation│   │ Throw detailed error│
                    │ steps to user    │   │ with vision insights│
                    └──────────────────┘   └─────────────────────┘
```

**Expected Distribution**:
- 80% cases: Tier 1 resolves (local models find alternative selectors)
- 15% cases: Tier 2 resolves (Claude provides navigation)
- 5% cases: Genuine failures (element truly doesn't exist)

### Component Structure

#### 1. VisionFallback Module (`src/VisionFallback.ts`)

```typescript
export interface VisionFallbackConfig {
  enabled: boolean;

  // Tier 1: Local models
  tier1: {
    enabled: boolean;
    models: Array<'florence2' | 'paddleocr'>;
    confidenceThreshold: number;  // 0-1
    timeoutMs: number;
  };

  // Tier 2: Claude vision API
  tier2: {
    enabled: boolean;
    useSoM: boolean;  // Set-of-Mark preprocessing
    confidenceThreshold: "high" | "medium" | "low";
    maxCostUsd: number;
  };

  cacheResults: boolean;
  cacheTtlMinutes: number;
}

export interface ElementSearchCriteria {
  text?: string;
  resourceId?: string;
  containerElementId?: string;
  description?: string;  // Human-readable description of what we're looking for
}

export interface NavigationStep {
  action: "tap" | "swipe" | "scroll" | "input" | "wait";
  target?: string;  // Element text or resourceId
  direction?: "up" | "down" | "left" | "right";
  value?: string;  // For input actions
  description: string;
}

export interface VisionFallbackResult {
  found: boolean;
  confidence: "high" | "medium" | "low";

  // When element can be reached
  navigationSteps?: NavigationStep[];

  // Alternative selectors if element visible but wrong selector
  alternativeSelectors?: Array<{
    type: "text" | "resourceId";
    value: string;
    confidence: number;
  }>;

  // When element cannot be found
  reason?: string;
  similarElements?: string[];  // Elements that might be what user wanted

  // Metadata
  costUsd: number;
  durationMs: number;
  screenshotPath: string;
}

export class VisionFallback {
  constructor(private config: VisionFallbackConfig) {}

  async analyzeAndSuggest(
    screenshotPath: string,
    hierarchy: ViewNode,
    searchCriteria: ElementSearchCriteria
  ): Promise<VisionFallbackResult>;

  private async analyzeScreenshot(
    screenshotPath: string,
    searchCriteria: ElementSearchCriteria
  ): Promise<ClaudeAnalysis>;

  private determineConfidence(analysis: ClaudeAnalysis): "high" | "medium" | "low";

  private generateNavigationSteps(analysis: ClaudeAnalysis): NavigationStep[];

  private generateDetailedError(analysis: ClaudeAnalysis): string;
}
```

#### 2. Claude Vision Integration (`src/vision/ClaudeVisionClient.ts`)

```typescript
export interface ClaudeAnalysis {
  elementFound: boolean;
  elementLocation?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };

  // Alternative selectors
  suggestedText?: string;
  suggestedResourceId?: string;

  // Navigation path
  navigationRequired: boolean;
  steps?: Array<{
    action: string;
    target: string;
    reasoning: string;
  }>;

  // Debugging
  visualDescription: string;
  similarElements: string[];
  confidence: number;  // 0-1
  reasoning: string;
}

export class ClaudeVisionClient {
  constructor(private apiKey?: string) {
    this.apiKey = apiKey || process.env.ANTHROPIC_API_KEY;
  }

  async analyzeUIElement(
    screenshotPath: string,
    searchCriteria: ElementSearchCriteria,
    viewHierarchy?: ViewNode
  ): Promise<ClaudeAnalysis>;

  private buildAnalysisPrompt(
    criteria: ElementSearchCriteria,
    hierarchy?: ViewNode
  ): string;

  private parseClaudeResponse(response: string): ClaudeAnalysis;
}
```

#### 3. Florence-2 Local Vision Client (`src/vision/Florence2Client.ts`)

```typescript
export interface Florence2Result {
  // OCR with bounding boxes
  textElements: Array<{
    text: string;
    bounds: { x: number; y: number; width: number; height: number };
    confidence: number;
  }>;

  // Object detection (UI elements)
  uiElements: Array<{
    label: string;  // "button", "input", "menu", etc.
    bounds: { x: number; y: number; width: number; height: number };
    confidence: number;
  }>;

  // Element descriptions/captions
  descriptions: Array<{
    phrase: string;
    bounds: { x: number; y: number; width: number; height: number };
  }>;
}

export class Florence2Client {
  private session: ort.InferenceSession | null = null;

  async initialize(modelPath: string): Promise<void> {
    // Load ONNX model once at startup
    this.session = await ort.InferenceSession.create(modelPath, {
      executionProviders: ['cuda', 'cpu']
    });
  }

  async analyzeUI(screenshotPath: string): Promise<Florence2Result> {
    // 1. OCR with regions
    const ocrResult = await this.runTask('OCR_WITH_REGION', screenshotPath);

    // 2. Object detection
    const objectsResult = await this.runTask('<OD>', screenshotPath);

    // 3. Generate element descriptions
    const descriptions = await this.runTask(
      '<CAPTION_TO_PHRASE_GROUNDING>',
      screenshotPath,
      'button input field menu icon'
    );

    return {
      textElements: this.parseOCRResult(ocrResult),
      uiElements: this.parseObjectDetection(objectsResult),
      descriptions: this.parsePhraseGrounding(descriptions)
    };
  }

  private async runTask(task: string, imagePath: string, prompt?: string): Promise<any>;
  private parseOCRResult(raw: any): Florence2Result['textElements'];
  private parseObjectDetection(raw: any): Florence2Result['uiElements'];
  private parsePhraseGrounding(raw: any): Florence2Result['descriptions'];
}
```

#### 4. PaddleOCR Local Vision Client (`src/vision/PaddleOCRClient.ts`)

```typescript
export interface PaddleOCRResult {
  textElements: Array<{
    text: string;
    bounds: { x: number; y: number; width: number; height: number };
    confidence: number;
  }>;

  // Layout analysis
  layout: Array<{
    type: 'text' | 'title' | 'list' | 'table' | 'figure';
    bounds: { x: number; y: number; width: number; height: number };
  }>;
}

export class PaddleOCRClient {
  private detectionSession: ort.InferenceSession | null = null;
  private recognitionSession: ort.InferenceSession | null = null;

  async initialize(detModelPath: string, recModelPath: string): Promise<void> {
    // Load detection and recognition models
    this.detectionSession = await ort.InferenceSession.create(detModelPath);
    this.recognitionSession = await ort.InferenceSession.create(recModelPath);
  }

  async extractText(screenshotPath: string): Promise<PaddleOCRResult> {
    // 1. Text detection - find text regions
    const textRegions = await this.detectTextRegions(screenshotPath);

    // 2. Text recognition - OCR each region
    const recognizedText = await Promise.all(
      textRegions.map(region => this.recognizeText(screenshotPath, region))
    );

    // 3. Optional: Layout analysis
    const layout = await this.analyzeLayout(screenshotPath);

    return {
      textElements: recognizedText,
      layout
    };
  }

  private async detectTextRegions(imagePath: string): Promise<Array<{bounds: any}>>;
  private async recognizeText(imagePath: string, region: any): Promise<any>;
  private async analyzeLayout(imagePath: string): Promise<any>;
}
```

#### 5. Integration into ElementFinder (`src/ElementFinder.ts`)

```typescript
export class ElementFinder {
  // Add optional vision fallback
  static async findElementWithFallback(
    observeResult: ObserveResult,
    criteria: ElementSearchCriteria,
    visionConfig?: VisionFallbackConfig
  ): Promise<FoundElement | VisionFallbackResult> {

    // Try traditional methods first
    const element = this.findElementByText(...) || this.findElementByResourceId(...);

    if (element) {
      return { type: "found", element };
    }

    // If vision fallback enabled, try it
    if (visionConfig?.enabled) {
      const visionFallback = new VisionFallback(visionConfig);
      const result = await visionFallback.analyzeAndSuggest(
        observeResult.screenshotPath,
        observeResult.hierarchy,
        criteria
      );
      return { type: "vision", result };
    }

    return { type: "not_found" };
  }
}
```

#### 4. Tool Integration Example (`src/tools/TapOnElement.ts`)

```typescript
export async function tapOnElement(params: TapOnParams): Promise<TapOnResult> {
  // ... existing retry loop ...

  // After all retries exhausted
  if (!element && config.visionFallback?.enabled) {
    const visionResult = await VisionFallback.analyzeAndSuggest(
      latestObserveResult.screenshotPath,
      latestObserveResult.hierarchy,
      {
        text: params.text,
        resourceId: params.id,
        description: `Interactive element for tapping`
      }
    );

    if (visionResult.confidence === "high" && visionResult.navigationSteps) {
      throw new ActionableError(
        `Element not found, but AI suggests these steps:\n${
          visionResult.navigationSteps.map((s, i) =>
            `${i+1}. ${s.description}`
          ).join('\n')
        }`,
        visionResult
      );
    } else {
      throw new ActionableError(
        `Element not found. ${visionResult.reason}`,
        visionResult
      );
    }
  }

  throw new ActionableError("Element not found after all retries");
}
```

### Prompt Engineering

#### Analysis Prompt Template

```typescript
const VISION_ANALYSIS_PROMPT = `
You are an Android UI automation expert analyzing a screenshot to help locate a specific UI element.

SEARCH CRITERIA:
${criteria.text ? `- Text: "${criteria.text}"` : ''}
${criteria.resourceId ? `- Resource ID: "${criteria.resourceId}"` : ''}
${criteria.description ? `- Description: ${criteria.description}` : ''}

VIEW HIERARCHY (for reference):
${JSON.stringify(hierarchy, null, 2)}

ANALYSIS TASKS:
1. **Locate Element**: Find the element matching the criteria in the screenshot
   - If found, provide exact coordinates and bounds
   - If not visible, explain why (scrolled off-screen, hidden, doesn't exist)

2. **Alternative Selectors**: If element visible but criteria don't match exactly
   - Suggest corrected text or resource ID values
   - Explain what changed (typo, UI update, etc.)

3. **Navigation Steps**: If element exists but requires navigation to reach
   - Provide step-by-step instructions to reach it
   - Include specific UI elements to interact with
   - Only suggest if you have HIGH confidence (>90%)

4. **Similar Elements**: List elements that might be what the user intended
   - Include their text, resource IDs, and visual appearance
   - Explain why they might be confused

RESPONSE FORMAT (JSON only):
{
  "elementFound": boolean,
  "elementLocation": {"x": number, "y": number, "width": number, "height": number} | null,
  "suggestedText": string | null,
  "suggestedResourceId": string | null,
  "navigationRequired": boolean,
  "steps": [
    {"action": "tap|swipe|scroll|input", "target": string, "reasoning": string}
  ] | null,
  "visualDescription": string,
  "similarElements": string[],
  "confidence": number,  // 0-1
  "reasoning": string
}

IMPORTANT:
- Only suggest navigation steps if confidence > 0.9
- Be specific about element positions and attributes
- If unsure, explain what you see and why it's ambiguous
`;
```

### Configuration

#### Project Settings (`.claude/settings.json` or similar)

```json
{
  "visionFallback": {
    "enabled": true,
    "confidenceThreshold": "high",
    "maxCostUsd": 1.0,
    "cacheResults": true,
    "cacheTtlMinutes": 60
  }
}
```

#### Per-Tool Configuration

```typescript
// Allow tools to override global config
tapOn({
  text: "Search",
  visionFallback: {
    enabled: true,
    confidenceThreshold: "medium"  // Lower threshold for debugging
  }
});
```

## Android Accessibility Service Enhancement

### Auto-Scroll to Element

Add to `AccessibilityService.kt`:

```kotlin
fun autoScrollToElement(
    targetText: String?,
    targetResourceId: String?,
    maxScrollAttempts: Int = 10
): ScrollResult {

  // 1. Search in current view
  val node = findNodeMatching(targetText, targetResourceId)
  if (node != null && node.isVisibleToUser) {
    return ScrollResult.AlreadyVisible(node.boundsInScreen)
  }

  // 2. Find scrollable container
  val scrollableContainer = findScrollableContainer()
  if (scrollableContainer == null) {
    return ScrollResult.NotScrollable
  }

  // 3. Scroll and search iteratively
  var lastHierarchyHash = ""
  for (attempt in 0 until maxScrollAttempts) {

    // Scroll down
    scrollableContainer.performAction(AccessibilityNodeInfo.ACTION_SCROLL_FORWARD)
    Thread.sleep(300)  // Wait for scroll animation

    // Check if element now visible
    val foundNode = findNodeMatching(targetText, targetResourceId)
    if (foundNode != null && foundNode.isVisibleToUser) {
      return ScrollResult.Found(foundNode.boundsInScreen, attempt + 1)
    }

    // Check if reached end (hierarchy unchanged)
    val currentHash = computeHierarchyHash()
    if (currentHash == lastHierarchyHash) {
      return ScrollResult.EndReached(attempt + 1)
    }
    lastHierarchyHash = currentHash
  }

  return ScrollResult.MaxAttemptsReached
}

sealed class ScrollResult {
  data class AlreadyVisible(val bounds: Rect): ScrollResult()
  data class Found(val bounds: Rect, val scrollAttempts: Int): ScrollResult()
  data class EndReached(val scrollAttempts: Int): ScrollResult()
  object NotScrollable: ScrollResult()
  object MaxAttemptsReached: ScrollResult()
}
```

### WebSocket Command Integration

```kotlin
// In WebSocketServer.kt
when (command.type) {
  "AUTO_SCROLL_TO_ELEMENT" -> {
    val result = autoScrollToElement(
      targetText = command.data["text"] as? String,
      targetResourceId = command.data["resourceId"] as? String,
      maxScrollAttempts = command.data["maxAttempts"] as? Int ?: 10
    )
    sendResponse(CommandResponse.success(result))
  }
}
```

## Testing Strategy

### Unit Tests
- VisionFallback prompt generation
- Response parsing
- Confidence calculation
- Navigation step generation

### Integration Tests
- Screenshot analysis with mock Claude responses
- End-to-end element finding with vision fallback
- Cost tracking and limits

### Manual Testing
- Real app scenarios with missing elements
- UI changes between app versions
- Complex navigation paths

## Cost Management

### Tracking
```typescript
export class VisionCostTracker {
  private totalCostUsd = 0;
  private callCount = 0;

  recordCall(costUsd: number): void {
    this.totalCostUsd += costUsd;
    this.callCount++;
  }

  getStats(): CostStats {
    return {
      totalCostUsd: this.totalCostUsd,
      callCount: this.callCount,
      avgCostPerCall: this.totalCostUsd / this.callCount
    };
  }
}
```

### Limits
- Global max cost per session
- Per-tool call timeout
- Cache results to avoid repeated analysis

## Error Handling

### Scenarios
1. **API key missing**: Graceful degradation, clear error message
2. **API rate limit**: Exponential backoff, retry logic
3. **Invalid screenshot**: Validation before API call
4. **Unparseable response**: Fallback to simple error message
5. **Confidence too low**: Don't suggest navigation, provide detailed error

## Performance Considerations

1. **Screenshot optimization**: Resize to ~1000x1000 before sending
2. **Caching**: Cache vision results by screenshot hash + criteria
3. **Async**: Don't block on vision analysis
4. **Token limits**: Use efficient prompts, limit hierarchy size in context

## Success Metrics

- % of failed element searches rescued by vision fallback
- Average cost per vision fallback call
- Confidence distribution (how often high/medium/low)
- Navigation step accuracy (manual verification)

## Future Enhancements

1. **Learning from corrections**: Track when users manually fix selectors
2. **Multi-screenshot analysis**: Compare before/after states
3. **Visual regression detection**: Alert when UI changed significantly
4. **Element highlighting**: Return annotated screenshots with element boxes
5. **Batch analysis**: Analyze multiple missing elements in one call
