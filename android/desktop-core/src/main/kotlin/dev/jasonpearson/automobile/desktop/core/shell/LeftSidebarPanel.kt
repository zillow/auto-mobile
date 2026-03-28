package dev.jasonpearson.automobile.desktop.core.shell

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import dev.jasonpearson.automobile.desktop.core.datasource.DataSourceMode
import dev.jasonpearson.automobile.desktop.core.mcp.McpProcess
import dev.jasonpearson.automobile.desktop.core.theme.SharedTheme

/**
 * Left sidebar panel composing MCP connection, daemon status, and device list sections.
 */
@Composable
fun LeftSidebarPanel(
    dataSourceMode: DataSourceMode,
    onDataSourceModeChanged: (DataSourceMode) -> Unit,
    onDeviceSelected: (deviceId: String, deviceName: String?) -> Unit,
    onProcessConnected: (McpProcess?) -> Unit,
    connectedProcess: McpProcess?,
    activeDeviceId: String?,
    suppressAutoSelect: Boolean,
    modifier: Modifier = Modifier,
) {
    val colors = SharedTheme.globalColors
    val scrollState = rememberScrollState()

    Column(
        modifier = modifier
            .fillMaxHeight()
            .background(colors.panelBackground.copy(alpha = 0.85f))
            .verticalScroll(scrollState)
            .padding(12.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        McpConnectionSection(
            dataSourceMode = dataSourceMode,
            onDataSourceModeChanged = onDataSourceModeChanged,
            onProcessConnected = onProcessConnected,
            modifier = Modifier.fillMaxWidth(),
        )

        DaemonStatusSection(
            dataSourceMode = dataSourceMode,
            modifier = Modifier.fillMaxWidth(),
        )

        DeviceListSection(
            dataSourceMode = dataSourceMode,
            connectedProcess = connectedProcess,
            onDeviceSelected = onDeviceSelected,
            activeDeviceId = activeDeviceId,
            suppressAutoSelect = suppressAutoSelect,
            modifier = Modifier.fillMaxWidth(),
        )
    }
}
