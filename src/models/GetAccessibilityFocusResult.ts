import { Element } from "./Element";

/**
 * Result of a getAccessibilityFocus operation.
 * This interface defines the return value for the future getAccessibilityFocus tool.
 *
 * Note: Implementation is deferred to a future PR. This interface serves as a scaffold
 * for the tool's contract.
 */
export interface GetAccessibilityFocusResult {
  /**
   * Whether the operation succeeded
   */
  success: boolean;

  /**
   * Error message if the operation failed
   */
  error?: string;

  /**
   * The element that currently has accessibility focus (TalkBack/VoiceOver cursor)
   * Will be undefined if no element has accessibility focus
   */
  focusedElement?: Element;
}
