package dev.jasonpearson.automobile.ide.datasource

import dev.jasonpearson.automobile.ide.test.TestRun

interface TestDataSource {
    suspend fun getTestRuns(): Result<List<TestRun>>
}
