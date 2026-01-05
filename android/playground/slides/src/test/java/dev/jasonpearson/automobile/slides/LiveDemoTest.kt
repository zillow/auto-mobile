package dev.jasonpearson.automobile.slides

import dev.jasonpearson.automobile.junit.AutoMobilePlan
import dev.jasonpearson.automobile.junit.AutoMobileRunner
import dev.jasonpearson.automobile.junit.AutoMobileTest
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith

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
        AutoMobilePlan("test-plans/auto-mobile-playground.yaml", { "slide" to "46" }).execute()

    assertTrue(result.success)
  }

  @Test
  fun `AutoMobile restart slide`() {

    val result =
        AutoMobilePlan("test-plans/auto-mobile-restart-slide.yaml", { "slide" to "81" }).execute()

    assertTrue(result.success)
  }

  @Test @AutoMobileTest(plan = "test-plans/bluesky-ready-to-go.yaml") fun `Ready for the talk`() {}

  @Test
  fun `Announce AutoMobile is OSS on GitHub`() {

    val result =
        AutoMobilePlan("test-plans/bluesky-announcement.yaml", { "slide" to "83" }).execute()

    assertTrue(result.success)
  }

  @Test
  fun `Victory Fanfare`() {

    val result =
        AutoMobilePlan(
                "test-plans/system-notification-youtube-music-play.yaml",
                { "slide" to "83" },
            )
            .execute()

    assertTrue(result.success)
  }
}
