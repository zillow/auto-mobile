package dev.jasonpearson.automobile.desktop.core.mcp

import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue
import org.junit.Test

class DeviceResourceParserTest {

    // --- parseBootedDevices ---

    @Test
    fun `parses minimal valid booted devices response`() {
        val json = """
            {
                "totalCount": 1,
                "androidCount": 1,
                "iosCount": 0,
                "virtualCount": 1,
                "physicalCount": 0,
                "lastUpdated": "2024-01-24T23:00:00Z",
                "devices": [
                    {
                        "name": "Pixel 8 API 35",
                        "platform": "android",
                        "deviceId": "emulator-5554",
                        "source": "local",
                        "isVirtual": true,
                        "status": "booted"
                    }
                ]
            }
        """.trimIndent()

        val result = DeviceResourceParser.parseBootedDevices(json)
        assertNotNull(result)
        assertEquals(1, result.totalCount)
        assertEquals(1, result.androidCount)
        assertEquals(0, result.iosCount)
        assertEquals(1, result.devices.size)
        with(result.devices[0]) {
            assertEquals("Pixel 8 API 35", name)
            assertEquals("android", platform)
            assertEquals("emulator-5554", deviceId)
            assertEquals("local", source)
            assertTrue(isVirtual)
            assertEquals("booted", status)
        }
    }

    @Test
    fun `parses device with optional serviceStatus`() {
        val json = """
            {
                "totalCount": 1,
                "androidCount": 1,
                "iosCount": 0,
                "virtualCount": 1,
                "physicalCount": 0,
                "lastUpdated": "2024-01-24T23:00:00Z",
                "devices": [
                    {
                        "name": "Pixel 8",
                        "platform": "android",
                        "deviceId": "emulator-5554",
                        "source": "local",
                        "isVirtual": true,
                        "status": "booted",
                        "serviceStatus": {
                            "installed": true,
                            "enabled": true,
                            "running": true,
                            "installedSha256": "abc123",
                            "expectedSha256": "abc123",
                            "isCompatible": true
                        }
                    }
                ]
            }
        """.trimIndent()

        val result = DeviceResourceParser.parseBootedDevices(json)
        assertNotNull(result)
        val status = result.devices[0].serviceStatus
        assertNotNull(status)
        assertTrue(status.installed)
        assertTrue(status.running)
        assertEquals("abc123", status.installedSha256)
        assertEquals("abc123", status.expectedSha256)
        assertTrue(status.isCompatible)
    }

    @Test
    fun `ignores unknown fields in booted devices response`() {
        val json = """
            {
                "totalCount": 1,
                "androidCount": 1,
                "iosCount": 0,
                "virtualCount": 1,
                "physicalCount": 0,
                "lastUpdated": "2024-01-24T23:00:00Z",
                "unknownFutureField": "ignored",
                "devices": [
                    {
                        "name": "Pixel 8",
                        "platform": "android",
                        "deviceId": "emulator-5554",
                        "source": "local",
                        "isVirtual": true,
                        "status": "booted",
                        "anotherUnknownField": 42
                    }
                ]
            }
        """.trimIndent()

        val result = DeviceResourceParser.parseBootedDevices(json)
        assertNotNull(result, "Parser should tolerate unknown fields")
        assertEquals(1, result.totalCount)
    }

    @Test
    fun `returns null for malformed booted devices JSON`() {
        assertNull(DeviceResourceParser.parseBootedDevices("{invalid json"))
    }

    @Test
    fun `returns null for empty booted devices string`() {
        assertNull(DeviceResourceParser.parseBootedDevices(""))
    }

    @Test
    fun `returns null for booted devices array instead of object`() {
        assertNull(DeviceResourceParser.parseBootedDevices("[1, 2, 3]"))
    }

    // --- parseDeviceImages ---

    @Test
    fun `parses valid device images response`() {
        val json = """
            {
                "totalCount": 3,
                "androidCount": 2,
                "iosCount": 1,
                "lastUpdated": "2024-01-24T23:00:00Z",
                "images": [
                    {"name": "Pixel 8 API 35", "platform": "android", "deviceId": "Pixel_8_API_35"},
                    {"name": "Pixel 7 API 34", "platform": "android", "deviceId": "Pixel_7_API_34"},
                    {"name": "iPhone 15 Pro",  "platform": "ios",     "deviceId": "iphone-15-pro"}
                ]
            }
        """.trimIndent()

        val result = DeviceResourceParser.parseDeviceImages(json)
        assertNotNull(result)
        assertEquals(3, result.totalCount)
        assertEquals(2, result.androidCount)
        assertEquals(1, result.iosCount)
        assertEquals(3, result.images.size)
        assertEquals("iPhone 15 Pro", result.images[2].name)
        assertEquals("ios", result.images[2].platform)
    }

    @Test
    fun `parses device image with optional extended AVD fields`() {
        val json = """
            {
                "totalCount": 1,
                "androidCount": 1,
                "iosCount": 0,
                "lastUpdated": "2024-01-24T23:00:00Z",
                "images": [
                    {
                        "name": "Pixel 8 API 35",
                        "platform": "android",
                        "deviceId": "Pixel_8_API_35",
                        "path": "/home/user/.android/avd/Pixel_8_API_35.avd",
                        "target": "android-35",
                        "basedOn": "Google APIs"
                    }
                ]
            }
        """.trimIndent()

        val result = DeviceResourceParser.parseDeviceImages(json)
        assertNotNull(result)
        with(result.images[0]) {
            assertEquals("/home/user/.android/avd/Pixel_8_API_35.avd", path)
            assertEquals("android-35", target)
            assertEquals("Google APIs", basedOn)
        }
    }

    @Test
    fun `returns null for malformed device images JSON`() {
        assertNull(DeviceResourceParser.parseDeviceImages("[not an object"))
    }

    @Test
    fun `returns null for empty device images string`() {
        assertNull(DeviceResourceParser.parseDeviceImages(""))
    }

    // --- FakeMcpResourceClient fixture validity ---

    @Test
    fun `FakeMcpResourceClient bootedDevicesResponse is valid JSON`() {
        val fake = FakeMcpResourceClient()
        val result = DeviceResourceParser.parseBootedDevices(fake.bootedDevicesResponse)
        assertNotNull(result, "FakeMcpResourceClient.bootedDevicesResponse must be valid JSON")
        assertEquals(2, result.totalCount)
        assertEquals(2, result.devices.size)
    }

    @Test
    fun `FakeMcpResourceClient deviceImagesResponse is valid JSON`() {
        val fake = FakeMcpResourceClient()
        val result = DeviceResourceParser.parseDeviceImages(fake.deviceImagesResponse)
        assertNotNull(result, "FakeMcpResourceClient.deviceImagesResponse must be valid JSON")
        assertEquals(5, result.totalCount)
        assertEquals(5, result.images.size)
    }
}
