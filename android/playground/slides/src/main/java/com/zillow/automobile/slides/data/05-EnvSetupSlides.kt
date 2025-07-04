package com.zillow.automobile.slides.data

import com.zillow.automobile.slides.model.BulletPoint
import com.zillow.automobile.slides.model.PresentationEmoji
import com.zillow.automobile.slides.model.SlideContent

fun getEnvSetupSlides(): List<SlideContent> =
    listOf(
        SlideContent.LargeText(title = "Automatic Env Setup"),

        // request action
        // action attempts to find current device session
        // if no session look for active devices
        // if no active devices look for avds
        // if no avds create one that matches project configuration latest target API
        SlideContent.MermaidDiagram(
            title = "Automatic Device Session",
            code =
                """
      flowchart LR
        A([Tool]) --> B{Find Session}
        B -->|"❌"| C{Find Active Device}
        B -->|"✅"| D([Device Session])
        C -->|"❌"| E{Find AVD}
        C -->|"✅"| D
        E -->|"❌"| F([Create AVD])
       F --> D

        classDef decision fill:#FF3300,stroke-width:0px,color:white;
        classDef logic fill:#525FE1,stroke-width:0px,color:white;
        classDef result stroke-width:0px;
        class A,G,I result;
        class B,D,E,H logic;
        class C,F decision;
      """
                    .trimIndent()),
        SlideContent.Emoji(
            emoji = PresentationEmoji.LAPTOP,
            caption = "Automatic Android Platform Tool Installation"),
        SlideContent.Emoji(
            emoji = PresentationEmoji.GLOBE,
            caption = "Automatic Android Cmdline Tool Installation"),
        SlideContent.BulletPoints(
            title = "Did I get carried away?",
            points =
                listOf(
                    BulletPoint(text = "Yes"),
                    BulletPoint(text = "But now anyone can use it"),
                )),
    )
