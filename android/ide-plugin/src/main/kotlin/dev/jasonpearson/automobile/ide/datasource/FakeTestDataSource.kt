package dev.jasonpearson.automobile.ide.datasource

import dev.jasonpearson.automobile.ide.test.TestMockData
import kotlinx.coroutines.delay

/**
 * Fake test data source returning mock data for UI development.
 */
class FakeTestDataSource : TestDataSource {
    override suspend fun getTestRuns(): Result<List<dev.jasonpearson.automobile.ide.test.TestRun>> {
        // Simulate network delay
        delay(100)

        return Result.Success(TestMockData.recentRuns)
    }
}
