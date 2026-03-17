package dev.jasonpearson.automobile.sdk.logging

import org.junit.Test
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class CompiledLogFilterTest {

  @Test
  fun `matches when all criteria met`() {
    val filter = CompiledLogFilter(
      name = "http",
      tagPattern = Regex("OkHttp"),
      messagePattern = Regex("200"),
      minLevel = 4, // INFO
    )

    assertTrue(filter.matches("OkHttp", "HTTP 200 OK", 4))
    assertTrue(filter.matches("OkHttp", "HTTP 200 OK", 5)) // WARN > INFO
  }

  @Test
  fun `rejects when level too low`() {
    val filter = CompiledLogFilter(
      name = "errors",
      minLevel = 6, // ERROR
    )

    assertFalse(filter.matches("Tag", "msg", 3)) // DEBUG < ERROR
    assertFalse(filter.matches("Tag", "msg", 5)) // WARN < ERROR
    assertTrue(filter.matches("Tag", "msg", 6))   // ERROR == ERROR
    assertTrue(filter.matches("Tag", "msg", 7))   // ASSERT > ERROR
  }

  @Test
  fun `rejects when tag does not match`() {
    val filter = CompiledLogFilter(
      name = "http",
      tagPattern = Regex("^OkHttp$"),
      minLevel = 2,
    )

    assertTrue(filter.matches("OkHttp", "any message", 4))
    assertFalse(filter.matches("Retrofit", "any message", 4))
  }

  @Test
  fun `rejects when message does not match`() {
    val filter = CompiledLogFilter(
      name = "errors",
      messagePattern = Regex("error|exception", RegexOption.IGNORE_CASE),
      minLevel = 2,
    )

    assertTrue(filter.matches("Tag", "An Error occurred", 4))
    assertTrue(filter.matches("Tag", "NullPointerException", 4))
    assertFalse(filter.matches("Tag", "Request completed", 4))
  }

  @Test
  fun `matches with no tag or message pattern (level only)`() {
    val filter = CompiledLogFilter(
      name = "all-warn",
      minLevel = 5, // WARN
    )

    assertTrue(filter.matches("AnyTag", "Any message", 5))
    assertTrue(filter.matches("AnyTag", "Any message", 6))
    assertFalse(filter.matches("AnyTag", "Any message", 4))
  }

  @Test
  fun `matches with containsMatchIn (partial match)`() {
    val filter = CompiledLogFilter(
      name = "coil",
      tagPattern = Regex("Coil|OkHttp|ExoPlayer"),
      minLevel = 2,
    )

    assertTrue(filter.matches("CoilImageLoader", "loading image", 4))
    assertTrue(filter.matches("OkHttpClient", "HTTP 200", 4))
    assertTrue(filter.matches("ExoPlayerImpl", "buffering", 4))
    assertFalse(filter.matches("MyActivity", "started", 4))
  }
}
