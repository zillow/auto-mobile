export interface SetTimeZoneResult {
  success: boolean;
  zoneId: string;
  previousZoneId?: string | null;
  error?: string;
}
