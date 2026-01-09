import { Element } from "./Element";

/**
 * Result of a setAccessibilityFocus operation.
 * This interface defines the return value for the future setAccessibilityFocus tool.
 *
 * Note: Implementation is deferred to a future PR. This interface serves as a scaffold
 * for the tool's contract.
 */
export interface SetAccessibilityFocusResult {
  /**
   * Whether the operation succeeded
   */
  success: boolean;

  /**
   * Error message if the operation failed
   */
  error?: string;

  /**
   * Warning message if the operation partially succeeded
   */
  warning?: string;

  /**
   * The element that received accessibility focus
   */
  focusedElement?: Element;
}
