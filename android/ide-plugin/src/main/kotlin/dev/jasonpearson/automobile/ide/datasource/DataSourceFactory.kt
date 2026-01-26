package dev.jasonpearson.automobile.ide.datasource

import dev.jasonpearson.automobile.ide.daemon.AutoMobileClient

/**
 * Factory for creating data source implementations based on the current mode.
 * When mode is Real, an optional clientProvider can be supplied to enable MCP data fetching.
 */
object DataSourceFactory {

    /**
     * Creates a navigation data source based on the specified mode.
     * @param mode The data source mode (Fake or Real)
     * @param clientProvider Optional function to provide an AutoMobileClient for MCP access
     * @param appId Optional app ID to filter the navigation graph by specific app
     */
    fun createNavigationDataSource(
        mode: DataSourceMode,
        clientProvider: (() -> AutoMobileClient)? = null,
        appId: String? = null,
    ): NavigationDataSource {
        return when (mode) {
            DataSourceMode.Fake -> FakeNavigationDataSource()
            DataSourceMode.Real -> RealNavigationDataSource(clientProvider, appId)
        }
    }

    /**
     * Creates a test data source based on the specified mode.
     * @param mode The data source mode (Fake or Real)
     * @param clientProvider Optional function to provide an AutoMobileClient for MCP access
     */
    fun createTestDataSource(
        mode: DataSourceMode,
        clientProvider: (() -> AutoMobileClient)? = null,
    ): TestDataSource {
        return when (mode) {
            DataSourceMode.Fake -> FakeTestDataSource()
            DataSourceMode.Real -> RealTestDataSource(clientProvider)
        }
    }

    /**
     * Creates a performance data source based on the specified mode.
     * @param mode The data source mode (Fake or Real)
     * @param clientProvider Optional function to provide an AutoMobileClient for MCP access
     */
    fun createPerformanceDataSource(
        mode: DataSourceMode,
        clientProvider: (() -> AutoMobileClient)? = null,
    ): PerformanceDataSource {
        return when (mode) {
            DataSourceMode.Fake -> FakePerformanceDataSource()
            DataSourceMode.Real -> RealPerformanceDataSource(clientProvider)
        }
    }

    /**
     * Creates a storage data source based on the specified mode.
     * Note: Storage data source does not yet have MCP support.
     */
    fun createStorageDataSource(mode: DataSourceMode): StorageDataSource {
        return when (mode) {
            DataSourceMode.Fake -> FakeStorageDataSource()
            DataSourceMode.Real -> RealStorageDataSource()
        }
    }

    /**
     * Creates a layout data source based on the specified mode.
     * @param mode The data source mode (Fake or Real)
     * @param clientProvider Optional function to provide an AutoMobileClient for MCP access
     */
    fun createLayoutDataSource(
        mode: DataSourceMode,
        clientProvider: (() -> AutoMobileClient)? = null,
    ): LayoutDataSource {
        return when (mode) {
            DataSourceMode.Fake -> FakeLayoutDataSource()
            DataSourceMode.Real -> RealLayoutDataSource(clientProvider)
        }
    }

    /**
     * Creates an app list data source based on the specified mode.
     * @param mode The data source mode (Fake or Real)
     * @param clientProvider Optional function to provide an AutoMobileClient for MCP access
     * @param deviceId The device ID to fetch apps for (required for Real mode)
     */
    fun createAppListDataSource(
        mode: DataSourceMode,
        clientProvider: (() -> AutoMobileClient)? = null,
        deviceId: String? = null,
    ): AppListDataSource {
        return when (mode) {
            DataSourceMode.Fake -> FakeAppListDataSource()
            DataSourceMode.Real -> RealAppListDataSource(clientProvider, deviceId)
        }
    }
}
