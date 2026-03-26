package dev.jasonpearson.automobile.desktop.core.datasource

import dev.jasonpearson.automobile.desktop.core.performance.PerformanceRun

interface PerformanceDataSource {
    suspend fun getPerformanceRun(): Result<PerformanceRun>
}
