import { ObserveResult } from "./ObserveResult";
import { ElementSelector } from "./SetUIStateOptions";

/**
 * Detected field type for a UI element
 */
export type FieldType = "text" | "checkbox" | "toggle" | "dropdown" | "unknown";

/**
 * Result for a single field operation
 */
export interface FieldResult {
  /** Selector used to find the field */
  selector: ElementSelector;
  /** Whether the field was set successfully */
  success: boolean;
  /** Number of attempts made */
  attempts: number;
  /** Whether the value was verified after setting */
  verified?: boolean;
  /** Error message if the operation failed */
  error?: string;
  /** Detected field type */
  fieldType?: FieldType;
  /** Whether the field was skipped because it already had the correct value */
  skipped?: boolean;
}

/**
 * Result of the setUIState operation
 */
export interface SetUIStateResult {
  /** Whether all fields were set successfully */
  success: boolean;
  /** Results for each field */
  fields: FieldResult[];
  /** Total attempts across all fields */
  totalAttempts: number;
  /** Final observation after all operations */
  observation?: ObserveResult;
  /** Error message if the operation failed */
  error?: string;
}
