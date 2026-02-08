import type { TextMatcher } from "../../utils/interfaces/TextMatcher";

/**
 * Handles text matching algorithms for element search
 */
export class DefaultTextMatcher implements TextMatcher {
  /**
   * Perform partial text matching between two strings (substring containment)
   * @param text1 - First string to compare
   * @param text2 - Second string to compare
   * @param caseSensitive - Whether to use case-sensitive matching
   * @returns True if either string contains the other
   */
  partialTextMatch(text1: string, text2: string, caseSensitive: boolean = false): boolean {
    if (!text1 || !text2) {
      return false;
    }

    const str1 = caseSensitive ? text1 : text1.toLowerCase();
    const str2 = caseSensitive ? text2 : text2.toLowerCase();

    // Check if either string contains the other
    return str1.includes(str2) || str2.includes(str1);
  }

  /**
   * Create a text matching function based on options
   * @param text - Text to search for
   * @param partialMatch - Whether to use partial matching (substring containment)
   * @param caseSensitive - Whether to use case-sensitive matching
   * @returns A function that tests if an input string matches the search text
   */
  createTextMatcher(text: string, partialMatch: boolean = true, caseSensitive: boolean = false): (input?: string) => boolean {
    if (!text) {return () => false;}

    const searchText = caseSensitive ? text : text.toLowerCase();

    return (input?: string): boolean => {
      if (!input) {return false;}

      const targetText = caseSensitive ? input : input.toLowerCase();

      return partialMatch
        ? targetText.includes(searchText)
        : targetText === searchText;
    };
  }
}
