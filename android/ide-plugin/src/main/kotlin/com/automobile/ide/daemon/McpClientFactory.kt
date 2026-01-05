package com.automobile.ide.daemon

object McpClientFactory {
  fun createPreferred(httpServer: McpHttpServer?): AutoMobileClient {
    if (httpServer != null) {
      return McpHttpClient(httpServer.endpoint)
    }

    val configuredHttp = createConfiguredHttp()
    if (configuredHttp != null) {
      return configuredHttp
    }

    val configuredStdio = createConfiguredStdio()
    if (configuredStdio != null) {
      return configuredStdio
    }

    return McpDaemonClient()
  }

  fun createConfiguredHttp(): McpHttpClient? {
    val httpUrl = readSetting("AUTO_MOBILE_MCP_HTTP_URL", "automobile.mcp.httpUrl")
    if (!httpUrl.isNullOrBlank()) {
      return McpHttpClient(normalizeHttpUrl(httpUrl))
    }
    return null
  }

  fun createConfiguredStdio(): McpStdioClient? {
    val stdioCommand = readSetting("AUTO_MOBILE_MCP_STDIO_COMMAND", "automobile.mcp.stdioCommand")
    if (!stdioCommand.isNullOrBlank()) {
      return McpStdioClient(stdioCommand)
    }
    return null
  }

  private fun readSetting(envKey: String, propertyKey: String): String? {
    val envValue = System.getenv(envKey)
    if (!envValue.isNullOrBlank()) {
      return envValue
    }
    val propertyValue = System.getProperty(propertyKey)
    return propertyValue?.takeIf { it.isNotBlank() }
  }

  fun normalizeHttpUrl(raw: String): String {
    val trimmed = raw.trim().removeSuffix("/")
    return when {
      trimmed.endsWith("/auto-mobile/streamable") || trimmed.endsWith("/auto-mobile/sse") -> trimmed
      trimmed.endsWith("/auto-mobile") -> "$trimmed/streamable"
      trimmed.contains("/auto-mobile/") -> trimmed
      else -> "$trimmed/auto-mobile/streamable"
    }
  }
}
