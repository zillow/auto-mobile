export interface Set24HourFormatResult {
  success: boolean;
  enabled: boolean;
  previousFormat?: "12" | "24" | null;
  error?: string;
}
