import { ElementBounds } from "../models/ElementBounds";

export function getScreenBounds(
  screenSize: { width: number; height: number },
  systemInsets?: { top: number; right: number; bottom: number; left: number } | null,
  includeSystemInsets?: boolean
): ElementBounds {
  const insets = systemInsets || { top: 0, right: 0, bottom: 0, left: 0 };
  if (includeSystemInsets) {
    return {
      left: 0,
      top: 0,
      right: screenSize.width,
      bottom: screenSize.height
    };
  }

  return {
    left: insets.left,
    top: insets.top,
    right: screenSize.width - insets.right,
    bottom: screenSize.height - insets.bottom
  };
}
