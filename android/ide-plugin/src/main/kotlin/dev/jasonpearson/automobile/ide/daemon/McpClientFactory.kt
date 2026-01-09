package dev.jasonpearson.automobile.ide.daemon

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

  // @deprecated AUTO_MOBILE_MCP_HTTP_URL - use AUTOMOBILE_MCP_HTTP_URL instead
  fun createConfiguredHttp(): McpHttpClient? {
    val httpUrl = readSetting("AUTOMOBILE_MCP_HTTP_URL", "AUTO_MOBILE_MCP_HTTP_URL", "automobile.mcp.httpUrl")
    if (!httpUrl.isNullOrBlank()) {
      return McpHttpClient(normalizeHttpUrl(httpUrl))
    }
    return null
  }

  // @deprecated AUTO_MOBILE_MCP_STDIO_COMMAND - use AUTOMOBILE_MCP_STDIO_COMMAND instead
  fun createConfiguredStdio(): McpStdioClient? {
    val stdioCommand = readSetting("AUTOMOBILE_MCP_STDIO_COMMAND", "AUTO_MOBILE_MCP_STDIO_COMMAND", "automobile.mcp.stdioCommand")
    if (!stdioCommand.isNullOrBlank()) {
      return McpStdioClient(stdioCommand)
    }
    return null
  }

  private fun readSetting(primaryEnvKey: String, deprecatedEnvKey: String, propertyKey: String): String? {
    val primaryEnvValue = System.getenv(primaryEnvKey)
    if (!primaryEnvValue.isNullOrBlank()) {
      return primaryEnvValue
    }
    val deprecatedEnvValue = System.getenv(deprecatedEnvKey)
    if (!deprecatedEnvValue.isNullOrBlank()) {
      return deprecatedEnvValue
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
