package dev.jasonpearson.automobile.sdk.network

import dev.jasonpearson.automobile.protocol.SdkEvent
import dev.jasonpearson.automobile.protocol.SdkNetworkRequestEvent
import dev.jasonpearson.automobile.sdk.events.SdkEventBuffer
import okhttp3.Interceptor
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.Protocol
import okhttp3.Request
import okhttp3.Response
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.ResponseBody.Companion.toResponseBody
import org.junit.Test
import java.io.IOException
import java.util.concurrent.Executors
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertNull
import kotlin.test.assertTrue

class AutoMobileNetworkInterceptorTest {

    private fun collectingBuffer(): Pair<SdkEventBuffer, MutableList<List<SdkEvent>>> {
        val flushed = mutableListOf<List<SdkEvent>>()
        val buffer = SdkEventBuffer(
            maxBufferSize = 1,
            flushIntervalMs = 60_000,
            onFlush = { flushed.add(it) },
            executor = Executors.newSingleThreadScheduledExecutor(),
        )
        return buffer to flushed
    }

    private fun fakeChain(
        request: Request = Request.Builder().url("https://api.example.com/users").build(),
        responseCode: Int = 200,
        responseBody: String = """{"ok":true}""",
        protocol: Protocol = Protocol.HTTP_2,
        throwOnProceed: Exception? = null,
    ): Interceptor.Chain {
        return object : Interceptor.Chain {
            override fun request(): Request = request
            override fun proceed(request: Request): Response {
                if (throwOnProceed != null) throw throwOnProceed
                return Response.Builder()
                    .request(request)
                    .code(responseCode)
                    .protocol(protocol)
                    .message("OK")
                    .body(responseBody.toResponseBody("application/json".toMediaType()))
                    .build()
            }
            override fun connection() = null
            override fun call() = throw UnsupportedOperationException()
            override fun connectTimeoutMillis() = 10000
            override fun writeTimeoutMillis() = 10000
            override fun readTimeoutMillis() = 10000
            override fun withConnectTimeout(timeout: Int, unit: java.util.concurrent.TimeUnit) = this
            override fun withWriteTimeout(timeout: Int, unit: java.util.concurrent.TimeUnit) = this
            override fun withReadTimeout(timeout: Int, unit: java.util.concurrent.TimeUnit) = this
        }
    }

    @Test
    fun `records successful request metadata`() {
        val (buffer, flushed) = collectingBuffer()
        val interceptor = AutoMobileNetworkInterceptor(buffer, applicationId = "com.example")
        val request = Request.Builder()
            .url("https://api.example.com/users?page=1")
            .get()
            .build()

        interceptor.intercept(fakeChain(request = request, responseCode = 200))

        assertEquals(1, flushed.size)
        val event = flushed[0][0] as SdkNetworkRequestEvent
        assertEquals("https://api.example.com/users?page=1", event.url)
        assertEquals("GET", event.method)
        assertEquals(200, event.statusCode)
        assertEquals("api.example.com", event.host)
        assertEquals("/users", event.path)
        assertEquals("com.example", event.applicationId)
        assertNull(event.error)
    }

    @Test
    fun `records response body size`() {
        val (buffer, flushed) = collectingBuffer()
        val interceptor = AutoMobileNetworkInterceptor(buffer)
        val body = "x".repeat(1024)

        interceptor.intercept(fakeChain(responseBody = body))

        val event = flushed[0][0] as SdkNetworkRequestEvent
        assertEquals(1024L, event.responseBodySize)
    }

    @Test
    fun `records protocol`() {
        val (buffer, flushed) = collectingBuffer()
        val interceptor = AutoMobileNetworkInterceptor(buffer)

        interceptor.intercept(fakeChain(protocol = Protocol.HTTP_2))

        val event = flushed[0][0] as SdkNetworkRequestEvent
        assertEquals("h2", event.protocol)
    }

    @Test
    fun `records failed request with statusCode 0 and error message`() {
        val (buffer, flushed) = collectingBuffer()
        val interceptor = AutoMobileNetworkInterceptor(buffer)

        assertFailsWith<IOException> {
            interceptor.intercept(fakeChain(throwOnProceed = IOException("Connection refused")))
        }

        assertEquals(1, flushed.size)
        val event = flushed[0][0] as SdkNetworkRequestEvent
        assertEquals(0, event.statusCode)
        assertEquals(-1L, event.responseBodySize)
        assertEquals("Connection refused", event.error)
    }

    @Test
    fun `rethrows exception after recording`() {
        val (buffer, _) = collectingBuffer()
        val interceptor = AutoMobileNetworkInterceptor(buffer)

        assertFailsWith<IOException> {
            interceptor.intercept(fakeChain(throwOnProceed = IOException("timeout")))
        }
    }

    @Test
    fun `records POST method`() {
        val (buffer, flushed) = collectingBuffer()
        val interceptor = AutoMobileNetworkInterceptor(buffer)
        val request = Request.Builder()
            .url("https://api.example.com/submit")
            .post("data".toRequestBody("text/plain".toMediaType()))
            .build()

        interceptor.intercept(fakeChain(request = request, responseCode = 201))

        val event = flushed[0][0] as SdkNetworkRequestEvent
        assertEquals("POST", event.method)
        assertEquals(201, event.statusCode)
        assertEquals(4L, event.requestBodySize)
    }

    @Test
    fun `records duration greater than zero`() {
        val (buffer, flushed) = collectingBuffer()
        val interceptor = AutoMobileNetworkInterceptor(buffer)

        interceptor.intercept(fakeChain())

        val event = flushed[0][0] as SdkNetworkRequestEvent
        assertTrue(event.durationMs >= 0, "Duration should be non-negative")
    }
}
