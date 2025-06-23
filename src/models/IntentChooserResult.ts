export interface IntentChooserResult {
    success: boolean;
    detected: boolean;
    action?: "always" | "just_once" | "custom";
    appSelected?: string;
    error?: string;
    observation?: any;
}
