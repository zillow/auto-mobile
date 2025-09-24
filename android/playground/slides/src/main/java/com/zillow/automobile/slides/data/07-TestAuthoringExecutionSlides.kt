package com.zillow.automobile.slides.data

import com.zillow.automobile.slides.model.BulletPoint
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
        SlideContent.LargeText(title = "Live demo running Playground test"),
        SlideContent.BulletPoints(
            title = "Test Authoring Capabilities",
            points =
                listOf(
                    BulletPoint(text = "User credential handling"),
                    BulletPoint(text = "Experiment + Treatment support"),
                    BulletPoint(text = "Basic Kotlin DSL, high flexibility"))),
        SlideContent.CodeSample(
            title = "Environment Credentials Example",
            code =
                """
      @Test
      fun `given valid credentials, login should succeed`() {
          val result = AutoMobilePlan("test-plans/login.yaml", {
            "username" to "jason@zillow.com"
            "password" to "hunter2"
          }).execute()
          assertTrue(result.status)
      }
    """
                    .trimIndent(),
            language = "kotlin"),
        SlideContent.CodeSample(
            title = "Experiment Configuration Example",
            code =
                """
  @Test
  fun `given an excited audience, start the party`() {
    val result =
        AutoMobilePlan("test-plans/excited-audience.yaml") {
              Experiments.Mood.id to Experiments.Mood.Treatments.Party
            }
            .execute()

    assertTrue("Party mode is active", result.success)
  }
    """
                    .trimIndent(),
            language = "kotlin"),

        //  ---
        // name: complete-onboarding
        // description: Complete fake onboarding flow with experiment-specific behavior
        // parameters:
        //  experiment: ${experiment}
        //  environment: ${environment}
        //  user_email: ${user_email}
        //  skip_intro: ${skip_intro}
        //
        // steps:
        //  - tool: observe
        //    label: "Observe initial app state with ${experiment}"
    )
