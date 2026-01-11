export interface LocalizationSettingsResult {
  success: boolean;
  locale?: string | null;
  timeZone?: string | null;
  textDirection?: "ltr" | "rtl" | null;
  timeFormat?: "12" | "24" | null;
  calendarSystem?: string | null;
  error?: string;
}
