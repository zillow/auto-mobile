package com.zillow.automobile.slides

import com.zillow.automobile.junit.AutoMobilePlan
import com.zillow.automobile.junit.AutoMobileRunner
import com.zillow.automobile.junit.AutoMobileTest
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AutoMobileRunner::class)
class LiveDemoTest {

  @Test
  fun `Given we have a Clock app we should be able to set an alarm`() {

    // ab test or
    val result =
        AutoMobilePlan("test-plans/clock-set-alarm.yaml", { "username" to "jason@zillow.com" })
            .execute()

    assertTrue(result.success)
  }

  //
  //  @Test
  //  @AutoMobileTest(plan = "test-plans/zillow-testing.yaml")
  //  fun `Given Zillow has 3D homes we should be able to tour them`() {}

  //    @Test
  //    @AutoMobileTest(
  //      plan = "test-plans/zillow-3d-home-exploration.yaml"
  //    )
  //    fun `Zillow tour 3d home`() {
  //      // Traditional annotation-based approach
  //      // AI assistance disabled for this test
  //    }

  //  @Test
  //  @AutoMobileTest(plan = "test-plans/zillow-full-feature.yaml")
  //  fun `Zillow full feature test`() {
  //    // Traditional annotation-based approach
  //    // AI assistance disabled for this test
  //  }

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
                "test-plans/system-notification-youtube-music-play.yaml", { "slide" to "83" })
            .execute()

    assertTrue(result.success)
  }
}
