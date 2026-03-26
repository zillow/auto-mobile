package dev.jasonpearson.automobile.slides

import dev.jasonpearson.automobile.junit.AutoMobilePlan
import dev.jasonpearson.automobile.junit.AutoMobileRunner
import org.junit.Assert.assertTrue
import org.junit.Ignore
import org.junit.Test
import org.junit.runner.RunWith

@Ignore("Live demo tests - require connected device and specific apps installed")
@RunWith(AutoMobileRunner::class)
class LiveDemoTest {

  @Test
  fun `Given we have a Clock app we should be able to set an alarm`() {

    // ab test or
    val result = AutoMobilePlan("test-plans/clock-set-alarm.yaml").execute()

    assertTrue(result.success)
  }

  @Test
  fun `AutoMobile playground`() {

    val result =
      AutoMobilePlan("test-plans/auto-mobile-playground.yaml").execute()

    assertTrue(result.success)
  }

  @Ignore
  @Test
  fun `Bug Reproduction Demo`() {

    val result =
      AutoMobilePlan("test-plans/bug-repro.yaml").execute()

    assertTrue(result.success)
  }

  @Test
  fun `Browse YouTube`() {

    val result =
      AutoMobilePlan("test-plans/youtube-search.yaml").execute()

    assertTrue(result.success)
  }

  @Test
  fun `Browse Google Maps`() {

    val result =
      AutoMobilePlan("test-plans/google-maps.yaml").execute()

    assertTrue(result.success)
  }

  @Test
  fun `Explore Camera App`() {

    val result =
      AutoMobilePlan("test-plans/camera-app.yaml").execute()

    assertTrue(result.success)
  }

  @Ignore
  @Test
  fun `AutoMobile restart slide`() {

    val result =
      AutoMobilePlan("test-plans/auto-mobile-restart-slide.yaml", { "slide" to "81" }).execute()

    assertTrue(result.success)
  }

  @Ignore
  @Test
  fun `Announce AutoMobile is OSS on GitHub`() {

    val result =
      AutoMobilePlan("test-plans/bluesky-announcement.yaml", { "slide" to "83" }).execute()

    assertTrue(result.success)
  }
}
