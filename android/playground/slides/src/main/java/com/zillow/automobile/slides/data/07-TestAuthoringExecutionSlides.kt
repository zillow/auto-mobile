package com.zillow.automobile.slides.data

import com.zillow.automobile.slides.model.BulletPoint
import com.zillow.automobile.slides.model.PresentationEmoji
import com.zillow.automobile.slides.model.SlideContent

/** Slides for Introduction to AutoMobile? */
fun getTestAuthoringExecutionSlides(): List<SlideContent> =
    listOf(
        // - Test Authoring & Execution
        //      - yaml plan because
        //        - I want to support iOS in the same tool
        //        - easy to record/replay
        //      - JUnitRunner Android library
        //        - Live demo of running a test to run through the AutoMobile Playground app and
        // resume the slideshow
        //	    - User credentials & Experiments
        //	    - Code example of test with credentials
        //	    - Live demo of login in AutoMobile Playground
        //	    - Code example of experiment and treatment with credentials
        //	    - Live demo of control vs party mode in AutoMobile Playground
        SlideContent.LargeText(title = "Test Authoring & Execution"),
        SlideContent.CodeSample(
            title = "YAML Plan Sample",
            code =
                """
---
name: set-alarm-6-30am-demo-mode
description: Create 6:30 AM alarm in Clock app
steps:
  - tool: launchApp
    appId: com.google.android.deskclock
    forceCold: true
    clearPackageData: true

  - tool: tapOn
    text: "Alarm"

  - tool: tapOn
    id: "com.google.android.deskclock:id/fab"

  - tool: tapOn
    text: "6"

  - tool: tapOn
    text: "30"

  - tool: tapOn
    text: "OK"

    """
                    .trimIndent(),
            language = "yaml"),
        SlideContent.BulletPoints(
            title = "AutoMobile JUnitRunner",
            points =
                listOf(
                    BulletPoint(text = "Android library"),
                    BulletPoint(text = "JUnit4 prioritized with JUnit5 compatibility"),
                    BulletPoint(text = "Runs AutoMobile in CLI mode until failure"),
                    // TODO: Update when koog lands
                    BulletPoint(text = "koog integration for self healing (untested)"),
                )),
        SlideContent.Emoji(
            emoji = PresentationEmoji.PLAYGROUND,
            caption = "Demo: AutoMobile Playground",
        ),
    )
