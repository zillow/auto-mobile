package dev.jasonpearson.automobile.ide.mcp

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json

/**
 * Response from automobile:devices/booted resource
 */
@Serializable
data class BootedDevicesResponse(
    val totalCount: Int,
    val androidCount: Int,
    val iosCount: Int,
    val virtualCount: Int,
    val physicalCount: Int,
    val lastUpdated: String,
    val devices: List<BootedDeviceInfo>,
)

@Serializable
data class DeviceServiceStatus(
    val installed: Boolean = false,
    val enabled: Boolean = false,
    val running: Boolean = false,
    val installedSha256: String? = null,
    val expectedSha256: String = "",
    val isCompatible: Boolean = true,
)

@Serializable
data class BootedDeviceInfo(
    val name: String,
    val platform: String, // "android" or "ios"
    val deviceId: String,
    val source: String, // "local" or "remote"
    val isVirtual: Boolean,
    val status: String, // "booted"
    val serviceStatus: DeviceServiceStatus? = null,
)

@Serializable
data class ServiceExpectedInfo(
    val expectedSha256: String = "",
    val url: String = "",
    val expectedAppHash: String = "",
)

@Serializable
data class DaemonPlatformInfo(
    val ctrlProxy: ServiceExpectedInfo? = null,
    val xcTestService: ServiceExpectedInfo? = null,
)

@Serializable
data class DaemonStatusResponse(
    val version: String = "",
    val releaseVersion: String = "",
    val android: DaemonPlatformInfo? = null,
    val ios: DaemonPlatformInfo? = null,
)

/**
 * Response from automobile:devices/images resource
 */
@Serializable
data class DeviceImagesResponse(
    val totalCount: Int,
    val androidCount: Int,
    val iosCount: Int,
    val lastUpdated: String,
    val images: List<DeviceImageInfo>,
)

@Serializable
data class DeviceImageInfo(
    val name: String,
    val platform: String, // "android" or "ios"
    val deviceId: String? = null,
    val source: String = "local",
    // Extended AVD info (Android only)
    val path: String? = null,
    val target: String? = null,
    val basedOn: String? = null,
    // iOS simulator metadata
    val state: String? = null,
    val isAvailable: Boolean? = null,
    val iosVersion: String? = null,
    val deviceType: String? = null,
)

/**
 * Parser for device resource responses
 */
object DeviceResourceParser {
    private val json = Json {
        ignoreUnknownKeys = true
        isLenient = true
    }

    fun parseBootedDevices(jsonString: String): BootedDevicesResponse? {
        return try {
            json.decodeFromString<BootedDevicesResponse>(jsonString)
        } catch (e: Exception) {
            null
        }
    }

    fun parseDeviceImages(jsonString: String): DeviceImagesResponse? {
        return try {
            json.decodeFromString<DeviceImagesResponse>(jsonString)
        } catch (e: Exception) {
            null
        }
    }
}
