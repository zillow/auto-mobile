import { ElementBounds } from "./ElementBounds";

/**
 * Represents a UI element with its properties
 */
export interface Element {
  bounds: ElementBounds;
  text?: string;
  "content-desc"?: string;
  "resource-id"?: string;
  "class"?: string;
  "package"?: string;
  checkable?: boolean;
  checked?: boolean;
  clickable?: boolean;
  enabled?: boolean;
  focusable?: boolean;
  focused?: boolean;
  scrollable?: boolean;
  orientation?: string;
  selected?: boolean;
  [key: string]: any;
}
