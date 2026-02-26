export interface TalkBackResult {
  supported: boolean;
  applied: boolean;
  reason?: string;
  currentState?: boolean;
}

export interface AccessibilityResult {
  talkback?: TalkBackResult;
}
