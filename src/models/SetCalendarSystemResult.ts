export interface SetCalendarSystemResult {
  success: boolean;
  calendarSystem: string;
  previousCalendarSystem?: string | null;
  error?: string;
}
