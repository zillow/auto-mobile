package dev.jasonpearson.automobile.desktop.core.datasource

import dev.jasonpearson.automobile.desktop.core.performance.PerformanceMockData
import kotlinx.coroutines.delay

/**
 * Fake performance data source returning mock data for UI development.
 */
class FakePerformanceDataSource : PerformanceDataSource {
    override suspend fun getPerformanceRun(): Result<dev.jasonpearson.automobile.desktop.core.performance.PerformanceRun> {
        // Simulate network delay
        delay(100)

        return Result.Success(PerformanceMockData.currentRun)
    }
}
