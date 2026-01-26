package dev.jasonpearson.automobile.ide.daemon

/**
 * Fake implementation of WorktreeLister for testing. Returns configurable worktrees and tracks
 * calls.
 */
class FakeWorktreeLister : WorktreeLister {
  private val _listWorktreesCalls = mutableListOf<String?>()

  var worktreesToReturn: List<GitWorktree> = emptyList()

  val listWorktreesCalls: List<String?>
    get() = _listWorktreesCalls

  override suspend fun listWorktrees(projectBasePath: String?): List<GitWorktree> {
    _listWorktreesCalls.add(projectBasePath)
    return worktreesToReturn
  }

  fun reset() {
    _listWorktreesCalls.clear()
    worktreesToReturn = emptyList()
  }
}

/**
 * Fake implementation of PortScanner for testing. Returns configurable ports and tracks calls.
 */
class FakePortScanner : PortScanner {
  private val _scanListeningPortsCalls = mutableListOf<Unit>()

  var portsToReturn: Set<Int> = emptySet()

  val scanListeningPortsCalls: Int
    get() = _scanListeningPortsCalls.size

  override suspend fun scanListeningPorts(): Set<Int> {
    _scanListeningPortsCalls.add(Unit)
    return portsToReturn
  }

  fun reset() {
    _scanListeningPortsCalls.clear()
    portsToReturn = emptySet()
  }
}

/**
 * Fake implementation of HealthProbe for testing. Returns configurable health responses per port
 * and tracks calls.
 */
class FakeHealthProbe : HealthProbe {
  private val _probeHealthCalls = mutableListOf<Int>()

  var healthResponsesByPort: Map<Int, McpHealthResponse?> = emptyMap()
  var defaultHealthResponse: McpHealthResponse? = null

  val probeHealthCalls: List<Int>
    get() = _probeHealthCalls

  override suspend fun probeHealth(port: Int): McpHealthResponse? {
    _probeHealthCalls.add(port)
    return healthResponsesByPort[port] ?: defaultHealthResponse
  }

  fun reset() {
    _probeHealthCalls.clear()
    healthResponsesByPort = emptyMap()
    defaultHealthResponse = null
  }
}
