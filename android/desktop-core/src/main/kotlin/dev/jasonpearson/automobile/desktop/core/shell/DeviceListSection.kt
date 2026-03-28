package dev.jasonpearson.automobile.desktop.core.shell

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
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
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.pointer.PointerIcon
import androidx.compose.ui.input.pointer.pointerHoverIcon
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import dev.jasonpearson.automobile.desktop.core.datasource.DataSourceMode
import dev.jasonpearson.automobile.desktop.core.mcp.BootedDeviceInfo
import dev.jasonpearson.automobile.desktop.core.mcp.DeviceResourceParser
import dev.jasonpearson.automobile.desktop.core.mcp.McpProcess
import dev.jasonpearson.automobile.desktop.core.mcp.ResourceReadResult
import dev.jasonpearson.automobile.desktop.core.theme.SharedTheme
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/**
 * Section displaying a list of booted devices grouped by platform.
 */
@Composable
fun DeviceListSection(
    dataSourceMode: DataSourceMode,
    connectedProcess: McpProcess?,
    onDeviceSelected: (deviceId: String, deviceName: String?) -> Unit,
    activeDeviceId: String?,
    suppressAutoSelect: Boolean,
    modifier: Modifier = Modifier,
) {
    val colors = SharedTheme.globalColors
    var expanded by remember { mutableStateOf(true) }
    var bootedDevices by remember { mutableStateOf<List<BootedDeviceInfo>>(emptyList()) }
    var isLoading by remember { mutableStateOf(true) }
    var error by remember { mutableStateOf<String?>(null) }

    // Fetch devices – re-run when the data-source mode or connected process changes
    LaunchedEffect(dataSourceMode, connectedProcess) {
        isLoading = true
        error = null
        val client = if (dataSourceMode == DataSourceMode.Real) {
            try {
                val daemonClient = withContext(Dispatchers.IO) {
                    dev.jasonpearson.automobile.desktop.core.daemon.McpClientFactory.createFromProcess(connectedProcess)
                }
                dev.jasonpearson.automobile.desktop.core.mcp.DaemonMcpResourceClient(daemonClient)
            } catch (e: Exception) {
                error = e.message ?: "Failed to connect to daemon"
                isLoading = false
                return@LaunchedEffect
            }
        } else {
            dev.jasonpearson.automobile.desktop.core.mcp.McpResourceClientFactory.createFake()
        }
        try {
            val result = withContext(Dispatchers.IO) {
                client.readResource("automobile:devices/booted")
            }
            when (result) {
                is ResourceReadResult.Success -> {
                    val parsed = DeviceResourceParser.parseBootedDevices(result.content)
                    bootedDevices = parsed?.devices ?: emptyList()
                }
                is ResourceReadResult.Error -> {
                    error = result.message
                }
            }
            withContext(Dispatchers.IO) { client.close() }
        } catch (e: Exception) {
            error = e.message ?: "Failed to fetch devices"
        }
        isLoading = false
    }

    // Auto-select single device
    LaunchedEffect(bootedDevices, suppressAutoSelect) {
        if (!suppressAutoSelect && bootedDevices.size == 1 && activeDeviceId == null) {
            val device = bootedDevices.first()
            onDeviceSelected(device.deviceId, device.name)
        }
    }

    Column(
        modifier = modifier
            .background(colors.text.normal.copy(alpha = 0.03f), RoundedCornerShape(6.dp))
            .padding(12.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        CollapsibleSectionHeader(
            title = "Devices",
            expanded = expanded,
            onToggle = { expanded = !expanded },
            trailing = {
                if (isLoading) {
                    Text(
                        "Loading...",
                        fontSize = 10.sp,
                        color = Color(0xFF2196F3),
                        maxLines = 1,
                        softWrap = false,
                    )
                } else if (bootedDevices.isNotEmpty()) {
                    Text(
                        "${bootedDevices.size}",
                        fontSize = 10.sp,
                        color = colors.text.normal.copy(alpha = 0.5f),
                        maxLines = 1,
                        softWrap = false,
                    )
                }
            },
        )

        if (expanded) {
            if (error != null) {
                Text(
                    error!!,
                    fontSize = 10.sp,
                    color = Color(0xFFE53935),
                )
            } else if (!isLoading && bootedDevices.isEmpty()) {
                Text(
                    "No devices found",
                    fontSize = 11.sp,
                    color = colors.text.normal.copy(alpha = 0.5f),
                    maxLines = 1,
                    softWrap = false,
                )
            } else if (!isLoading) {
                // Group by platform
                val androidDevices = bootedDevices.filter { it.platform == "android" }
                val iosDevices = bootedDevices.filter { it.platform == "ios" }

                if (androidDevices.isNotEmpty()) {
                    DevicePlatformGroup(
                        label = "Android",
                        icon = "\uD83E\uDD16",
                        devices = androidDevices,
                        activeDeviceId = activeDeviceId,
                        onDeviceSelected = onDeviceSelected,
                    )
                }
                if (iosDevices.isNotEmpty()) {
                    DevicePlatformGroup(
                        label = "iOS",
                        icon = "\uD83C\uDF4E",
                        devices = iosDevices,
                        activeDeviceId = activeDeviceId,
                        onDeviceSelected = onDeviceSelected,
                    )
                }
            }
        }
    }
}

@Composable
private fun DevicePlatformGroup(
    label: String,
    icon: String,
    devices: List<BootedDeviceInfo>,
    activeDeviceId: String?,
    onDeviceSelected: (deviceId: String, deviceName: String?) -> Unit,
) {
    val colors = SharedTheme.globalColors

    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Text(
            "$icon $label (${devices.size})",
            fontSize = 11.sp,
            color = colors.text.normal.copy(alpha = 0.6f),
            maxLines = 1,
            softWrap = false,
        )
        devices.forEach { device ->
            val isSelected = device.deviceId == activeDeviceId
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(
                        if (isSelected) colors.outlines.focused.copy(alpha = 0.12f)
                        else Color.Transparent,
                        RoundedCornerShape(4.dp),
                    )
                    .clickable { onDeviceSelected(device.deviceId, device.name) }
                    .pointerHoverIcon(PointerIcon.Hand)
                    .padding(horizontal = 8.dp, vertical = 4.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        device.name,
                        fontSize = 12.sp,
                        fontWeight = if (isSelected) FontWeight.Medium else FontWeight.Normal,
                        color = colors.text.normal,
                        maxLines = 1,
                        softWrap = false,
                        overflow = TextOverflow.Ellipsis,
                    )
                    Text(
                        "${device.status} \u00B7 ${device.deviceId}",
                        fontSize = 10.sp,
                        color = colors.text.normal.copy(alpha = 0.5f),
                        maxLines = 1,
                        softWrap = false,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
                if (isSelected) {
                    Text(
                        "\u2713",
                        fontSize = 12.sp,
                        color = colors.outlines.focused,
                    )
                }
            }
        }
    }
}
