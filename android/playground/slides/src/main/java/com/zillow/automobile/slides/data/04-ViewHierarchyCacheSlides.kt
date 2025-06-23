package com.zillow.automobile.slides.data

import com.zillow.automobile.slides.model.PresentationEmoji
import com.zillow.automobile.slides.model.SlideContent

fun getViewHierarchyCacheSlides(): List<SlideContent> = listOf(

  SlideContent.Emoji(
      emoji = PresentationEmoji.SLOW,
      caption = "adb View Hierarchy is slow"
    ),

    SlideContent.Emoji(
      emoji = PresentationEmoji.PICTURE,
      caption = "pHash + fuzzy matching"
    ),

    // TODO: fill in
    SlideContent.MermaidDiagram(
      title = "View Hierarchy Cache System",
      code = """
flowchart LR
    A["observe() call"] --> B["Take Screenshot &<br/>Calculate dHash"];
    B --> C{"Compare to<br/>cached hashes"};
    C -->|"✅ Candidates"| D["pixelmatch comparison"];
    C -->|"❌ No Candidates"| E["`uiautomator dump`"];
    D --> F{>99.8% similar?};
    F -->|"✅ Yes"| G["Return Cached Hierarchy"];
    F -->|"❌ No"| E;
    E --> H["Cache Screenshot & Hierarchy"];
    H --> I["Return New Hierarchy"];
    classDef decision fill:#b8860b,stroke-width:0px;
    classDef logic fill:#004baa,stroke-width:0px,color:white;
    classDef result fill:#1a1a1a,stroke-width:0px;
    class A,G,I result;
    class B,D,E,H logic;
    class C,F decision;
        """.trimIndent()
    ),

    SlideContent.Emoji(
      emoji = PresentationEmoji.ROCKET,
      caption = "85% faster observations"
    ),
  )
