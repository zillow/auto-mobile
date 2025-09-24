package com.zillow.automobile.slides.data

import com.zillow.automobile.slides.model.PresentationEmoji
import com.zillow.automobile.slides.model.SlideContent

fun getSourceMappingSlides(): List<SlideContent> =
    listOf(
        // - Source mapping
        //      - Mention the inspiration
        //      - Find the activity
        //      - Find the fragment
        //      - Find the composable
        //      - WebView / ReactNative support is possible, after
        //      - Configurable by looking at
        //        - root common module of plurality of composables (default)
        //        - the plurality of composables
        //        - ignore composables and just goto activity/fragment
        //        - application module
        SlideContent.LargeText(title = "Source Mapping"),
        SlideContent.Emoji(
            emoji = PresentationEmoji.LIGHTBULB, caption = "React Dev Tools inspired"),
        SlideContent.Emoji(
            emoji = PresentationEmoji.WINDOWS, caption = "adb shell dumpsys window windows"),
        SlideContent.CodeSample(
            code =
                """
    keepClearAreas: restricted=[], unrestricted=[]
    mPrepareSyncSeqId=0

  mGlobalConfiguration={1.0 310mcc260mnc [en_US] ldltr sw448dp w997dp h448dp 360dpi nrml long hdr widecg land finger -keyb/v/h -nav/h winConfig={ mBounds=Rect(0, 0 - 2244, 1008) mAppBounds=Rect(0, 0 - 2244, 1008) mMaxBounds=Rect(0, 0 - 2244, 1008) mDisplayRotation=ROTATION_90 mWindowingMode=fullscreen mActivityType=undefined mAlwaysOnTop=undefined mRotation=ROTATION_90} s.6257 fontWeightAdjustment=0}
  mHasPermanentDpad=false
  mTopFocusedDisplayId=0
  imeLayeringTarget in display# 0 Window{ea58714 u0 com.zillow.automobile.playground/com.zillow.automobile.playground.MainActivity}
  imeInputTarget in display# 0 Window{ea58714 u0 com.zillow.automobile.playground/com.zillow.automobile.playground.MainActivity}
  imeControlTarget in display# 0 Window{ea58714 u0 com.zillow.automobile.playground/com.zillow.automobile.playground.MainActivity}
  Minimum task size of display#0 220  mBlurEnabled=true
  mLastDisplayFreezeDuration=0 due to new-config
  mDisableSecureWindows=false
 mHighResSnapshotScale=0.8
 mSnapshotEnabled=true
 SnapshotCache Task
 """
                    .trimIndent(),
            language = "shell"),
        SlideContent.LargeText(title = "Find the activity with exact package"),
        SlideContent.LargeText(title = "Find the fragment, approximate package"),
        SlideContent.LargeText(title = "Find the Composables via string associations"),
        SlideContent.Emoji(emoji = PresentationEmoji.RUST, caption = "ripgrep is our friend"),
    )
