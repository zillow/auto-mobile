package dev.jasonpearson.automobile.ide.storage

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
import org.jetbrains.jewel.foundation.theme.JewelTheme
import org.jetbrains.jewel.ui.component.Text
import dev.jasonpearson.automobile.ide.datasource.DataSourceMode

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
) {
    val colors = JewelTheme.globalColors
    var selectedTab by remember { mutableStateOf(StorageTab.Database) }

    // Fetch storage data from data source
    var databases by remember { mutableStateOf<List<DatabaseInfo>>(emptyList()) }
    var keyValueEntries by remember { mutableStateOf<List<KeyValueEntry>>(emptyList()) }
    var isLoading by remember { mutableStateOf(true) }
    var error by remember { mutableStateOf<String?>(null) }

    LaunchedEffect(dataSourceMode) {
        isLoading = true
        error = null
        kotlinx.coroutines.withContext(kotlinx.coroutines.Dispatchers.IO) {
            try {
                val dataSource = dev.jasonpearson.automobile.ide.datasource.DataSourceFactory.createStorageDataSource(dataSourceMode)

                // Fetch databases
                when (val result = dataSource.getDatabases()) {
                    is dev.jasonpearson.automobile.ide.datasource.Result.Success -> {
                        databases = result.data
                    }
                    is dev.jasonpearson.automobile.ide.datasource.Result.Error -> {
                        error = result.message
                    }
                    is dev.jasonpearson.automobile.ide.datasource.Result.Loading -> {
                        // Keep loading state
                    }
                }

                // Fetch key-value pairs
                when (val result = dataSource.getKeyValuePairs()) {
                    is dev.jasonpearson.automobile.ide.datasource.Result.Success -> {
                        keyValueEntries = result.data
                        isLoading = false
                    }
                    is dev.jasonpearson.automobile.ide.datasource.Result.Error -> {
                        if (error == null) error = result.message
                        isLoading = false
                    }
                    is dev.jasonpearson.automobile.ide.datasource.Result.Loading -> {
                        // Keep loading state
                    }
                }
            } catch (e: Exception) {
                error = e.message ?: "Unknown error"
                isLoading = false
            }
        }
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
                modifier = Modifier.fillMaxSize()
            )
            StorageTab.KeyValue -> KeyValueInspector(modifier = Modifier.fillMaxSize())
        }
    }
}
