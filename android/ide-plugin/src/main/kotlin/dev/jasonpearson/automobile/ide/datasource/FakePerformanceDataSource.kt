package dev.jasonpearson.automobile.ide.datasource

import dev.jasonpearson.automobile.ide.performance.PerformanceMockData
import kotlinx.coroutines.delay

/**
 * Fake performance data source returning mock data for UI development.
 */
class FakePerformanceDataSource : PerformanceDataSource {
    override suspend fun getPerformanceRun(): Result<dev.jasonpearson.automobile.ide.performance.PerformanceRun> {
        // Simulate network delay
        delay(100)

        return Result.Success(PerformanceMockData.currentRun)
    }
}
