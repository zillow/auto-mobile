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
}

/**
 * Options for the setUIState operation
 */
export interface SetUIStateOptions {
  /** List of fields to set */
  fields: FieldSpec[];
  /** Initial scroll direction when searching (default: "down") */
  scrollDirection?: "up" | "down";
}
