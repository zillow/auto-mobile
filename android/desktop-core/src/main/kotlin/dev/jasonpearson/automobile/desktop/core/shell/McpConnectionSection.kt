package dev.jasonpearson.automobile.desktop.core.shell

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.material3.Text
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.pointer.PointerIcon
import androidx.compose.ui.input.pointer.pointerHoverIcon
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import dev.jasonpearson.automobile.desktop.core.datasource.DataSourceMode
import dev.jasonpearson.automobile.desktop.core.mcp.FakeMcpProcessDetector
import dev.jasonpearson.automobile.desktop.core.mcp.McpConnectionType
import dev.jasonpearson.automobile.desktop.core.mcp.McpProcess
import dev.jasonpearson.automobile.desktop.core.mcp.RealMcpProcessDetector
import dev.jasonpearson.automobile.desktop.core.theme.SharedTheme

/**
 * Section showing MCP server connection state with process detection and a data-source toggle.
 */
@Composable
fun McpConnectionSection(
    dataSourceMode: DataSourceMode,
    onDataSourceModeChanged: (DataSourceMode) -> Unit,
    onProcessConnected: (McpProcess?) -> Unit,
    modifier: Modifier = Modifier,
) {
    val colors = SharedTheme.globalColors
    val useRealData = dataSourceMode == DataSourceMode.Real

    val detector = remember(useRealData) {
        if (useRealData) RealMcpProcessDetector() else FakeMcpProcessDetector()
    }

    var refreshCounter by remember { mutableIntStateOf(0) }
    var processes by remember { mutableStateOf<List<McpProcess>>(emptyList()) }
    var isLoading by remember { mutableStateOf(true) }
    var connectedProcess by remember { mutableStateOf<McpProcess?>(null) }
    var expanded by remember { mutableStateOf(true) }

    LaunchedEffect(useRealData, refreshCounter) {
        isLoading = true
        processes = withContext(Dispatchers.IO) { detector.detectProcesses() }
        isLoading = false
    }

    LaunchedEffect(connectedProcess) {
        onProcessConnected(connectedProcess)
    }

    // Clear stale connection when process list refreshes, or auto-connect
    LaunchedEffect(processes) {
        // If the previously connected process is no longer detected, clear it
        val current = connectedProcess
        if (current != null && processes.none { it.pid == current.pid }) {
            connectedProcess = null
            onProcessConnected(null)
        }

        // Auto-connect when there is exactly one Unix Socket process
        val socketProcesses = processes.filter { it.connectionType == McpConnectionType.UnixSocket }
        if (socketProcesses.size == 1 && connectedProcess == null) {
            val autoConnect = socketProcesses.first()
            connectedProcess = autoConnect
            onProcessConnected(autoConnect)
        }
    }

    Column(
        modifier = modifier
            .background(colors.text.normal.copy(alpha = 0.03f), RoundedCornerShape(6.dp))
            .padding(12.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        CollapsibleSectionHeader(
            title = "MCP Servers",
            expanded = expanded,
            onToggle = { expanded = !expanded },
            trailing = { StatusDot(connected = connectedProcess != null) },
        )

        if (expanded) {
            // Data source toggle
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    "Real Data",
                    fontSize = 11.sp,
                    color = colors.text.normal.copy(alpha = 0.7f),
                    maxLines = 1,
                    softWrap = false,
                )
                Box(
                    modifier = Modifier
                        .background(
                            if (useRealData) Color(0xFF4CAF50).copy(alpha = 0.2f)
                            else colors.text.normal.copy(alpha = 0.1f),
                            RoundedCornerShape(4.dp),
                        )
                        .clickable {
                            onDataSourceModeChanged(
                                if (useRealData) DataSourceMode.Fake else DataSourceMode.Real
                            )
                        }
                        .pointerHoverIcon(PointerIcon.Hand)
                        .padding(horizontal = 8.dp, vertical = 2.dp),
                ) {
                    Text(
                        if (useRealData) "ON" else "OFF",
                        fontSize = 10.sp,
                        fontWeight = FontWeight.Medium,
                        color = if (useRealData) Color(0xFF4CAF50) else colors.text.normal.copy(alpha = 0.5f),
                    )
                }
            }

            if (connectedProcess != null) {
                val proc = connectedProcess!!
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(Color(0xFF4CAF50).copy(alpha = 0.08f), RoundedCornerShape(4.dp))
                        .padding(8.dp),
                    verticalArrangement = Arrangement.spacedBy(2.dp),
                ) {
                    Text(
                        proc.name,
                        fontSize = 12.sp,
                        fontWeight = FontWeight.Medium,
                        color = colors.text.normal,
                        maxLines = 1,
                        softWrap = false,
                    )
                    Text(
                        "PID ${proc.pid} \u00B7 ${proc.connectionType.label}",
                        fontSize = 11.sp,
                        color = colors.text.normal.copy(alpha = 0.6f),
                        maxLines = 1,
                        softWrap = false,
                    )
                }
            }

            if (isLoading && processes.isEmpty()) {
                Text(
                    "Detecting servers...",
                    fontSize = 11.sp,
                    color = colors.text.normal.copy(alpha = 0.5f),
                )
            }

            if (!isLoading || processes.isNotEmpty()) {
                processes.forEach { process ->
                    val isConnected = connectedProcess?.pid == process.pid
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .background(
                                if (isConnected) colors.outlines.focused.copy(alpha = 0.1f)
                                else Color.Transparent,
                                RoundedCornerShape(4.dp),
                            )
                            .clickable {
                                connectedProcess = if (isConnected) null else process
                            }
                            .pointerHoverIcon(PointerIcon.Hand)
                            .padding(horizontal = 8.dp, vertical = 4.dp),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Column(modifier = Modifier.weight(1f)) {
                            Text(
                                process.name,
                                fontSize = 12.sp,
                                color = colors.text.normal,
                                maxLines = 1,
                                softWrap = false,
                            )
                            Text(
                                "${process.connectionType.icon} ${process.connectionType.label}" +
                                    (process.socketPath?.let { " \u00B7 $it" } ?: "") +
                                    (process.port?.let { " :$it" } ?: ""),
                                fontSize = 10.sp,
                                color = colors.text.normal.copy(alpha = 0.5f),
                                maxLines = 1,
                                softWrap = false,
                            )
                        }
                        Text(
                            if (isConnected) "Disconnect" else "Connect",
                            fontSize = 10.sp,
                            color = if (isConnected) Color(0xFFE53935) else Color(0xFF4CAF50),
                        )
                    }
                }
            }

            if (!isLoading) {
                Text(
                    "\u21BB Refresh",
                    fontSize = 10.sp,
                    color = Color(0xFF2196F3),
                    modifier = Modifier
                        .clickable { refreshCounter++ }
                        .pointerHoverIcon(PointerIcon.Hand),
                )
            }
        }
    }
}
