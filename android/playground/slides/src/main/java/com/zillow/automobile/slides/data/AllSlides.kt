package com.zillow.automobile.slides.data

import com.zillow.automobile.slides.model.SlideContent

/**
 * Combined slides data for the complete AutoMobile presentation. Combines all individual slide
 * sections into one comprehensive presentation.
 */
fun getAllSlides(): List<SlideContent> =
    getIntroductionSlides() +
        getOriginSlides() +
        getEarlySuccessSlides() +
        listOf(SlideContent.LargeText(title = "Optimizations & Automations")) +
        getViewHierarchyCacheSlides() +
        getMcpLearningsSlides() +
        getSourceMappingSlides() +
        getTestAuthoringExecutionSlides() +
        getAutomaticTestAuthoringSlides() +
        getDevWorkflowAssistSlides() +
        getVisionSlides()
