package com.zillow.automobile.slides.data

import com.zillow.automobile.slides.model.BulletPoint
import com.zillow.automobile.slides.model.PresentationEmoji
import com.zillow.automobile.slides.model.SlideContent

/**
 * Slides for Introduction to AutoMobile?
 */
fun getEarlySuccessSlides(): List<SlideContent> = listOf(

  SlideContent.LargeText(
    title = "Early Success & Demos"
  ),

  // TODO: demo slide, run clock test that returns to automobile
  SlideContent.Emoji(
    emoji = PresentationEmoji.CLOCK,
    caption = "Clock app set alarm demo"
  ),


  SlideContent.BulletPoints(
    title = "Quickly iterated to explore all of Zillow",
    points = listOf(
      BulletPoint(
        text = "Tons of different form fields and UX patterns"
      ),
      BulletPoint(
        text = "Edge cases in parsing active windows"
      ),
      BulletPoint(
        text = "Still need WebView support"
      ),
    )
  ),

  // TODO: demo slide, run Zillow test that returns to automobile
  SlideContent.Emoji(
    emoji = PresentationEmoji.HOME,
    caption = "Zillow 3D home navigation demo"
  ),

  SlideContent.Emoji(
    emoji = PresentationEmoji.GLOBE,
    caption = "Decided to pursue OSS"
  ),

)
