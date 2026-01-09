/**
 * Result of a clipboard operation
 */
export interface ClipboardResult {
  success: boolean;
  action: "copy" | "paste" | "clear" | "get";
  text?: string; // For 'get' action, the clipboard content
  error?: string;
  method?: "a11y" | "adb"; // Which method was used
}
