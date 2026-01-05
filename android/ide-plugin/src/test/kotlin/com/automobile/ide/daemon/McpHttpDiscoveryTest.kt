package com.automobile.ide.daemon

import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlinx.coroutines.runBlocking
import org.junit.Test

class McpHttpDiscoveryTest {
  @Test
  fun mapsServersToWorktreesByBranch() {
    runBlocking {
      val worktrees =
          listOf(
              GitWorktree(path = "/worktrees/work-246", branch = "work/246"),
              GitWorktree(path = "/worktrees/main", branch = "main"),
          )
      val ports = setOf(9164, 9000)
      val probe =
          FakeHealthProbe(
              mapOf(
                  9164 to
                      McpHealthResponse(server = "AutoMobile", port = 9164, branch = "work/246"),
                  9000 to McpHealthResponse(server = "AutoMobile", port = 9000, branch = "main"),
              )
          )

      val discovery =
          McpHttpDiscovery(
              worktreeLister = FakeWorktreeLister(worktrees),
              portScanner = FakePortScanner(ports),
              healthProbe = probe,
          )

      val snapshot = discovery.discover("/worktrees")

      assertEquals(2, snapshot.options.size)
      val first = snapshot.options[0]
      assertEquals("/worktrees/work-246", first.worktree?.path)
      assertNotNull(first.server)
      assertEquals("http://localhost:9164/auto-mobile/streamable", first.server?.endpoint)

      val second = snapshot.options[1]
      assertEquals("/worktrees/main", second.worktree?.path)
      assertNotNull(second.server)
      assertEquals("http://localhost:9000/auto-mobile/streamable", second.server?.endpoint)
    }
  }

  @Test
  fun addsUnmatchedServersAfterWorktrees() {
    runBlocking {
      val worktrees =
          listOf(
              GitWorktree(path = "/worktrees/feature", branch = "feature"),
          )
      val ports = setOf(9100)
      val probe =
          FakeHealthProbe(
              mapOf(
                  9100 to McpHealthResponse(server = "AutoMobile", port = 9100, branch = "other"),
              )
          )

      val discovery =
          McpHttpDiscovery(
              worktreeLister = FakeWorktreeLister(worktrees),
              portScanner = FakePortScanner(ports),
              healthProbe = probe,
          )

      val snapshot = discovery.discover("/worktrees")

      assertEquals(2, snapshot.options.size)
      assertEquals("/worktrees/feature", snapshot.options[0].worktree?.path)
      assertNull(snapshot.options[0].server)
      assertNull(snapshot.options[1].worktree)
      assertNotNull(snapshot.options[1].server)
    }
  }

  @Test
  fun usesHealthPortWhenProvided() {
    runBlocking {
      val worktrees = listOf(GitWorktree(path = "/worktrees/work-500", branch = "work/500"))
      val ports = setOf(9100)
      val probe =
          FakeHealthProbe(
              mapOf(
                  9100 to
                      McpHealthResponse(server = "AutoMobile", port = 9200, branch = "work/500"),
              )
          )

      val discovery =
          McpHttpDiscovery(
              worktreeLister = FakeWorktreeLister(worktrees),
              portScanner = FakePortScanner(ports),
              healthProbe = probe,
          )

      val snapshot = discovery.discover("/worktrees")

      val option = snapshot.options.first()
      assertNotNull(option.server)
      assertEquals("http://localhost:9200/auto-mobile/streamable", option.server?.endpoint)
    }
  }
}

private class FakeWorktreeLister(
    private val worktrees: List<GitWorktree>,
) : WorktreeLister {
  override suspend fun listWorktrees(projectBasePath: String?): List<GitWorktree> = worktrees
}

private class FakePortScanner(
    private val ports: Set<Int>,
) : PortScanner {
  override suspend fun scanListeningPorts(): Set<Int> = ports
}

private class FakeHealthProbe(
    private val responses: Map<Int, McpHealthResponse?>,
) : HealthProbe {
  override suspend fun probeHealth(port: Int): McpHealthResponse? = responses[port]
}
