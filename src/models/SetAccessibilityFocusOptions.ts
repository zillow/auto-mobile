/**
 * Options for setting accessibility focus (TalkBack/VoiceOver cursor) on a specific element.
 * This interface defines the parameters for the future setAccessibilityFocus tool.
 *
 * Note: Implementation is deferred to a future PR. This interface serves as a scaffold
 * for the tool's contract.
 */
export interface SetAccessibilityFocusOptions {
  /**
   * Target element selectors (at least one must be specified)
   */
  text?: string; // Text content of the element
  resourceId?: string; // Resource ID of the element (e.g., "com.app:id/button")
  contentDesc?: string; // Content description of the element

  /**
   * Whether to trigger TalkBack announcement when focus is set (default: true)
   */
  announce?: boolean;
}
