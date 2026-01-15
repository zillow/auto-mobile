import { ElementBounds } from "./ElementBounds";

export interface KeyboardResult {
  success: boolean;
  open: boolean;
  message?: string;
  error?: string;
  bounds?: ElementBounds[];
}
