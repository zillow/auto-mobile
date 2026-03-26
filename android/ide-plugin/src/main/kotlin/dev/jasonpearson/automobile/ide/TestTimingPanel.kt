package dev.jasonpearson.automobile.ide

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.text.input.rememberTextFieldState
import androidx.compose.foundation.text.input.setTextAndPlaceCursorAtEnd
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.application.ReadAction
import com.intellij.openapi.fileEditor.OpenFileDescriptor
import com.intellij.openapi.project.Project
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.psi.JavaPsiFacade
import com.intellij.psi.PsiElement
import com.intellij.psi.search.GlobalSearchScope
import dev.jasonpearson.automobile.desktop.core.daemon.AutoMobileClient
import dev.jasonpearson.automobile.desktop.core.daemon.McpConnectionException
import dev.jasonpearson.automobile.desktop.core.daemon.TestTimingEntry
import dev.jasonpearson.automobile.desktop.core.daemon.TestTimingOrderBy
import dev.jasonpearson.automobile.desktop.core.daemon.TestTimingOrderDirection
import dev.jasonpearson.automobile.desktop.core.daemon.TestTimingQuery
import dev.jasonpearson.automobile.desktop.core.daemon.TestTimingSummary
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import kotlin.math.roundToInt
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.jetbrains.jewel.foundation.theme.JewelTheme
import org.jetbrains.jewel.ui.component.DefaultButton
import org.jetbrains.jewel.ui.component.Icon
import org.jetbrains.jewel.ui.component.ListComboBox
import org.jetbrains.jewel.ui.component.OutlinedButton
import org.jetbrains.jewel.ui.component.Text
import org.jetbrains.jewel.ui.icon.PathIconKey

@Composable
fun TestTimingPanel(
    project: Project,
    client: AutoMobileClient,
    isConnected: Boolean,
    onShowNavigationGraph: () -> Unit,
) {
  val scope = rememberCoroutineScope()
  var summary by remember { mutableStateOf<TestTimingSummary?>(null) }
  var timings by remember { mutableStateOf<List<TestTimingEntry>>(emptyList()) }
  var status by remember { mutableStateOf("Idle") }
  var error by remember { mutableStateOf<String?>(null) }
  val lookbackDaysText = rememberTextFieldState(DEFAULT_LOOKBACK_DAYS.toString())
  val minSamplesText = rememberTextFieldState(DEFAULT_MIN_SAMPLES.toString())
  val limitText = rememberTextFieldState(DEFAULT_LIMIT.toString())
  val filterText = rememberTextFieldState("")
  var sortKey by remember { mutableStateOf(TestTimingSortKey.AVG_DURATION) }
  var sortDirection by remember { mutableStateOf(TestTimingSortDirection.DESC) }
  var selectedEntry by remember { mutableStateOf<TestTimingEntry?>(null) }
  var autoPollEnabled by remember { mutableStateOf(true) }
  val pollIntervalMs = 5000L
  val palette = rememberTestTimingPalette()
  val navigationIcon = remember {
    PathIconKey("icons/toolWindow.svg", AutoMobileToolWindowFactory::class.java)
  }

  fun parseOptionalInt(label: String, value: String, minValue: Int): Int? {
    val trimmed = value.trim()
    if (trimmed.isEmpty()) {
      return null
    }
    val parsed = trimmed.toIntOrNull()
    if (parsed == null) {
      error = "$label must be a number."
      return null
    }
    if (parsed < minValue) {
      error = "$label must be >= $minValue."
      return null
    }
    return parsed
  }

  suspend fun refreshTestTimings() {
    if (!isConnected) {
      status = "Not connected"
      return
    }

    error = null
    val lookbackDays =
        parseOptionalInt("Lookback days", lookbackDaysText.text.toString(), minValue = 1)
    val minSamples = parseOptionalInt("Min samples", minSamplesText.text.toString(), minValue = 0)
    val limit = parseOptionalInt("Limit", limitText.text.toString(), minValue = 1)
    if (error != null) {
      status = "Invalid input"
      return
    }

    status = "Refreshing..."
    try {
      val query =
          TestTimingQuery(
              lookbackDays = lookbackDays,
              minSamples = minSamples,
              limit = limit,
              orderBy = sortKey.toOrderByOrNull(),
              orderDirection = sortDirection.toOrderDirection(),
          )
      val response = withContext(Dispatchers.IO) { client.getTestTimings(query) }
      summary = response
      timings = response.testTimings
      status = "Updated ${response.testTimings.size} test(s)"
    } catch (e: McpConnectionException) {
      status = "Test timing data unavailable"
      error = e.message
    } catch (e: Exception) {
      status = "Test timing data unavailable"
      error = e.message
    }
  }

  LaunchedEffect(client, isConnected) {
    if (!isConnected) {
      summary = null
      timings = emptyList()
      status = "Not connected"
      error = null
      selectedEntry = null
      return@LaunchedEffect
    }
    refreshTestTimings()
  }

  val queryKey =
      "${lookbackDaysText.text.toString().trim()}:" +
          "${minSamplesText.text.toString().trim()}:" +
          "${limitText.text.toString().trim()}:${sortKey.name}:${sortDirection.name}"

  LaunchedEffect(autoPollEnabled, isConnected, client, queryKey) {
    if (!autoPollEnabled || !isConnected) {
      return@LaunchedEffect
    }
    while (isActive) {
      refreshTestTimings()
      delay(pollIntervalMs)
    }
  }

  val filteredTimings =
      remember(timings, filterText.text, sortKey, sortDirection) {
        val filter = filterText.text.toString().trim().lowercase()
        val filtered =
            if (filter.isBlank()) {
              timings
            } else {
              timings.filter { entry ->
                val combined = "${entry.testClass}.${entry.testMethod}".lowercase()
                entry.testClass.lowercase().contains(filter) ||
                    entry.testMethod.lowercase().contains(filter) ||
                    combined.contains(filter)
              }
            }
        filtered.sortedWith(buildTestTimingComparator(sortKey, sortDirection))
      }

  val maxDuration = filteredTimings.maxOfOrNull { it.averageDurationMs } ?: 0
  val totalSamples = filteredTimings.sumOf { it.sampleSize }
  val totalPassed =
      filteredTimings.sumOf {
        it.statusCounts?.passed ?: (it.successRate * it.sampleSize).roundToInt()
      }
  val overallSuccessRate =
      if (totalSamples > 0) totalPassed.toDouble() / totalSamples.toDouble() else 0.0
  val averageDuration =
      if (filteredTimings.isNotEmpty()) {
        filteredTimings.map { it.averageDurationMs }.average()
      } else {
        0.0
      }

  val sortOptions =
      listOf(
          TestTimingSortOption(TestTimingSortKey.AVG_DURATION, "Avg duration"),
          TestTimingSortOption(TestTimingSortKey.SAMPLE_SIZE, "Runs"),
          TestTimingSortOption(TestTimingSortKey.LAST_RUN, "Last run"),
          TestTimingSortOption(TestTimingSortKey.NAME, "Test name"),
      )
  val sortLabels = sortOptions.map { it.label }
  val selectedSortIndex = sortOptions.indexOfFirst { it.key == sortKey }.coerceAtLeast(0)

  val directionOptions =
      listOf(
          TestTimingDirectionOption(TestTimingSortDirection.DESC, "Desc"),
          TestTimingDirectionOption(TestTimingSortDirection.ASC, "Asc"),
      )
  val directionLabels = directionOptions.map { it.label }
  val selectedDirectionIndex =
      directionOptions.indexOfFirst { it.direction == sortDirection }.coerceAtLeast(0)

  Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
    Text("Test Timings")
    Text("Status: $status")
    if (error != null) {
      Text("Error: ${error ?: ""}", color = palette.error)
    }

    Row(
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
      LabeledTextField(
          label = "Lookback days",
          state = lookbackDaysText,
          modifier = Modifier.width(140.dp),
      )
      LabeledTextField(
          label = "Min samples",
          state = minSamplesText,
          modifier = Modifier.width(120.dp),
      )
      LabeledTextField(
          label = "Limit",
          state = limitText,
          modifier = Modifier.width(100.dp),
      )
      OutlinedButton(onClick = { autoPollEnabled = !autoPollEnabled }) {
        Text(if (autoPollEnabled) "Pause polling" else "Resume polling")
      }
      DefaultButton(onClick = { scope.launch { refreshTestTimings() } }) { Text("Refresh") }
    }

    Row(
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
      LabeledTextField(
          label = "Filter (class/method)",
          state = filterText,
          modifier = Modifier.width(280.dp),
      )
      ListComboBox(
          sortLabels,
          selectedSortIndex,
          { index ->
            sortKey = sortOptions.getOrNull(index)?.key ?: TestTimingSortKey.AVG_DURATION
          },
      )
      ListComboBox(
          directionLabels,
          selectedDirectionIndex,
          { index ->
            sortDirection =
                directionOptions.getOrNull(index)?.direction ?: TestTimingSortDirection.DESC
          },
      )
      OutlinedButton(onClick = { filterText.setTextAndPlaceCursorAtEnd("") }) {
        Text("Clear filter")
      }
    }

    Text(
        "Showing ${filteredTimings.size} tests | " +
            "Samples: $totalSamples | " +
            "Avg duration: ${formatDuration(averageDuration.roundToInt())} | " +
            "Success: ${formatRate(overallSuccessRate)}",
        color = palette.labelMuted,
        fontSize = 11.sp,
    )
    Text("Click a test row to open source.", color = palette.labelMuted, fontSize = 11.sp)

    selectedEntry?.let { entry ->
      Column(
          modifier = Modifier.fillMaxWidth().background(palette.detailBackground).padding(8.dp),
          verticalArrangement = Arrangement.spacedBy(6.dp),
      ) {
        Row(horizontalArrangement = Arrangement.SpaceBetween, modifier = Modifier.fillMaxWidth()) {
          Text("Selected test", color = palette.labelMuted, fontSize = 11.sp)
          OutlinedButton(onClick = onShowNavigationGraph) {
            Row(verticalAlignment = Alignment.CenterVertically) {
              Icon(
                  navigationIcon,
                  contentDescription = "Show navigation graph",
                  modifier = Modifier.width(14.dp).height(14.dp),
              )
              Spacer(modifier = Modifier.width(6.dp))
              Text("Show graph")
            }
          }
        }
        Text(
            "${entry.testClass}.${entry.testMethod}",
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
          Text("Avg: ${formatDuration(entry.averageDurationMs)}")
          Text("Runs: ${entry.sampleSize}")
          Text("Success: ${formatRate(entry.successRate)}")
        }
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
          Text("Std dev: ${entry.stdDevDurationMs?.let { formatDuration(it) } ?: "-"}")
          Text("Last run: ${formatTimestamp(entry.lastRun)}")
          Text("Status: ${formatStatusCounts(entry)}")
        }
      }
    }

    if (filteredTimings.isNotEmpty()) {
      Row(
          modifier = Modifier.fillMaxWidth().padding(vertical = 2.dp),
          horizontalArrangement = Arrangement.spacedBy(8.dp),
      ) {
        HeaderCell("Test", Modifier.weight(TEST_COL_WEIGHT), palette)
        HeaderCell("Avg", Modifier.weight(AVG_COL_WEIGHT), palette)
        HeaderCell("Runs", Modifier.weight(RUNS_COL_WEIGHT), palette)
        HeaderCell("Success", Modifier.weight(SUCCESS_COL_WEIGHT), palette)
        HeaderCell("Last run", Modifier.weight(LAST_RUN_COL_WEIGHT), palette)
      }

      LazyColumn(modifier = Modifier.fillMaxWidth().height(240.dp)) {
        items(filteredTimings, key = { "${it.testClass}#${it.testMethod}" }) { entry ->
          TestTimingRow(
              entry = entry,
              maxDuration = maxDuration,
              palette = palette,
              onOpen = {
                selectedEntry = entry
                navigateToTest(project, entry) { message -> error = message }
              },
          )
        }
      }
    } else {
      Text("No test timing data available.", color = palette.labelMuted)
    }
  }
}

@Composable
private fun HeaderCell(text: String, modifier: Modifier, palette: TestTimingPalette) {
  Text(
      text = text,
      color = palette.labelMuted,
      fontSize = 11.sp,
      maxLines = 1,
      overflow = TextOverflow.Ellipsis,
      modifier = modifier,
  )
}

@Composable
private fun TestTimingRow(
    entry: TestTimingEntry,
    maxDuration: Int,
    palette: TestTimingPalette,
    onOpen: () -> Unit,
) {
  val durationRatio =
      if (maxDuration > 0) {
        (entry.averageDurationMs.toFloat() / maxDuration.toFloat()).coerceIn(0f, 1f)
      } else {
        0f
      }
  val successColor =
      when {
        entry.successRate < 0.9 -> palette.error
        entry.successRate < 0.97 -> palette.warning
        else -> Color.Unspecified
      }

  Row(
      modifier = Modifier.fillMaxWidth().clickable(onClick = onOpen).padding(vertical = 4.dp),
      verticalAlignment = Alignment.CenterVertically,
      horizontalArrangement = Arrangement.spacedBy(8.dp),
  ) {
    Text(
        text = "${entry.testClass}.${entry.testMethod}",
        maxLines = 1,
        overflow = TextOverflow.Ellipsis,
        modifier = Modifier.weight(TEST_COL_WEIGHT),
    )
    Column(modifier = Modifier.weight(AVG_COL_WEIGHT)) {
      Text(formatDuration(entry.averageDurationMs), fontSize = 12.sp)
      Spacer(modifier = Modifier.height(4.dp))
      Row(modifier = Modifier.fillMaxWidth().height(6.dp).background(palette.barTrack)) {
        Spacer(modifier = Modifier.fillMaxWidth(durationRatio).background(palette.barFill))
      }
    }
    Text(
        text = entry.sampleSize.toString(),
        modifier = Modifier.weight(RUNS_COL_WEIGHT),
    )
    Text(
        text = formatRate(entry.successRate),
        color = successColor,
        modifier = Modifier.weight(SUCCESS_COL_WEIGHT),
    )
    Text(
        text = formatTimestamp(entry.lastRun),
        modifier = Modifier.weight(LAST_RUN_COL_WEIGHT),
    )
  }
}

private fun buildTestTimingComparator(
    key: TestTimingSortKey,
    direction: TestTimingSortDirection,
): Comparator<TestTimingEntry> {
  val comparator =
      when (key) {
        TestTimingSortKey.NAME ->
            compareBy<TestTimingEntry> { it.testClass.lowercase() }
                .thenBy { it.testMethod.lowercase() }
        TestTimingSortKey.AVG_DURATION ->
            compareBy<TestTimingEntry> { it.averageDurationMs }.thenBy { it.testClass.lowercase() }
        TestTimingSortKey.SAMPLE_SIZE ->
            compareBy<TestTimingEntry> { it.sampleSize }.thenBy { it.testClass.lowercase() }
        TestTimingSortKey.LAST_RUN ->
            compareBy<TestTimingEntry> { it.lastRunTimestampMs ?: 0L }
                .thenBy { it.testClass.lowercase() }
      }

  return if (direction == TestTimingSortDirection.DESC) comparator.reversed() else comparator
}

private fun TestTimingSortKey.toOrderByOrNull(): TestTimingOrderBy? =
    when (this) {
      TestTimingSortKey.AVG_DURATION -> TestTimingOrderBy.AVERAGE_DURATION
      TestTimingSortKey.SAMPLE_SIZE -> TestTimingOrderBy.SAMPLE_SIZE
      TestTimingSortKey.LAST_RUN -> TestTimingOrderBy.LAST_RUN
      TestTimingSortKey.NAME -> null
    }

private fun TestTimingSortDirection.toOrderDirection(): TestTimingOrderDirection =
    if (this == TestTimingSortDirection.ASC) {
      TestTimingOrderDirection.ASC
    } else {
      TestTimingOrderDirection.DESC
    }

private fun navigateToTest(
    project: Project,
    entry: TestTimingEntry,
    onError: (String) -> Unit,
) {
  val target = resolveNavigationTarget(project, entry)
  if (target == null) {
    onError("Test source not found for ${entry.testClass}.${entry.testMethod}")
    return
  }

  ApplicationManager.getApplication().invokeLater {
    OpenFileDescriptor(project, target.file, target.offset).navigate(true)
  }
}

private data class NavigationTarget(val file: VirtualFile, val offset: Int)

private fun resolveNavigationTarget(project: Project, entry: TestTimingEntry): NavigationTarget? {
  return ReadAction.compute<NavigationTarget?, RuntimeException> {
    val psiClass =
        JavaPsiFacade.getInstance(project)
            .findClass(entry.testClass, GlobalSearchScope.projectScope(project))
            ?: return@compute null
    val methodName = normalizeTestMethodName(entry.testMethod)
    val psiMethod = psiClass.findMethodsByName(methodName, false).firstOrNull()
    val element: PsiElement = psiMethod ?: psiClass
    val file = element.containingFile?.virtualFile ?: return@compute null
    NavigationTarget(file, element.textOffset)
  }
}

private fun normalizeTestMethodName(value: String): String {
  val trimmed = value.trim()
  if (trimmed.isEmpty()) {
    return trimmed
  }
  val bracketIndex = trimmed.indexOf('[')
  val parenIndex = trimmed.indexOf('(')
  val cutIndex = listOf(bracketIndex, parenIndex).filter { it >= 0 }.minOrNull()
  return if (cutIndex != null) trimmed.substring(0, cutIndex) else trimmed
}

private fun formatDuration(durationMs: Int): String {
  if (durationMs >= 1000) {
    return "${"%.2f".format(durationMs / 1000.0)}s"
  }
  return "${durationMs}ms"
}

private fun formatRate(rate: Double): String {
  return "${"%.1f".format(rate * 100)}%"
}

private fun formatTimestamp(value: String?): String {
  if (value.isNullOrBlank()) {
    return "-"
  }
  return try {
    val instant = Instant.parse(value)
    TIMESTAMP_FORMATTER.format(instant.atZone(ZoneId.systemDefault()))
  } catch (_: Exception) {
    value
  }
}

private data class TestTimingSortOption(val key: TestTimingSortKey, val label: String)

private data class TestTimingDirectionOption(
    val direction: TestTimingSortDirection,
    val label: String,
)

private enum class TestTimingSortKey {
  NAME,
  AVG_DURATION,
  SAMPLE_SIZE,
  LAST_RUN,
}

private enum class TestTimingSortDirection {
  ASC,
  DESC,
}

private data class TestTimingPalette(
    val barFill: Color,
    val barTrack: Color,
    val labelMuted: Color,
    val detailBackground: Color,
    val warning: Color,
    val error: Color,
)

@Composable
private fun rememberTestTimingPalette(): TestTimingPalette {
  val globals = JewelTheme.globalColors
  return TestTimingPalette(
      barFill = globals.text.info.copy(alpha = 0.9f),
      barTrack = globals.outlines.focused.copy(alpha = 0.2f),
      labelMuted = globals.text.normal.copy(alpha = 0.65f),
      detailBackground = globals.panelBackground.copy(alpha = 0.65f),
      warning = globals.text.warning,
      error = globals.text.error,
  )
}

private const val DEFAULT_LOOKBACK_DAYS = 90
private const val DEFAULT_MIN_SAMPLES = 1
private const val DEFAULT_LIMIT = 1000
private const val TEST_COL_WEIGHT = 0.48f
private const val AVG_COL_WEIGHT = 0.18f
private const val RUNS_COL_WEIGHT = 0.08f
private const val SUCCESS_COL_WEIGHT = 0.1f
private const val LAST_RUN_COL_WEIGHT = 0.16f
private val TIMESTAMP_FORMATTER: DateTimeFormatter = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm")

private fun formatStatusCounts(entry: TestTimingEntry): String {
  val counts = entry.statusCounts ?: return "-"
  return "P:${counts.passed} F:${counts.failed} S:${counts.skipped}"
}
