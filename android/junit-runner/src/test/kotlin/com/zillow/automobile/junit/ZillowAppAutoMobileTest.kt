package com.zillow.automobile.junit

import org.junit.Test
import org.junit.runner.RunWith

/** Example test class showing usage of AutoMobile JUnitRunner */
@RunWith(AutoMobileRunner::class)
class ZillowAppAutoMobileTest {

  @Test @AutoMobileTest(plan = "test-plans/launch-zillow-app.yaml") fun `launch app`() {}

  //  @Test
  //  @AutoMobileTest(
  //    plan = "test-plans/explore-seattle-homes-comprehensive.yaml"
  //  )
  //  fun `explore app`() {}

}
