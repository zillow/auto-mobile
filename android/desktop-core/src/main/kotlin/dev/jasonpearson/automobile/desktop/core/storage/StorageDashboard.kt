package dev.jasonpearson.automobile.desktop.core.storage

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.pointer.PointerIcon
import androidx.compose.ui.input.pointer.pointerHoverIcon
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import dev.jasonpearson.automobile.desktop.core.logging.LoggerFactory
import dev.jasonpearson.automobile.desktop.core.daemon.AutoMobileClient
import dev.jasonpearson.automobile.desktop.core.datasource.DataSourceMode
import dev.jasonpearson.automobile.desktop.core.datasource.Result
import dev.jasonpearson.automobile.desktop.core.datasource.StorageDataSource
import dev.jasonpearson.automobile.desktop.core.theme.SharedTheme

private val LOG = LoggerFactory.getLogger("StorageDashboard")

/**
 * Storage tab options.
 */
enum class StorageTab(val title: String, val icon: String) {
    Database("Databases", "\uD83D\uDDC4"), // File cabinet
    KeyValue("Key-Value", "\uD83D\uDD11"), // Key
}

/**
 * Main Storage Dashboard with Database and Key-Value tabs.
 */
@Composable
fun StorageDashboard(
    modifier: Modifier = Modifier,
    dataSourceMode: DataSourceMode = DataSourceMode.Fake,
    clientProvider: (() -> AutoMobileClient)? = null,
    deviceId: String? = null,
    packageName: String? = null,
    platform: StoragePlatform = StoragePlatform.Android,
) {
    val colors = SharedTheme.globalColors
    var selectedTab by remember { mutableStateOf(StorageTab.Database) }

    // Fetch storage data from data source
    var dataSource by remember { mutableStateOf<StorageDataSource?>(null) }
    var databases by remember { mutableStateOf<List<DatabaseInfo>>(emptyList()) }
    var keyValueFiles by remember { mutableStateOf<List<KeyValueFile>>(emptyList()) }
    var isLoading by remember { mutableStateOf(true) }
    var error by remember { mutableStateOf<String?>(null) }

    LaunchedEffect(dataSourceMode, clientProvider, deviceId, packageName) {
        LOG.info("StorageDashboard LaunchedEffect: mode=$dataSourceMode, clientProvider=${if (clientProvider != null) "present" else "null"}, deviceId=$deviceId, packageName=$packageName")
        isLoading = true
        error = null
        kotlinx.coroutines.withContext(kotlinx.coroutines.Dispatchers.IO) {
            try {
                val newDataSource = dev.jasonpearson.automobile.desktop.core.datasource.DataSourceFactory.createStorageDataSource(
                    dataSourceMode,
                    clientProvider,
                    deviceId,
                    packageName,
                    platform
                )
                dataSource = newDataSource
                LOG.info("StorageDashboard: Created data source: ${newDataSource::class.simpleName}")

                // Fetch databases
                when (val result = newDataSource.getDatabases()) {
                    is Result.Success -> {
                        LOG.info("StorageDashboard: getDatabases success, count=${result.data.size}")
                        databases = result.data
                    }
                    is Result.Error -> {
                        LOG.warn("StorageDashboard: getDatabases error: ${result.message}")
                        error = result.message
                    }
                    is Result.Loading -> {
                        // Keep loading state
                    }
                }

                // Fetch key-value files
                LOG.info("StorageDashboard: Calling getKeyValueFiles...")
                when (val result = newDataSource.getKeyValueFiles()) {
                    is Result.Success -> {
                        LOG.info("StorageDashboard: getKeyValueFiles success, count=${result.data.size}")
                        result.data.forEach { file ->
                            LOG.info("StorageDashboard:   File: ${file.name}, entries=${file.entries.size}")
                        }
                        keyValueFiles = result.data
                        isLoading = false
                    }
                    is Result.Error -> {
                        LOG.warn("StorageDashboard: getKeyValueFiles error: ${result.message}")
                        if (error == null) error = result.message
                        isLoading = false
                    }
                    is Result.Loading -> {
                        // Keep loading state
                    }
                }
            } catch (e: Exception) {
                LOG.error("StorageDashboard: Exception during data fetch", e)
                error = e.message ?: "Unknown error"
                isLoading = false
            }
        }
    }

    val onFetchTableData: (suspend (String, String) -> QueryResult)? = remember(dataSource) {
        val ds = dataSource ?: return@remember null
        val callback: suspend (String, String) -> QueryResult = { databasePath, table ->
            when (val r = ds.getTableData(databasePath, table)) {
                is Result.Success -> r.data
                is Result.Error -> QueryResult(emptyList(), emptyList(), 0, 0, error = r.message)
                else -> QueryResult(emptyList(), emptyList(), 0, 0, error = "Failed to load data")
            }
        }
        callback
    }

    val onExecuteSQL: (suspend (String, String) -> QueryResult)? = remember(dataSource) {
        val ds = dataSource ?: return@remember null
        val callback: suspend (String, String) -> QueryResult = { databasePath, query ->
            when (val r = ds.executeSQL(databasePath, query)) {
                is Result.Success -> r.data
                is Result.Error -> QueryResult(emptyList(), emptyList(), 0, 0, error = r.message)
                else -> QueryResult(emptyList(), emptyList(), 0, 0, error = "Failed to execute query")
            }
        }
        callback
    }

    Column(modifier = modifier.fillMaxSize()) {
        // Tab bar
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .background(colors.text.normal.copy(alpha = 0.03f))
                .padding(horizontal = 8.dp, vertical = 6.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            StorageTab.entries.forEach { tab ->
                val isSelected = tab == selectedTab

                Row(
                    modifier = Modifier
                        .clip(RoundedCornerShape(6.dp))
                        .background(
                            if (isSelected) colors.text.normal.copy(alpha = 0.1f)
                            else Color.Transparent
                        )
                        .clickable { selectedTab = tab }
                        .pointerHoverIcon(PointerIcon.Hand)
                        .padding(horizontal = 14.dp, vertical = 8.dp),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(
                        tab.icon,
                        fontSize = 14.sp,
                    )
                    Text(
                        tab.title,
                        fontSize = 12.sp,
                        color = if (isSelected) colors.text.normal else colors.text.normal.copy(alpha = 0.6f),
                    )
                }
            }
        }

        // Content
        when (selectedTab) {
            StorageTab.Database -> DatabaseInspector(
                databases = databases,
                loadError = if (databases.isEmpty()) error else null,
                onFetchTableData = onFetchTableData,
                onExecuteSQL = onExecuteSQL,
                modifier = Modifier.fillMaxSize(),
            )
            StorageTab.KeyValue -> KeyValueInspector(
                keyValueFiles = keyValueFiles,
                onSetValue = dataSource?.let { ds ->
                    { fileName, key, value, type -> ds.setKeyValue(fileName, key, value, type) }
                },
                modifier = Modifier.fillMaxSize()
            )
        }
    }

}
