import { Element } from "../../models/Element";
import { FieldType } from "../../models/SetUIStateResult";

/**
 * Platform-specific class patterns for field type detection
 */
const ANDROID_PATTERNS = {
  text: [
    "android.widget.EditText",
    "android.widget.AutoCompleteTextView",
    "android.widget.MultiAutoCompleteTextView",
    "androidx.appcompat.widget.AppCompatEditText",
    "com.google.android.material.textfield.TextInputEditText"
  ],
  toggle: [
    "android.widget.Switch",
    "android.widget.ToggleButton",
    "androidx.appcompat.widget.SwitchCompat",
    "com.google.android.material.switchmaterial.SwitchMaterial"
  ],
  checkbox: [
    "android.widget.CheckBox",
    "androidx.appcompat.widget.AppCompatCheckBox",
    "android.widget.RadioButton",
    "androidx.appcompat.widget.AppCompatRadioButton"
  ],
  dropdown: [
    "android.widget.Spinner",
    "androidx.appcompat.widget.AppCompatSpinner",
    "android.widget.AutoCompleteTextView" // Can act as dropdown
  ]
};

const IOS_PATTERNS = {
  text: [
    "UITextField",
    "UITextView",
    "UISearchBar"
  ],
  toggle: [
    "UISwitch"
  ],
  checkbox: [
    // iOS doesn't have native checkbox, often uses custom views
  ],
  dropdown: [
    "UIPickerView",
    "UIDatePicker"
  ]
};

/**
 * Detects the field type from element properties
 */
export class FieldTypeDetector {
  /**
   * Detect the field type for a given element
   * @param element - The element to analyze
   * @returns The detected field type
   */
  detect(element: Element): FieldType {
    const className = this.getClassName(element);
    const isCheckable = this.isCheckable(element);
    const isFocusable = this.isFocusable(element);
    const isClickable = this.isClickable(element);

    // Check for toggle first (checkable + switch/toggle class)
    if (isCheckable && this.matchesTogglePattern(className)) {
      return "toggle";
    }

    // Check for checkbox (checkable but not toggle)
    if (isCheckable) {
      return "checkbox";
    }

    // Check for dropdown patterns
    if (this.matchesDropdownPattern(className)) {
      return "dropdown";
    }

    // Check for text input patterns
    if (this.matchesTextPattern(className)) {
      return "text";
    }

    // Fallback: focusable + clickable suggests text input
    if (isFocusable && isClickable) {
      return "text";
    }

    return "unknown";
  }

  private getClassName(element: Element): string {
    return String(element["class"] ?? element.className ?? "").toLowerCase();
  }

  private isCheckable(element: Element): boolean {
    const checkable = element.checkable;
    return checkable === true || checkable === "true";
  }

  private isFocusable(element: Element): boolean {
    const focusable = element.focusable;
    return focusable === true || focusable === "true";
  }

  private isClickable(element: Element): boolean {
    const clickable = element.clickable;
    return clickable === true || clickable === "true";
  }

  private matchesTogglePattern(className: string): boolean {
    const patterns = [...ANDROID_PATTERNS.toggle, ...IOS_PATTERNS.toggle];
    return patterns.some(pattern => className.includes(pattern.toLowerCase()));
  }

  private matchesDropdownPattern(className: string): boolean {
    const patterns = [...ANDROID_PATTERNS.dropdown, ...IOS_PATTERNS.dropdown];
    // Exclude AutoCompleteTextView if it doesn't have dropdown indicators
    return patterns.some(pattern => {
      const lowerPattern = pattern.toLowerCase();
      if (lowerPattern.includes("autocomplete")) {
        // Only match AutoCompleteTextView if it looks like a spinner/dropdown
        return className.includes("spinner") || className.includes("dropdown") || className.includes("picker");
      }
      return className.includes(lowerPattern);
    });
  }

  private matchesTextPattern(className: string): boolean {
    const patterns = [...ANDROID_PATTERNS.text, ...IOS_PATTERNS.text];
    return patterns.some(pattern => className.includes(pattern.toLowerCase()));
  }

  /**
   * Check if an element is currently checked/selected
   * @param element - The element to check
   * @returns true if the element is checked/selected
   */
  isChecked(element: Element): boolean {
    const checked = element.checked;
    return checked === true || checked === "true";
  }

  /**
   * Get the current text value of an element
   * For iOS, the `text` property often contains the accessibility label, not the input value.
   * iOS text fields may have a `value` property with the actual input value.
   * @param element - The element to get text from
   * @returns The text value or empty string
   */
  getTextValue(element: Element): string {
    // For iOS elements, prefer the `value` attribute which contains the actual input value
    // The `text` attribute on iOS often contains the accessibility label
    if (typeof element.value === "string") {
      return element.value;
    }
    if (typeof element.text === "string") {
      return element.text;
    }
    return "";
  }

  /**
   * Check if element is an iOS element based on class patterns
   * @param element - The element to check
   * @returns true if the element appears to be iOS
   */
  isIOSElement(element: Element): boolean {
    const className = this.getClassName(element);
    return IOS_PATTERNS.text.some(pattern => className.includes(pattern.toLowerCase())) ||
           IOS_PATTERNS.toggle.some(pattern => className.includes(pattern.toLowerCase())) ||
           IOS_PATTERNS.dropdown.some(pattern => className.includes(pattern.toLowerCase()));
  }

  /**
   * Check if verification should be skipped for this element/field type combination.
   * On iOS, text and dropdown verification is unreliable because `text` contains the
   * accessibility label rather than the actual input value.
   * @param element - The element to check
   * @param fieldType - The detected field type
   * @returns true if verification should be skipped
   */
  shouldSkipVerification(element: Element, fieldType: FieldType): boolean {
    // On iOS, text verification is unreliable unless `value` attribute is available
    if (this.isIOSElement(element) && (fieldType === "text" || fieldType === "dropdown")) {
      // Only skip if there's no `value` attribute to verify against
      return typeof element.value !== "string";
    }
    return false;
  }
}
