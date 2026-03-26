package dev.jasonpearson.automobile.desktop.core.datasource

import dev.jasonpearson.automobile.desktop.core.daemon.AutoMobileClient
import dev.jasonpearson.automobile.desktop.core.daemon.FailuresStreamClient
import dev.jasonpearson.automobile.desktop.core.failures.CompositeFailuresDataSource
import dev.jasonpearson.automobile.desktop.core.failures.FailuresDataSource
import dev.jasonpearson.automobile.desktop.core.failures.FakeFailuresDataSource
import dev.jasonpearson.automobile.desktop.core.failures.McpFailuresDataSource
import dev.jasonpearson.automobile.desktop.core.failures.StreamingFailuresDataSource
import dev.jasonpearson.automobile.desktop.core.storage.StoragePlatform

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
     * @param mode The data source mode (Fake or Real)
     * @param clientProvider Optional function to provide an AutoMobileClient for MCP access
     * @param deviceId The device ID to fetch storage data for (required for Real mode)
     * @param packageName The package name of the app to inspect (required for Real mode)
     * @param platform The storage platform (Android or iOS)
     */
    fun createStorageDataSource(
        mode: DataSourceMode,
        clientProvider: (() -> AutoMobileClient)? = null,
        deviceId: String? = null,
        packageName: String? = null,
        platform: StoragePlatform = StoragePlatform.Android,
    ): StorageDataSource {
        return when (mode) {
            DataSourceMode.Fake -> FakeStorageDataSource()
            DataSourceMode.Real -> RealStorageDataSource(clientProvider, deviceId, packageName, platform)
        }
    }

    /**
     * Creates a layout data source based on the specified mode.
     * @param mode The data source mode (Fake or Real)
     * @param clientProvider Optional function to provide an AutoMobileClient for MCP access
     * @param platform The device platform ("android" or "ios")
     */
    fun createLayoutDataSource(
        mode: DataSourceMode,
        clientProvider: (() -> AutoMobileClient)? = null,
        platform: String = "android",
    ): LayoutDataSource {
        return when (mode) {
            DataSourceMode.Fake -> FakeLayoutDataSource()
            DataSourceMode.Real -> RealLayoutDataSource(clientProvider, platform)
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

    /**
     * Creates a failures data source based on the specified mode.
     * @param mode The data source mode (Fake or Real)
     * @param clientProvider Optional function to provide an AutoMobileClient for MCP access
     * @param streamClientProvider Optional function to provide a FailuresStreamClient for streaming
     */
    fun createFailuresDataSource(
        mode: DataSourceMode,
        clientProvider: (() -> AutoMobileClient)? = null,
        streamClientProvider: (() -> FailuresStreamClient)? = null,
    ): FailuresDataSource {
        return when (mode) {
            DataSourceMode.Fake -> FakeFailuresDataSource()
            DataSourceMode.Real -> CompositeFailuresDataSource(
                mcpDataSource = clientProvider?.let { McpFailuresDataSource(it) },
                streamingDataSource = streamClientProvider?.let { StreamingFailuresDataSource(it()) },
            )
        }
    }
}
