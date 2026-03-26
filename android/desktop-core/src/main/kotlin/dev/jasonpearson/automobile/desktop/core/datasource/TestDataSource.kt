package dev.jasonpearson.automobile.desktop.core.datasource

import dev.jasonpearson.automobile.desktop.core.test.TestRun

interface TestDataSource {
    suspend fun getTestRuns(): Result<List<TestRun>>
}
