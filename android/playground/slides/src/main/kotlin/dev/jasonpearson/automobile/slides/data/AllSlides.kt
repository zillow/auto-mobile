package dev.jasonpearson.automobile.slides.data

import dev.jasonpearson.automobile.slides.model.SlideContent

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
        getDevWorkflowAssistSlides() +
        getVisionSlides()
