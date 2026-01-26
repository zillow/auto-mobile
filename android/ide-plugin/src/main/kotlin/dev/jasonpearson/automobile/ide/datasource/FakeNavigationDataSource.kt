package dev.jasonpearson.automobile.ide.datasource

import dev.jasonpearson.automobile.ide.navigation.NavigationMockData
import kotlinx.coroutines.delay

/**
 * Fake navigation data source returning mock data for UI development.
 */
class FakeNavigationDataSource : NavigationDataSource {
    override suspend fun getNavigationGraph(): Result<NavigationGraph> {
        // Simulate network delay
        delay(100)

        return Result.Success(
            NavigationGraph(
                screens = NavigationMockData.screens,
                transitions = NavigationMockData.transitions,
            )
        )
    }
}
