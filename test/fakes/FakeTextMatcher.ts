import type { TextMatcher } from "../../src/utils/interfaces/TextMatcher";

export class FakeTextMatcher implements TextMatcher {
  nextPartialResult: boolean = false;
  nextMatcherResult: boolean = false;

  partialTextMatch(_text1: string, _text2: string, _caseSensitive?: boolean): boolean {
    return this.nextPartialResult;
  }

  createTextMatcher(_text: string, _partialMatch?: boolean, _caseSensitive?: boolean): (input?: string) => boolean {
    const result = this.nextMatcherResult;
    return () => result;
  }
}
