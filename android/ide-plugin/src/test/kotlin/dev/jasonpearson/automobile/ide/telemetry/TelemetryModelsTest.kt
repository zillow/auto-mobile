package dev.jasonpearson.automobile.ide.telemetry

import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class TelemetryModelsTest {

    @Test
    fun `parseTelemetryEvent parses network event with camelCase fields`() {
        val envelope = TelemetryEventEnvelope(
            category = "network",
            timestamp = 1000L,
            data = buildJsonObject {
                put("method", "GET")
                put("statusCode", 200)
                put("url", "https://api.example.com/users")
                put("durationMs", 42)
                put("host", "api.example.com")
                put("path", "/users")
            },
        )

        val event = parseTelemetryEvent(envelope)
        assertNotNull(event)
        assertTrue(event is TelemetryDisplayEvent.Network)
        val network = event as TelemetryDisplayEvent.Network
        assertEquals(1000L, network.timestamp)
        assertEquals("GET", network.method)
        assertEquals(200, network.statusCode)
        assertEquals("https://api.example.com/users", network.url)
        assertEquals(42L, network.durationMs)
        assertEquals("api.example.com", network.host)
        assertEquals("/users", network.path)
        assertNull(network.error)
    }

    @Test
    fun `parseTelemetryEvent parses network event with snake_case fields`() {
        val envelope = TelemetryEventEnvelope(
            category = "network",
            timestamp = 2000L,
            data = buildJsonObject {
                put("method", "POST")
                put("status_code", 500)
                put("url", "https://api.example.com/upload")
                put("duration_ms", 1530)
                put("error", "Internal Server Error")
            },
        )

        val event = parseTelemetryEvent(envelope)
        assertNotNull(event)
        val network = event as TelemetryDisplayEvent.Network
        assertEquals(500, network.statusCode)
        assertEquals(1530L, network.durationMs)
        assertEquals("Internal Server Error", network.error)
    }

    @Test
    fun `parseTelemetryEvent parses network event with missing optional fields`() {
        val envelope = TelemetryEventEnvelope(
            category = "network",
            timestamp = 3000L,
            data = buildJsonObject {
                put("method", "DELETE")
                put("url", "https://api.example.com/item/1")
            },
        )

        val event = parseTelemetryEvent(envelope) as TelemetryDisplayEvent.Network
        assertEquals("DELETE", event.method)
        assertEquals(0, event.statusCode)
        assertEquals(0L, event.durationMs)
        assertNull(event.host)
        assertNull(event.path)
        assertNull(event.error)
    }

    @Test
    fun `parseTelemetryEvent parses log event`() {
        val envelope = TelemetryEventEnvelope(
            category = "log",
            timestamp = 4000L,
            data = buildJsonObject {
                put("level", 5)
                put("tag", "NetworkManager")
                put("message", "Slow response detected")
            },
        )

        val event = parseTelemetryEvent(envelope) as TelemetryDisplayEvent.Log
        assertEquals(4000L, event.timestamp)
        assertEquals(5, event.level)
        assertEquals("NetworkManager", event.tag)
        assertEquals("Slow response detected", event.message)
    }

    @Test
    fun `parseTelemetryEvent parses log event with defaults for missing fields`() {
        val envelope = TelemetryEventEnvelope(
            category = "log",
            timestamp = 5000L,
            data = buildJsonObject {},
        )

        val event = parseTelemetryEvent(envelope) as TelemetryDisplayEvent.Log
        assertEquals(4, event.level) // default INFO
        assertEquals("", event.tag)
        assertEquals("", event.message)
    }

    @Test
    fun `parseTelemetryEvent parses custom event with properties object`() {
        val envelope = TelemetryEventEnvelope(
            category = "custom",
            timestamp = 6000L,
            data = buildJsonObject {
                put("name", "button_click")
                putJsonObject("properties") {
                    put("screen", "home")
                    put("button", "refresh")
                }
            },
        )

        val event = parseTelemetryEvent(envelope) as TelemetryDisplayEvent.Custom
        assertEquals(6000L, event.timestamp)
        assertEquals("button_click", event.name)
        assertEquals(mapOf("screen" to "home", "button" to "refresh"), event.properties)
    }

    @Test
    fun `parseTelemetryEvent parses custom event with properties_json string`() {
        val envelope = TelemetryEventEnvelope(
            category = "custom",
            timestamp = 7000L,
            data = buildJsonObject {
                put("name", "purchase")
                put("properties_json", """{"item":"premium","price":"9.99"}""")
            },
        )

        val event = parseTelemetryEvent(envelope) as TelemetryDisplayEvent.Custom
        assertEquals("purchase", event.name)
        assertEquals(mapOf("item" to "premium", "price" to "9.99"), event.properties)
    }

    @Test
    fun `parseTelemetryEvent parses custom event with empty properties`() {
        val envelope = TelemetryEventEnvelope(
            category = "custom",
            timestamp = 8000L,
            data = buildJsonObject {
                put("name", "page_view")
            },
        )

        val event = parseTelemetryEvent(envelope) as TelemetryDisplayEvent.Custom
        assertEquals("page_view", event.name)
        assertTrue(event.properties.isEmpty())
    }

    @Test
    fun `parseTelemetryEvent parses os event with details object`() {
        val envelope = TelemetryEventEnvelope(
            category = "os",
            timestamp = 9000L,
            data = buildJsonObject {
                put("category", "broadcast")
                put("kind", "LOCALE_CHANGED")
                putJsonObject("details") {
                    put("locale", "en_US")
                }
            },
        )

        val event = parseTelemetryEvent(envelope) as TelemetryDisplayEvent.Os
        assertEquals(9000L, event.timestamp)
        assertEquals("broadcast", event.category)
        assertEquals("LOCALE_CHANGED", event.kind)
        assertEquals(mapOf("locale" to "en_US"), event.details)
    }

    @Test
    fun `parseTelemetryEvent parses os event with details_json string`() {
        val envelope = TelemetryEventEnvelope(
            category = "os",
            timestamp = 10000L,
            data = buildJsonObject {
                put("category", "lifecycle")
                put("kind", "foreground")
                put("details_json", """{"activity":"MainActivity"}""")
            },
        )

        val event = parseTelemetryEvent(envelope) as TelemetryDisplayEvent.Os
        assertEquals("lifecycle", event.category)
        assertEquals("foreground", event.kind)
        assertEquals(mapOf("activity" to "MainActivity"), event.details)
    }

    @Test
    fun `parseTelemetryEvent parses os event without details`() {
        val envelope = TelemetryEventEnvelope(
            category = "os",
            timestamp = 11000L,
            data = buildJsonObject {
                put("category", "lifecycle")
                put("kind", "background")
            },
        )

        val event = parseTelemetryEvent(envelope) as TelemetryDisplayEvent.Os
        assertNull(event.details)
    }

    @Test
    fun `parseTelemetryEvent returns null for unknown category`() {
        val envelope = TelemetryEventEnvelope(
            category = "unknown_category",
            timestamp = 12000L,
            data = buildJsonObject {},
        )

        val event = parseTelemetryEvent(envelope)
        assertNull(event)
    }

    @Test
    fun `parseTelemetryEvent prefers properties object over properties_json`() {
        val envelope = TelemetryEventEnvelope(
            category = "custom",
            timestamp = 13000L,
            data = buildJsonObject {
                put("name", "test")
                putJsonObject("properties") {
                    put("from", "object")
                }
                put("properties_json", """{"from":"json"}""")
            },
        )

        val event = parseTelemetryEvent(envelope) as TelemetryDisplayEvent.Custom
        assertEquals(mapOf("from" to "object"), event.properties)
    }
}
