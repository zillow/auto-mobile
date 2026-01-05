export interface SetLocaleResult {
  success: boolean;
  languageTag: string;
  previousLanguageTag?: string | null;
  method?: string;
  broadcasted?: boolean;
  error?: string;
}
