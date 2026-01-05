package com.automobile.ide.daemon

import java.net.URI
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpResponse
import java.util.UUID
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.decodeFromJsonElement
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put

class McpHttpClient(
    private val endpoint: String,
    private val json: Json = Json { ignoreUnknownKeys = true },
) : AutoMobileClient {
  override val transportName: String = "MCP HTTP"
  override val connectionDescription: String = endpoint

  private val httpClient = HttpClient.newBuilder().build()
  private var sessionId: String? = null
  private var protocolVersion: String? = null
  private var initialized = false

  override fun ping() {
    ensureInitialized()
  }

  override fun listResources(): List<McpResource> {
    ensureInitialized()
    val response = sendRequest("resources/list")
    val result = json.decodeFromJsonElement(ListResourcesResult.serializer(), response.result!!)
    return result.resources
  }

  override fun listResourceTemplates(): List<McpResourceTemplate> {
    ensureInitialized()
    val response = sendRequest("resources/list-templates")
    val result =
        json.decodeFromJsonElement(ListResourceTemplatesResult.serializer(), response.result!!)
    return result.resourceTemplates
  }

  override fun readResource(uri: String): List<McpResourceContent> {
    ensureInitialized()
    val response =
        sendRequest(
            "resources/read",
            buildJsonObject { put("uri", JsonPrimitive(uri)) },
        )
    val result = json.decodeFromJsonElement(ReadResourceResult.serializer(), response.result!!)
    return result.contents
  }

  override fun getNavigationGraph(platform: String): JsonElement {
    ensureInitialized()
    val response =
        sendRequest(
            "tools/call",
            buildJsonObject {
              put("name", JsonPrimitive("getNavigationGraph"))
              put("arguments", buildJsonObject { put("platform", JsonPrimitive(platform)) })
            },
        )
    return response.result ?: JsonObject(emptyMap())
  }

  private fun ensureInitialized() {
    if (initialized) {
      return
    }

    val response =
        sendRequest(
            "initialize",
            buildJsonObject {
              put("protocolVersion", JsonPrimitive(LATEST_MCP_PROTOCOL_VERSION))
              put("capabilities", JsonObject(emptyMap()))
              put(
                  "clientInfo",
                  buildJsonObject {
                    put("name", JsonPrimitive("auto-mobile-ide-plugin"))
                    put("version", JsonPrimitive("0.1.0"))
                  },
              )
            },
            includeSession = false,
        )

    val result =
        response.result?.jsonObject
            ?: throw McpConnectionException("Initialize response missing result")
    protocolVersion =
        result["protocolVersion"]?.jsonPrimitive?.content ?: LATEST_MCP_PROTOCOL_VERSION
    initialized = true

    sendNotification("notifications/initialized")
  }

  private fun sendNotification(method: String, params: JsonElement? = null) {
    val request =
        JsonRpcRequest(
            id = null,
            method = method,
            params = params,
        )
    sendRequest(request, includeSession = true, expectResponse = false)
  }

  private fun sendRequest(
      method: String,
      params: JsonElement? = null,
      includeSession: Boolean = true,
  ): JsonRpcResponse {
    val requestId = JsonPrimitive(UUID.randomUUID().toString())
    val request =
        JsonRpcRequest(
            id = requestId,
            method = method,
            params = params,
        )
    return sendRequest(request, includeSession = includeSession, expectResponse = true)
  }

  private fun sendRequest(
      request: JsonRpcRequest,
      includeSession: Boolean,
      expectResponse: Boolean,
  ): JsonRpcResponse {
    val requestBody = json.encodeToString(JsonRpcRequest.serializer(), request)
    val builder =
        HttpRequest.newBuilder(URI.create(endpoint)).header("Content-Type", "application/json")

    if (includeSession && sessionId != null) {
      builder.header("mcp-session-id", sessionId!!)
    }
    if (protocolVersion != null) {
      builder.header("mcp-protocol-version", protocolVersion!!)
    }

    val response =
        httpClient.send(
            builder.POST(HttpRequest.BodyPublishers.ofString(requestBody)).build(),
            HttpResponse.BodyHandlers.ofString(),
        )

    response.headers().firstValue("mcp-session-id").ifPresent { header ->
      if (header.isNotBlank()) {
        sessionId = header
      }
    }

    if (!expectResponse) {
      return JsonRpcResponse(jsonrpc = "2.0")
    }

    val body = response.body().trim()
    if (body.isEmpty()) {
      throw McpConnectionException("MCP HTTP response was empty")
    }

    val rpcResponse = json.decodeFromString(JsonRpcResponse.serializer(), body)
    if (rpcResponse.error != null) {
      throw McpConnectionException(
          "MCP HTTP error ${rpcResponse.error.code}: ${rpcResponse.error.message}"
      )
    }
    if (rpcResponse.result == null) {
      throw McpConnectionException("MCP HTTP response missing result")
    }
    return rpcResponse
  }
}
