package dev.jasonpearson.automobile.desktop.core.telemetry

import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonArray
import kotlinx.serialization.json.putJsonObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
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

    // --- Navigation with new fields ---

    @Test
    fun `parseTelemetryEvent parses navigation with triggeringInteraction`() {
        val envelope = TelemetryEventEnvelope(
            category = "navigation",
            timestamp = 14000L,
            data = buildJsonObject {
                put("destination", "HomeScreen")
                put("source", "sdk")
                putJsonObject("triggeringInteraction") {
                    put("type", "tap")
                    put("elementText", "Home")
                }
            },
        )
        val event = parseTelemetryEvent(envelope) as TelemetryDisplayEvent.Navigation
        assertEquals("HomeScreen", event.destination)
        assertEquals("tap on 'Home'", event.triggeringInteraction)
    }

    @Test
    fun `parseTelemetryEvent parses navigation with screenshotUri`() {
        val envelope = TelemetryEventEnvelope(
            category = "navigation",
            timestamp = 15000L,
            data = buildJsonObject {
                put("destination", "Settings")
                put("screenshotUri", "automobile:navigation/nodes/42/screenshot")
            },
        )
        val event = parseTelemetryEvent(envelope) as TelemetryDisplayEvent.Navigation
        assertEquals("automobile:navigation/nodes/42/screenshot", event.screenshotUri)
    }

    // --- Failure with stackTrace ---

    @Test
    fun `parseTelemetryEvent parses crash with stackTrace`() {
        val envelope = TelemetryEventEnvelope(
            category = "crash",
            timestamp = 16000L,
            data = buildJsonObject {
                put("occurrenceId", "occ-1")
                put("severity", "critical")
                put("title", "NPE in UserRepo")
                put("exceptionType", "NullPointerException")
                putJsonArray("stackTrace") {
                    add(buildJsonObject {
                        put("className", "com.example.UserRepo")
                        put("methodName", "getUser")
                        put("fileName", "UserRepo.kt")
                        put("lineNumber", 42)
                        put("isAppCode", true)
                    })
                    add(buildJsonObject {
                        put("className", "android.os.Handler")
                        put("methodName", "dispatch")
                        put("isAppCode", false)
                    })
                }
            },
        )
        val event = parseTelemetryEvent(envelope) as TelemetryDisplayEvent.Failure
        assertNotNull(event.stackTrace)
        assertEquals(2, event.stackTrace!!.size)
        assertEquals("com.example.UserRepo", event.stackTrace!![0].className)
        assertEquals("getUser", event.stackTrace!![0].methodName)
        assertEquals("UserRepo.kt", event.stackTrace!![0].fileName)
        assertEquals(42, event.stackTrace!![0].lineNumber)
        assertTrue(event.stackTrace!![0].isAppCode)
        assertFalse(event.stackTrace!![1].isAppCode)
        assertNull(event.stackTrace!![1].fileName)
    }

    @Test
    fun `parseTelemetryEvent parses failure without stackTrace`() {
        val envelope = TelemetryEventEnvelope(
            category = "anr",
            timestamp = 17000L,
            data = buildJsonObject {
                put("occurrenceId", "occ-2")
                put("severity", "high")
                put("title", "ANR in main thread")
            },
        )
        val event = parseTelemetryEvent(envelope) as TelemetryDisplayEvent.Failure
        assertNull(event.stackTrace)
    }

    // --- Storage with previousValue ---

    @Test
    fun `parseTelemetryEvent parses storage with previousValue`() {
        val envelope = TelemetryEventEnvelope(
            category = "storage",
            timestamp = 18000L,
            data = buildJsonObject {
                put("fileName", "prefs.xml")
                put("key", "dark_mode")
                put("value", "true")
                put("changeType", "modify")
                put("previousValue", "false")
            },
        )
        val event = parseTelemetryEvent(envelope) as TelemetryDisplayEvent.Storage
        assertEquals("prefs.xml", event.fileName)
        assertEquals("true", event.value)
        assertEquals("false", event.previousValue)
    }

    @Test
    fun `parseTelemetryEvent parses storage with snake_case previous_value`() {
        val envelope = TelemetryEventEnvelope(
            category = "storage",
            timestamp = 19000L,
            data = buildJsonObject {
                put("file_name", "session.xml")
                put("key", "token")
                put("change_type", "remove")
                put("previous_value", "old_token")
            },
        )
        val event = parseTelemetryEvent(envelope) as TelemetryDisplayEvent.Storage
        assertEquals("session.xml", event.fileName)
        assertEquals("old_token", event.previousValue)
    }

    // --- Layout with screenName and detailsJson ---

    @Test
    fun `parseTelemetryEvent parses layout with screenName and detailsJson`() {
        val envelope = TelemetryEventEnvelope(
            category = "layout",
            timestamp = 20000L,
            data = buildJsonObject {
                put("subType", "hierarchy_change")
                put("screenName", "HomeScreen")
                put("detailsJson", """{"windowCount":2}""")
            },
        )
        val event = parseTelemetryEvent(envelope) as TelemetryDisplayEvent.Layout
        assertEquals("HomeScreen", event.screenName)
        assertEquals("""{"windowCount":2}""", event.detailsJson)
    }

    // --- Network with headers and bodies ---

    @Test
    fun `parseTelemetryEvent parses network with request and response headers`() {
        val envelope = TelemetryEventEnvelope(
            category = "network",
            timestamp = 21000L,
            data = buildJsonObject {
                put("method", "GET")
                put("url", "https://api.test/get")
                put("statusCode", 200)
                put("durationMs", 50)
                putJsonObject("requestHeaders") {
                    put("Accept", "application/json")
                }
                putJsonObject("responseHeaders") {
                    put("Content-Type", "application/json")
                }
                put("requestBody", """{"q":"test"}""")
                put("responseBody", """{"results":[]}""")
                put("contentType", "application/json")
            },
        )
        val event = parseTelemetryEvent(envelope) as TelemetryDisplayEvent.Network
        assertEquals(mapOf("Accept" to "application/json"), event.requestHeaders)
        assertEquals(mapOf("Content-Type" to "application/json"), event.responseHeaders)
        assertEquals("""{"q":"test"}""", event.requestBody)
        assertEquals("""{"results":[]}""", event.responseBody)
        assertEquals("application/json", event.contentType)
    }

    // --- matchesSearch tests ---

    @Test
    fun `matchesSearch returns true for blank query`() {
        val event = TelemetryDisplayEvent.Log(
            timestamp = 1000, level = 4, tag = "Test", message = "hello",
        )
        assertTrue(event.matchesSearch(""))
        assertTrue(event.matchesSearch("   "))
    }

    @Test
    fun `matchesSearch matches network event by URL`() {
        val event = TelemetryDisplayEvent.Network(
            timestamp = 1000, method = "GET", statusCode = 200,
            url = "https://api.example.com/users", durationMs = 42,
            host = "api.example.com", path = "/users", error = null,
            requestHeaders = null, responseHeaders = null,
            requestBody = null, responseBody = null, contentType = null,
        )
        assertTrue(event.matchesSearch("example"))
        assertTrue(event.matchesSearch("USERS"))
        assertFalse(event.matchesSearch("posts"))
    }

    @Test
    fun `matchesSearch matches log event by tag and message`() {
        val event = TelemetryDisplayEvent.Log(
            timestamp = 1000, level = 4, tag = "OkHttp", message = "HTTP 200 OK",
        )
        assertTrue(event.matchesSearch("okhttp"))
        assertTrue(event.matchesSearch("200"))
        assertFalse(event.matchesSearch("retrofit"))
    }

    @Test
    fun `matchesSearch matches failure by title`() {
        val event = TelemetryDisplayEvent.Failure(
            timestamp = 1000, type = "crash", occurrenceId = "o1",
            severity = "critical", title = "NPE in UserRepository",
            exceptionType = "NullPointerException", screen = "ProfileScreen",
            stackTrace = null,
        )
        assertTrue(event.matchesSearch("UserRepository"))
        assertTrue(event.matchesSearch("npe"))
        assertTrue(event.matchesSearch("profile"))
        assertFalse(event.matchesSearch("settings"))
    }

    @Test
    fun `matchesSearch matches storage by fileName and key`() {
        val event = TelemetryDisplayEvent.Storage(
            timestamp = 1000, fileName = "user_prefs.xml",
            key = "dark_mode", value = "true", valueType = "BOOLEAN",
            changeType = "modify", previousValue = "false",
        )
        assertTrue(event.matchesSearch("user_prefs"))
        assertTrue(event.matchesSearch("dark_mode"))
        assertFalse(event.matchesSearch("session"))
    }

    @Test
    fun `matchesSearch matches navigation by destination`() {
        val event = TelemetryDisplayEvent.Navigation(
            timestamp = 1000, destination = "HomeDestination",
            source = "sdk", arguments = mapOf("tab" to "discover"),
            metadata = null, triggeringInteraction = "tap on 'Home'",
            screenshotUri = null,
        )
        assertTrue(event.matchesSearch("home"))
        assertTrue(event.matchesSearch("discover"))
        assertTrue(event.matchesSearch("tap"))
        assertFalse(event.matchesSearch("settings"))
    }

    @Test
    fun `matchesSearch matches layout by composableName`() {
        val event = TelemetryDisplayEvent.Layout(
            timestamp = 1000, subType = "excessive_recomposition",
            composableName = "AnimatedCounter", recompositionCount = 15,
            durationMs = 8, likelyCause = "unstable_lambda",
            screenName = "HomeScreen", detailsJson = null,
        )
        assertTrue(event.matchesSearch("AnimatedCounter"))
        assertTrue(event.matchesSearch("unstable"))
        assertTrue(event.matchesSearch("excessive"))
        assertFalse(event.matchesSearch("button"))
    }

    // --- eventSeverity tests ---

    @Test
    fun `eventSeverity classifies crash as Error`() {
        val event = TelemetryDisplayEvent.Failure(
            timestamp = 1000, type = "crash", occurrenceId = "o1",
            severity = "critical", title = "NPE", exceptionType = null,
            screen = null, stackTrace = null,
        )
        assertEquals(EventSeverity.Error, event.eventSeverity)
    }

    @Test
    fun `eventSeverity classifies ANR as Error`() {
        val event = TelemetryDisplayEvent.Failure(
            timestamp = 1000, type = "anr", occurrenceId = "o1",
            severity = "high", title = "ANR", exceptionType = null,
            screen = null, stackTrace = null,
        )
        assertEquals(EventSeverity.Error, event.eventSeverity)
    }

    @Test
    fun `eventSeverity classifies nonfatal as Warning`() {
        val event = TelemetryDisplayEvent.Failure(
            timestamp = 1000, type = "nonfatal", occurrenceId = "o1",
            severity = "low", title = "Handled", exceptionType = null,
            screen = null, stackTrace = null,
        )
        assertEquals(EventSeverity.Warning, event.eventSeverity)
    }

    @Test
    fun `eventSeverity classifies log levels correctly`() {
        fun logAt(level: Int) = TelemetryDisplayEvent.Log(
            timestamp = 1000, level = level, tag = "T", message = "m",
        )
        assertEquals(EventSeverity.Error, logAt(6).eventSeverity)   // ERROR
        assertEquals(EventSeverity.Error, logAt(7).eventSeverity)   // ASSERT
        assertEquals(EventSeverity.Warning, logAt(5).eventSeverity) // WARN
        assertEquals(EventSeverity.Info, logAt(4).eventSeverity)    // INFO
        assertEquals(EventSeverity.Info, logAt(3).eventSeverity)    // DEBUG
    }

    @Test
    fun `eventSeverity classifies network by status and error`() {
        fun net(status: Int, error: String? = null, durationMs: Long = 10) = TelemetryDisplayEvent.Network(
            timestamp = 1000, method = "GET", statusCode = status,
            url = "u", durationMs = durationMs, host = null, path = null, error = error,
            requestHeaders = null, responseHeaders = null,
            requestBody = null, responseBody = null, contentType = null,
        )
        assertEquals(EventSeverity.Error, net(0, "Connection refused").eventSeverity)
        assertEquals(EventSeverity.Error, net(0).eventSeverity) // status 0 = error
        assertEquals(EventSeverity.Error, net(500).eventSeverity)
        assertEquals(EventSeverity.Error, net(404).eventSeverity) // 4xx = error
        assertEquals(EventSeverity.Info, net(200).eventSeverity)
        assertEquals(EventSeverity.Info, net(301).eventSeverity)
    }

    @Test
    fun `eventSeverity classifies slow network as Warning`() {
        val slow = TelemetryDisplayEvent.Network(
            timestamp = 1000, method = "GET", statusCode = 200,
            url = "u", durationMs = 5000, host = null, path = null, error = null,
            requestHeaders = null, responseHeaders = null,
            requestBody = null, responseBody = null, contentType = null,
        )
        assertEquals(EventSeverity.Warning, slow.eventSeverity) // default threshold 3000ms
    }

    @Test
    fun `classifyEventSeverity uses custom slow threshold`() {
        val event = TelemetryDisplayEvent.Network(
            timestamp = 1000, method = "GET", statusCode = 200,
            url = "u", durationMs = 500, host = null, path = null, error = null,
            requestHeaders = null, responseHeaders = null,
            requestBody = null, responseBody = null, contentType = null,
        )
        assertEquals(EventSeverity.Info, event.classifyEventSeverity(1000)) // 500 < 1000
        assertEquals(EventSeverity.Warning, event.classifyEventSeverity(400)) // 500 >= 400
    }

    @Test
    fun `eventSeverity classifies excessive recomposition as Warning`() {
        val event = TelemetryDisplayEvent.Layout(
            timestamp = 1000, subType = "excessive_recomposition",
            composableName = "X", recompositionCount = 15,
            durationMs = null, likelyCause = null,
            screenName = null, detailsJson = null,
        )
        assertEquals(EventSeverity.Warning, event.eventSeverity)
    }

    @Test
    fun `eventSeverity classifies hierarchy_change as Info`() {
        val event = TelemetryDisplayEvent.Layout(
            timestamp = 1000, subType = "hierarchy_change",
            composableName = null, recompositionCount = null,
            durationMs = null, likelyCause = null,
            screenName = null, detailsJson = null,
        )
        assertEquals(EventSeverity.Info, event.eventSeverity)
    }
}
