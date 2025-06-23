package com.zillow.automobile.slides.components

import org.junit.Assert.assertTrue
import org.junit.Test

/** Tests for CodeSampleSlideItem highlighting functionality. */
class CodeSampleSlideItemTest {

  @Test
  fun `processCodeWithHighlighting should highlight matching lines`() {
    val code =
        """
      keepClearAreas: restricted=[], unrestricted=[]
      mPrepareSyncSeqId=0

      imeLayeringTarget in display# 0 Window{ea58714 u0 com.zillow.automobile.playground/com.zillow.automobile.playground.MainActivity}
      imeInputTarget in display# 0 Window{ea58714 u0 com.zillow.automobile.playground/com.zillow.automobile.playground.MainActivity}
      imeControlTarget in display# 0 Window{ea58714 u0 com.zillow.automobile.playground/com.zillow.automobile.playground.MainActivity}
      Minimum task size of display#0 220  mBlurEnabled=true
    """
            .trimIndent()

    val highlight =
        """
      imeLayeringTarget in display# 0 Window{ea58714 u0 com.zillow.automobile.playground/com.zillow.automobile.playground.MainActivity}
      imeInputTarget in display# 0 Window{ea58714 u0 com.zillow.automobile.playground/com.zillow.automobile.playground.MainActivity}
      imeControlTarget in display# 0 Window{ea58714 u0 com.zillow.automobile.playground/com.zillow.automobile.playground.MainActivity}
    """
            .trimIndent()

    val result = processCodeWithHighlighting(code, highlight, true)

    // Verify that highlighted lines contain the highlighted-line class
    assertTrue("Result should contain highlighted-line spans", result.contains("highlighted-line"))
    assertTrue("Result should contain dimmed-line spans", result.contains("dimmed-line"))
  }

  @Test
  fun `processCodeWithHighlighting should handle empty highlight`() {
    val code = "fun main() { println(\"Hello\") }"
    val highlight = ""

    val result = processCodeWithHighlighting(code, highlight, false)

    // When highlight is empty, all lines should be dimmed
    assertTrue("Should contain only dimmed-line spans", result.contains("dimmed-line"))
    assertTrue("Should not contain highlighted-line spans", !result.contains("highlighted-line"))
  }

  @Test
  fun `processCodeWithHighlighting should escape HTML characters`() {
    val code = "<tag>content</tag>"
    val highlight = "content"

    val result = processCodeWithHighlighting(code, highlight, false)

    // HTML characters should be escaped
    assertTrue("Should escape < character", result.contains("&lt;"))
    assertTrue("Should escape > character", result.contains("&gt;"))
    assertTrue("Should not contain raw < character", !result.contains("<tag>"))
  }
}
