import { Element } from "../models/Element";

export function isTruthyFlag(value: unknown): boolean {
  return value === true || value === "true";
}

export function buildContainerFromElement(element: Element): { elementId?: string; text?: string } | null {
  if (element["resource-id"]) {
    return { elementId: element["resource-id"] };
  }
  if (element.text) {
    return { text: element.text };
  }
  if (element["content-desc"]) {
    return { text: element["content-desc"] };
  }
  if (element["ios-accessibility-label"]) {
    return { text: element["ios-accessibility-label"] };
  }
  return null;
}

export const ANDROID_INPUT_CLASSES: readonly string[] = [
  "android.widget.EditText",
  "android.widget.AutoCompleteTextView",
  "android.widget.MultiAutoCompleteTextView",
  "androidx.appcompat.widget.AppCompatEditText"
];
