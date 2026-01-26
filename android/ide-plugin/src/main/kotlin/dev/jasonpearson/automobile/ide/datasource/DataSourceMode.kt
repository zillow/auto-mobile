package dev.jasonpearson.automobile.ide.datasource

/**
 * Data source mode for switching between fake and real implementations.
 */
enum class DataSourceMode {
    /**
     * Use fake/mock data sources for UI development and testing.
     */
    Fake,

    /**
     * Use real data sources that connect to MCP.
     */
    Real,
}
