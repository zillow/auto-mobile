package com.zillow.automobile.slides

import com.zillow.automobile.junit.AutoMobilePlan
import com.zillow.automobile.junit.AutoMobileRunner
import com.zillow.automobile.junit.AutoMobileTest
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AutoMobileRunner::class)
class DroidconLiveDemoTest {

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

  @Test
  @AutoMobileTest(plan = "test-plans/zillow-3d-home-exploration.yaml")
  fun `Zillow tour 3d home`() {
    // Traditional annotation-based approach
    // AI assistance disabled for this test
  }

  @Test
  @AutoMobileTest(plan = "test-plans/auto-mobile-playground.yaml")
  fun `AutoMobile playground`() {}

  @Test @AutoMobileTest(plan = "test-plans/bluesky-ready-to-go.yaml") fun `Ready for the talk`() {}

  @Test
  @AutoMobileTest(plan = "test-plans/bluesky-announcement.yaml")
  fun `Announce AutoMobile is OSS on GitHub`() {}

  @Test
  @AutoMobileTest(plan = "test-plans/system-notification-youtube-music-play.yaml")
  fun `Victory Fanfare`() {}
}
