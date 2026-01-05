export interface GetCalendarSystemResult {
  success: boolean;
  calendarSystem?: string | null;
  locale?: string | null;
  source?: "settings.calendar_type" | "locale" | "default" | "unknown";
  error?: string;
}
