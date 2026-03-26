package dev.jasonpearson.automobile.desktop.core.datasource

import dev.jasonpearson.automobile.desktop.core.test.TestMockData
import kotlinx.coroutines.delay

/**
 * Fake test data source returning mock data for UI development.
 */
class FakeTestDataSource : TestDataSource {
    override suspend fun getTestRuns(): Result<List<dev.jasonpearson.automobile.desktop.core.test.TestRun>> {
        // Simulate network delay
        delay(100)

        return Result.Success(TestMockData.recentRuns)
    }
}
