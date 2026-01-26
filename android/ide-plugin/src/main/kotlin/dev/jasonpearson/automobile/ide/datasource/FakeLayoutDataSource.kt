package dev.jasonpearson.automobile.ide.datasource

import dev.jasonpearson.automobile.ide.layout.LayoutInspectorMockData
import kotlinx.coroutines.delay

/**
 * Fake layout data source returning mock data for UI development.
 */
class FakeLayoutDataSource : LayoutDataSource {
    override suspend fun getViewHierarchy(): Result<dev.jasonpearson.automobile.ide.layout.UIElementInfo> {
        // Simulate network delay
        delay(100)

        return Result.Success(LayoutInspectorMockData.mockHierarchy)
    }

    override suspend fun getObservation(): Result<ObservationData> {
        // Simulate network delay
        delay(100)

        return Result.Success(
            ObservationData(
                hierarchy = LayoutInspectorMockData.mockHierarchy,
                screenshotData = null, // No mock screenshot
                screenWidth = 1080,
                screenHeight = 2340,
                timestamp = System.currentTimeMillis(),
            )
        )
    }
}
