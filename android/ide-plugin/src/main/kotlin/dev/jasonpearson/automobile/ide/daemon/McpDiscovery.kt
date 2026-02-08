package dev.jasonpearson.automobile.ide.daemon

import java.net.URI
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpResponse
import java.nio.file.Path
import java.time.Duration
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.withContext
import kotlinx.serialization.Serializable
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.json.Json

@Serializable
data class McpHealthUptime(
    val ms: Long? = null,
    val human: String? = null,
)

@Serializable
data class McpHealthResponse(
    val status: String? = null,
    val server: String? = null,
    val version: String? = null,
    val instanceId: String? = null,
    val port: Int? = null,
    val branch: String? = null,
    val uptime: McpHealthUptime? = null,
    val activeSessions: Int? = null,
    val transport: String? = null,
)

data class GitWorktree(
    val path: String,
    val branch: String? = null,
)

data class McpHttpServer(
    val endpoint: String,
    val health: McpHealthResponse,
)

data class McpServerOption(
    val id: String,
    val label: String,
    val server: McpHttpServer?,
    val worktree: GitWorktree?,
)

data class McpDiscoverySnapshot(
    val options: List<McpServerOption>,
    val servers: List<McpHttpServer>,
    val worktrees: List<GitWorktree>,
) {
  companion object {
    fun empty(): McpDiscoverySnapshot = McpDiscoverySnapshot(emptyList(), emptyList(), emptyList())
  }
}

interface WorktreeLister {
  suspend fun listWorktrees(projectBasePath: String?): List<GitWorktree>
}

interface PortScanner {
  suspend fun scanListeningPorts(): Set<Int>
}

interface HealthProbe {
  suspend fun probeHealth(port: Int): McpHealthResponse?
}

class McpHttpDiscovery(
    private val worktreeLister: WorktreeLister = GitWorktreeLister(),
    private val portScanner: PortScanner = DefaultPortScanner(),
    private val healthProbe: HealthProbe = HttpHealthProbe(),
) {
  suspend fun discover(projectBasePath: String?): McpDiscoverySnapshot = coroutineScope {
    val worktrees = worktreeLister.listWorktrees(projectBasePath)
    val ports = portScanner.scanListeningPorts()
    val servers =
        ports.map { port -> async(Dispatchers.IO) { probePort(port) } }.awaitAll().filterNotNull()

    val options = buildOptions(worktrees, servers)
    McpDiscoverySnapshot(options, servers, worktrees)
  }

  private fun buildOptions(
      worktrees: List<GitWorktree>,
      servers: List<McpHttpServer>,
  ): List<McpServerOption> {
    val remainingServers = servers.toMutableList()
    val options = mutableListOf<McpServerOption>()

    for (worktree in worktrees) {
      val server =
          worktree.branch?.let { branch ->
            remainingServers.firstOrNull { it.health.branch == branch }
          }
      if (server != null) {
        remainingServers.remove(server)
      }
      options.add(
          McpServerOption(
              id = "worktree:${worktree.path}",
              label = buildWorktreeLabel(worktree, server),
              server = server,
              worktree = worktree,
          )
      )
    }

    for (server in remainingServers) {
      options.add(
          McpServerOption(
              id = "server:${server.health.port ?: server.endpoint}",
              label = buildServerLabel(server),
              server = server,
              worktree = null,
          )
      )
    }

    return options
  }

  private fun buildWorktreeLabel(worktree: GitWorktree, server: McpHttpServer?): String {
    val branch = worktree.branch ?: "(detached)"
    val pathHint = Path.of(worktree.path).fileName?.toString() ?: worktree.path
    val serverHint = server?.let { formatServerHint(it) } ?: "no server"
    return "$branch | $pathHint | $serverHint"
  }

  private fun buildServerLabel(server: McpHttpServer): String {
    val branch = server.health.branch ?: "unknown branch"
    return "server | $branch | ${formatServerHint(server)}"
  }

  private fun formatServerHint(server: McpHttpServer): String {
    val port = server.health.port ?: extractPort(server.endpoint)
    val transport = server.health.transport ?: "http"
    val sessions = server.health.activeSessions?.toString() ?: "?"
    return "${transport}:$port | sessions=$sessions"
  }

  private fun extractPort(endpoint: String): Int? {
    return try {
      val uri = URI.create(endpoint)
      if (uri.port > 0) uri.port else null
    } catch (_: Exception) {
      null
    }
  }

  private suspend fun probePort(port: Int): McpHttpServer? {
    val health = healthProbe.probeHealth(port) ?: return null
    if (health.server != "AutoMobile") {
      return null
    }
    val resolvedPort = health.port ?: port
    val endpoint = "http://localhost:$resolvedPort/auto-mobile/streamable"
    return McpHttpServer(endpoint, health)
  }
}

class GitWorktreeLister : WorktreeLister {
  override suspend fun listWorktrees(projectBasePath: String?): List<GitWorktree> =
      withContext(Dispatchers.IO) {
        if (projectBasePath.isNullOrBlank()) {
          return@withContext emptyList()
        }

        val output =
            runProcess(listOf("git", "worktree", "list", "--porcelain"), projectBasePath)
                ?: return@withContext emptyList()

        val worktrees = mutableListOf<GitWorktree>()
        var currentPath: String? = null
        var currentBranch: String? = null

        for (line in output.lineSequence()) {
          when {
            line.startsWith("worktree ") -> {
              if (currentPath != null) {
                worktrees.add(GitWorktree(currentPath!!, currentBranch))
              }
              currentPath = line.removePrefix("worktree ").trim()
              currentBranch = null
            }
            line.startsWith("branch ") -> {
              val branchRef = line.removePrefix("branch ").trim()
              currentBranch = branchRef.removePrefix("refs/heads/")
            }
            line.isBlank() -> {
              if (currentPath != null) {
                worktrees.add(GitWorktree(currentPath!!, currentBranch))
                currentPath = null
                currentBranch = null
              }
            }
          }
        }

        if (currentPath != null) {
          worktrees.add(GitWorktree(currentPath!!, currentBranch))
        }

        worktrees
      }

  private fun runProcess(command: List<String>, workingDir: String): String? {
    return try {
      val process =
          ProcessBuilder(command)
              .directory(java.io.File(workingDir))
              .redirectErrorStream(true)
              .start()
      val completed = process.waitFor(3, TimeUnit.SECONDS)
      if (!completed) {
        process.destroy()
        return null
      }
      if (process.exitValue() != 0) {
        return null
      }
      process.inputStream.bufferedReader().readText()
    } catch (_: Exception) {
      null
    }
  }
}

interface PortCommandRunner {
  fun runCommand(command: List<String>): String?
}

class SystemPortCommandRunner : PortCommandRunner {
  override fun runCommand(command: List<String>): String? {
    return try {
      val process = ProcessBuilder(command).redirectErrorStream(true).start()
      val completed = process.waitFor(2, TimeUnit.SECONDS)
      if (!completed) {
        process.destroy()
        return null
      }
      if (process.exitValue() != 0) {
        return null
      }
      process.inputStream.bufferedReader().readText()
    } catch (_: Exception) {
      null
    }
  }
}

interface PlatformInfo {
  val osName: String
}

object SystemPlatformInfo : PlatformInfo {
  override val osName: String
    get() = System.getProperty("os.name", "").lowercase()
}

class DefaultPortScanner(
    private val commandRunner: PortCommandRunner = SystemPortCommandRunner(),
    private val platformInfo: PlatformInfo = SystemPlatformInfo,
) : PortScanner {
  override suspend fun scanListeningPorts(): Set<Int> = coroutineScope {
    val osName = platformInfo.osName
    val commands = buildCommandList(osName)

    val outputs = commands
        .map { cmd -> async(Dispatchers.IO) { commandRunner.runCommand(cmd) } }
        .awaitAll()
        .filterNotNull()

    outputs.flatMap { parsePorts(it) }.toSet()
  }

  internal fun buildCommandList(osName: String): List<List<String>> {
    return if (osName.contains("win")) {
      listOf(listOf("netstat", "-ano", "-p", "tcp"))
    } else {
      val commands = mutableListOf(
          listOf("lsof", "-iTCP", "-sTCP:LISTEN", "-n", "-P"),
      )
      // ss is not available on macOS — skip it to avoid a 2s timeout
      if (!osName.contains("mac") && !osName.contains("darwin")) {
        commands.add(listOf("ss", "-ltn"))
      }
      commands.add(listOf("netstat", "-an"))
      commands
    }
  }

  internal fun parsePorts(output: String): List<Int> {
    val ports = mutableListOf<Int>()
    val listenRegex = Regex(":(\\d+)(?:\\s|\\)|$)")
    for (line in output.lineSequence()) {
      if (!line.contains("LISTEN", ignoreCase = true)) {
        continue
      }
      val match = listenRegex.findAll(line).lastOrNull() ?: continue
      val port = match.groupValues.getOrNull(1)?.toIntOrNull() ?: continue
      if (port in 1..65535) {
        ports.add(port)
      }
    }
    return ports
  }
}

class HttpHealthProbe(
    private val json: Json = Json { ignoreUnknownKeys = true },
    private val httpClient: HttpClient =
        HttpClient.newBuilder().connectTimeout(Duration.ofMillis(800)).build(),
) : HealthProbe {
  override suspend fun probeHealth(port: Int): McpHealthResponse? {
    val urls =
        listOf(
            "http://localhost:$port/health",
            "http://localhost:$port/auto-mobile/health",
        )
    for (url in urls) {
      val health = requestHealth(url) ?: continue
      return health
    }
    return null
  }

  private suspend fun requestHealth(url: String): McpHealthResponse? =
      withContext(Dispatchers.IO) {
        try {
          val request =
              HttpRequest.newBuilder(URI.create(url)).timeout(Duration.ofMillis(800)).GET().build()
          val response = httpClient.send(request, HttpResponse.BodyHandlers.ofString())
          if (response.statusCode() != 200) {
            return@withContext null
          }
          val body = response.body().trim()
          if (body.isEmpty()) {
            return@withContext null
          }
          json.decodeFromString(McpHealthResponse.serializer(), body)
        } catch (_: Exception) {
          null
        }
      }
}
