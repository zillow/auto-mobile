package dev.jasonpearson.automobile.desktop.core.shell

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.material3.Text
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import dev.jasonpearson.automobile.desktop.core.datasource.DataSourceMode
import dev.jasonpearson.automobile.desktop.core.mcp.DaemonStatusResponse
import dev.jasonpearson.automobile.desktop.core.mcp.RealSocketFileChecker
import dev.jasonpearson.automobile.desktop.core.theme.SharedTheme
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/**
 * Section displaying daemon health: socket path, connection state, and version.
 */
@Composable
fun DaemonStatusSection(
    dataSourceMode: DataSourceMode,
    modifier: Modifier = Modifier,
) {
    val colors = SharedTheme.globalColors
    var expanded by remember { mutableStateOf(true) }
    var daemonStatus by remember { mutableStateOf<DaemonStatusResponse?>(null) }
    var socketPath by remember { mutableStateOf<String?>(null) }

    val isConnected = daemonStatus != null

    LaunchedEffect(dataSourceMode) {
        if (dataSourceMode == DataSourceMode.Real) {
            withContext(Dispatchers.IO) {
                try {
                    val client = dev.jasonpearson.automobile.desktop.core.daemon.McpClientFactory.createPreferred(null)
                    daemonStatus = client.getDaemonStatus()
                    socketPath = RealSocketFileChecker().findDaemonSocketFiles().firstOrNull()
                    client.close()
                } catch (_: Exception) {
                    daemonStatus = null
                    socketPath = null
                }
            }
        } else {
            socketPath = "/tmp/auto-mobile-daemon-501.sock"
            daemonStatus = DaemonStatusResponse(version = "0.1.0-fake", releaseVersion = "dev")
        }
    }

    Column(
        modifier = modifier
            .background(colors.text.normal.copy(alpha = 0.03f), RoundedCornerShape(6.dp))
            .padding(12.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        CollapsibleSectionHeader(
            title = "Daemon Status",
            expanded = expanded,
            onToggle = { expanded = !expanded },
            trailing = { StatusDot(connected = isConnected) },
        )

        if (expanded) {
            if (socketPath != null) {
                Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                    Text(
                        "Socket",
                        fontSize = 11.sp,
                        color = colors.text.normal.copy(alpha = 0.5f),
                        maxLines = 1,
                        softWrap = false,
                    )
                    Text(
                        socketPath!!,
                        fontSize = 11.sp,
                        color = colors.text.normal.copy(alpha = 0.8f),
                        maxLines = 1,
                        softWrap = false,
                    )
                }
            }

            Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                Text(
                    "State:",
                    fontSize = 11.sp,
                    color = colors.text.normal.copy(alpha = 0.5f),
                    maxLines = 1,
                    softWrap = false,
                )
                Text(
                    if (isConnected) "Connected" else "Disconnected",
                    fontSize = 11.sp,
                    color = if (isConnected) Color(0xFF4CAF50) else Color(0xFFE53935),
                    maxLines = 1,
                    softWrap = false,
                )
            }

            if (isConnected) {
                val status = daemonStatus!!
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    Text(
                        "Version:",
                        fontSize = 11.sp,
                        color = colors.text.normal.copy(alpha = 0.5f),
                        maxLines = 1,
                        softWrap = false,
                    )
                    Text(
                        "${status.version}${if (status.releaseVersion.isNotEmpty()) " (${status.releaseVersion})" else ""}",
                        fontSize = 11.sp,
                        color = colors.text.normal.copy(alpha = 0.8f),
                        maxLines = 1,
                        softWrap = false,
                    )
                }
            }
        }
    }
}
