export interface TextMatcher {
  partialTextMatch(text1: string, text2: string, caseSensitive?: boolean): boolean;
  createTextMatcher(text: string, partialMatch?: boolean, caseSensitive?: boolean): (input?: string) => boolean;
}
