/**
 * Selector for targeting a UI element
 */
export interface ElementSelector {
  /** Element text or accessibility label */
  text?: string;
  /** Element resource ID / accessibility identifier */
  elementId?: string;
}

/**
 * Specification for a single field to set
 */
export interface FieldSpec {
  /** Selector to find the field element */
  selector: ElementSelector;
  /** Value to set (for text inputs and dropdowns) */
  value?: string;
  /** Target selection state (for checkboxes and toggles) */
  selected?: boolean;
  /** Skip verification after setting (for sensitive fields like passwords) */
  sensitive?: boolean;
}

/**
 * Options for the setUIState operation
 */
export interface SetUIStateOptions {
  /** List of fields to set */
  fields: FieldSpec[];
  /** Maximum retry attempts per field (default: 3) */
  maxRetries?: number;
  /** Verify field values after setting (default: true) */
  verifyAfter?: boolean;
  /** Scroll to find fields that aren't visible (default: true) */
  scrollToFind?: boolean;
  /** Initial scroll direction when searching (default: "down") */
  scrollDirection?: "up" | "down";
}
