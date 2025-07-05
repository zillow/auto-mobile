export interface HomeScreenResult {
    success: boolean;
    navigationMethod?: "gesture" | "hardware" | "element";
    error?: string;
    observation?: any;
}
