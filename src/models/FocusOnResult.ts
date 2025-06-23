import { Element } from "./Element";
import { ObserveResult } from "./ObserveResult";

export interface FocusOnResult {
    success: boolean;
    elementId: string;
    element: Element;
    wasAlreadyFocused: boolean;
    focusChanged: boolean;
    focusVerified?: boolean;
    x: number;
    y: number;
    attempts?: number;
    observation?: ObserveResult;
}
