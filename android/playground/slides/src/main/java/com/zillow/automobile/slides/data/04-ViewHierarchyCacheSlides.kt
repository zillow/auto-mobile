package com.zillow.automobile.slides.data

import com.zillow.automobile.slides.model.PresentationEmoji
import com.zillow.automobile.slides.model.SlideContent

fun getViewHierarchyCacheSlides(): List<SlideContent> =
    listOf(
        SlideContent.Emoji(emoji = PresentationEmoji.SLOW, caption = "adb View Hierarchy is slow"),
        SlideContent.Emoji(emoji = PresentationEmoji.PICTURE, caption = "pHash + fuzzy matching"),
        SlideContent.MermaidDiagram(
            title = "View Hierarchy Cache System",
            code =
                """
flowchart LR
  A["Observe()"] --> B["Screenshot<br/>+dHash"];
  B --> C{"hash<br/>match?"};
  C -->|"✅"| D["pixelmatch"];
  C -->|"❌"| E["uiautomator dump"];
  D --> F{>99.8%?};
  F -->|"✅"| G["Return"];
  F -->|"❌"| E;
  E --> H["Cache"];
  H --> I["Return New Hierarchy"];
classDef decision fill:#FF3300,stroke-width:0px,color:white;
classDef logic fill:#525FE1,stroke-width:0px,color:white;
classDef result stroke-width:0px;
class A,G,I result;
class D,E,H logic;
class B,C,F decision;
        """
                    .trimIndent()),
        SlideContent.Emoji(
            emoji = PresentationEmoji.ROCKET, caption = "85% faster observations when cached"),
        SlideContent.Emoji(emoji = PresentationEmoji.LOOP, caption = "worked great for replay"),
        SlideContent.Emoji(
            emoji = PresentationEmoji.SLOW, caption = "but always slow on exploration"),
        SlideContent.Emoji(emoji = PresentationEmoji.LIGHTBULB, caption = "Accessibility Service"),
        SlideContent.MermaidDiagram(
            title = "View Hierarchy Cache System",
            code =
                """
flowchart LR
A["Observe()"] --> B{"installed?"};
B -->|"✅"| C{"running?"};
B -->|"❌"| E["caching system"];
C -->|"✅"| D["cat vh.json"];
C -->|"❌"| E["uiautomator dump"];
D --> I["Return"]
E --> I;
classDef decision fill:#FF3300,stroke-width:0px,color:white;
classDef logic fill:#525FE1,stroke-width:0px,color:white;
classDef result stroke-width:0px;
class A,G,I result;
class D,E,H logic;
class B,C,F decision;
        """
                    .trimIndent()),
        SlideContent.Emoji(emoji = PresentationEmoji.ROCKET, caption = "97.5% faster observations"),
    )
