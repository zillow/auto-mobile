package com.automobile.ide.daemon

object McpClientFactory {
  fun create(): AutoMobileClient {
    val httpUrl = readSetting("AUTO_MOBILE_MCP_HTTP_URL", "automobile.mcp.httpUrl")
    if (!httpUrl.isNullOrBlank()) {
      return McpHttpClient(normalizeHttpUrl(httpUrl))
    }

    val stdioCommand = readSetting("AUTO_MOBILE_MCP_STDIO_COMMAND", "automobile.mcp.stdioCommand")
    if (!stdioCommand.isNullOrBlank()) {
      return McpStdioClient(stdioCommand)
    }

    return McpDaemonClient()
  }

  private fun readSetting(envKey: String, propertyKey: String): String? {
    val envValue = System.getenv(envKey)
    if (!envValue.isNullOrBlank()) {
      return envValue
    }
    val propertyValue = System.getProperty(propertyKey)
    return propertyValue?.takeIf { it.isNotBlank() }
  }

  private fun normalizeHttpUrl(raw: String): String {
    val trimmed = raw.trim().removeSuffix("/")
    return when {
      trimmed.endsWith("/auto-mobile/streamable") || trimmed.endsWith("/auto-mobile/sse") -> trimmed
      trimmed.endsWith("/auto-mobile") -> "$trimmed/streamable"
      trimmed.contains("/auto-mobile/") -> trimmed
      else -> "$trimmed/auto-mobile/streamable"
    }
  }
}
