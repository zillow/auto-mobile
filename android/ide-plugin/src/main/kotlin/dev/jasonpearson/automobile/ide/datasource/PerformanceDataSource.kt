package dev.jasonpearson.automobile.ide.datasource

import dev.jasonpearson.automobile.ide.performance.PerformanceRun

interface PerformanceDataSource {
    suspend fun getPerformanceRun(): Result<PerformanceRun>
}
