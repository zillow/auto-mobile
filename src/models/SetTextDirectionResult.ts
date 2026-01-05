export interface SetTextDirectionResult {
  success: boolean;
  rtl: boolean;
  previousRtl?: boolean | null;
  settings?: Array<"debug.force_rtl" | "force_rtl">;
  broadcasted?: boolean;
  error?: string;
}
