export interface HomeScreenResult {
    success: boolean;
    navigationMethod?: "gesture" | "hardware" | "element";
    cached?: boolean;
    error?: string;
    observation?: any;
}
