package dev.jasonpearson.automobile.ide.graph

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.lerp
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import org.jetbrains.jewel.foundation.theme.JewelTheme
import org.jetbrains.jewel.ui.component.Text
import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.roundToInt
import kotlin.math.sin
import kotlin.math.sqrt

@Composable
fun NavigationGraphView(
    summary: NavigationGraphSummary?,
    recentTransitions: List<RecentTransition>,
    modifier: Modifier = Modifier,
    errorMessage: String? = null,
) {
  val palette = rememberGraphPalette()
  val shape = RoundedCornerShape(12.dp)

  Box(
      modifier =
          modifier
              .background(palette.background, shape)
              .border(1.dp, palette.border, shape)
              .padding(8.dp)
  ) {
    if (summary == null || summary.nodes.isEmpty()) {
      Text(
          text = "No navigation graph data yet.",
          color = palette.labelMuted,
          fontSize = 12.sp,
          modifier = Modifier.align(Alignment.CenterStart).padding(8.dp),
      )
    } else {
      GraphCanvas(summary, recentTransitions, palette, Modifier.fillMaxSize())
    }

    if (!errorMessage.isNullOrBlank()) {
      Text(
          text = errorMessage,
          color = palette.error,
          fontSize = 11.sp,
          maxLines = 2,
          overflow = TextOverflow.Ellipsis,
          modifier = Modifier.align(Alignment.BottomStart).padding(6.dp),
      )
    }
  }
}

@Composable
fun NavigationGraphLegend(modifier: Modifier = Modifier) {
  val palette = rememberGraphPalette()
  Row(modifier = modifier, verticalAlignment = Alignment.CenterVertically) {
    LegendItem(palette, color = palette.nodeCurrentStroke, label = "Current screen")
    LegendSpacer()
    LegendItem(palette, color = palette.edgeHistory, label = "Recent transitions")
    LegendSpacer()
    LegendItem(palette, color = palette.edgeDefault, label = "Other edges")
  }
}

@Composable
private fun LegendItem(palette: GraphPalette, color: Color, label: String) {
  Row(verticalAlignment = Alignment.CenterVertically) {
    Box(
        modifier =
            Modifier
                .size(10.dp)
                .background(color, CircleShape)
    )
    Text(
        text = label,
        color = palette.labelMuted,
        fontSize = 11.sp,
        modifier = Modifier.padding(start = 6.dp, end = 8.dp),
    )
  }
}

@Composable
private fun LegendSpacer() {
  Box(modifier = Modifier.size(6.dp))
}

@Composable
private fun GraphCanvas(
    summary: NavigationGraphSummary,
    recentTransitions: List<RecentTransition>,
    palette: GraphPalette,
    modifier: Modifier = Modifier,
) {
  BoxWithConstraints(modifier = modifier) {
    val density = LocalDensity.current
    val size =
        with(density) {
          IntSize(maxWidth.roundToPx(), maxHeight.roundToPx())
        }
    val baseRadiusPx = with(density) { 16.dp.toPx() }
    val paddingPx = with(density) { 32.dp.toPx() }
    val layout =
        remember(summary, size) {
          computeGraphLayout(
              summary,
              size,
              baseRadiusPx = baseRadiusPx,
              paddingPx = paddingPx,
          )
        }

    val historyById =
        remember(recentTransitions) {
          val ranks = mutableMapOf<Int, Int>()
          recentTransitions.forEachIndexed { index, transition ->
            transition.edgeId?.let { edgeId -> ranks[edgeId] = index }
          }
          ranks
        }
    val historyByEdge =
        remember(recentTransitions) {
          val ranks = mutableMapOf<ScreenEdgeKey, Int>()
          recentTransitions.forEachIndexed { index, transition ->
            ranks[ScreenEdgeKey(transition.from, transition.to)] = index
          }
          ranks
        }
    val historyNodes =
        remember(recentTransitions) {
          recentTransitions.flatMap { listOf(it.from, it.to) }.toSet()
        }

    Canvas(modifier = Modifier.fillMaxSize()) {
      drawEdges(summary, layout, palette, historyById, historyByEdge, recentTransitions.size)
      drawNodes(summary, layout, palette, historyNodes)
    }

    if (layout.nodeLayouts.isNotEmpty()) {
      val labelMaxWidthPx = with(density) { 140.dp.toPx() }
      val labelHeightPx = with(density) { 16.dp.toPx() }
      layout.nodeLayouts.values.forEach { nodeLayout ->
        val label =
            if (nodeLayout.node.visitCount > 1) {
              "${nodeLayout.node.screenName} (${nodeLayout.node.visitCount})"
            } else {
              nodeLayout.node.screenName
            }
        val isCurrent = nodeLayout.node.screenName == summary.currentScreen
        val isHistory = historyNodes.contains(nodeLayout.node.screenName)
        val labelColor =
            when {
              isCurrent -> palette.nodeCurrentStroke
              isHistory -> palette.edgeHistory
              else -> palette.label
            }

        val widthPx = size.width.toFloat()
        val heightPx = size.height.toFloat()
        val placeLeft = nodeLayout.center.x > widthPx * 0.6f
        val rawX =
            if (placeLeft) {
              nodeLayout.center.x - nodeLayout.radius - 8f - labelMaxWidthPx
            } else {
              nodeLayout.center.x + nodeLayout.radius + 8f
            }
        val maxX = (widthPx - labelMaxWidthPx - 4f).coerceAtLeast(4f)
        val maxY = (heightPx - labelHeightPx - 4f).coerceAtLeast(4f)
        val x = rawX.coerceIn(4f, maxX)
        val y =
            (nodeLayout.center.y - nodeLayout.radius - 6f)
                .coerceIn(4f, maxY)

        Text(
            text = label,
            color = labelColor,
            fontSize = 11.sp,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier =
                Modifier
                    .offset { IntOffset(x.roundToInt(), y.roundToInt()) }
                    .widthIn(max = 140.dp),
        )
      }
    }
  }
}

private fun androidx.compose.ui.graphics.drawscope.DrawScope.drawEdges(
    summary: NavigationGraphSummary,
    layout: GraphLayout,
    palette: GraphPalette,
    historyById: Map<Int, Int>,
    historyByEdge: Map<ScreenEdgeKey, Int>,
    historySize: Int,
) {
  if (layout.nodeLayouts.isEmpty()) {
    return
  }

  summary.edges.forEach { edge ->
    val from = layout.nodeLayouts[edge.from] ?: return@forEach
    val to = layout.nodeLayouts[edge.to] ?: return@forEach
    val recencyIndex =
        historyById[edge.id] ?: historyByEdge[ScreenEdgeKey(edge.from, edge.to)]
    val recencyRatio =
        if (recencyIndex != null && historySize > 0) {
          (recencyIndex + 1).toFloat() / historySize.toFloat()
        } else {
          null
        }

    val color =
        if (recencyRatio != null) {
          lerp(palette.edgeDefault, palette.edgeHistory, 0.35f + 0.65f * recencyRatio)
        } else {
          palette.edgeDefault
        }
    val strokeWidth = if (recencyRatio != null) 2.5f + 3f * recencyRatio else 1.2f
    val dash =
        if (recencyRatio == null && edge.toolName == null) {
          PathEffect.dashPathEffect(floatArrayOf(8f, 6f), 0f)
        } else {
          null
        }

    val (start, end) = trimLine(from.center, to.center, from.radius, to.radius)
    drawLine(color = color, start = start, end = end, strokeWidth = strokeWidth, pathEffect = dash)

    if (recencyRatio != null) {
      drawArrow(end, start, color, strokeWidth)
    }
  }
}

private fun androidx.compose.ui.graphics.drawscope.DrawScope.drawNodes(
    summary: NavigationGraphSummary,
    layout: GraphLayout,
    palette: GraphPalette,
    historyNodes: Set<String>,
) {
  layout.nodeLayouts.values.forEach { nodeLayout ->
    val isCurrent = nodeLayout.node.screenName == summary.currentScreen
    val isHistory = historyNodes.contains(nodeLayout.node.screenName)
    val fill =
        when {
          isCurrent -> palette.nodeCurrentFill
          isHistory -> palette.nodeHistoryFill
          else -> palette.nodeFill
        }
    val stroke =
        when {
          isCurrent -> palette.nodeCurrentStroke
          isHistory -> palette.edgeHistory
          else -> palette.nodeStroke
        }

    drawCircle(color = fill, radius = nodeLayout.radius, center = nodeLayout.center)
    drawCircle(
        color = stroke,
        radius = nodeLayout.radius,
        center = nodeLayout.center,
        style = Stroke(width = 1.4f),
    )

    if (isCurrent) {
      drawCircle(
          color = palette.nodeCurrentStroke.copy(alpha = 0.4f),
          radius = nodeLayout.radius + 6f,
          center = nodeLayout.center,
          style = Stroke(width = 1.6f),
      )
    }
  }
}

private fun trimLine(
    from: Offset,
    to: Offset,
    fromRadius: Float,
    toRadius: Float,
): Pair<Offset, Offset> {
  val dx = to.x - from.x
  val dy = to.y - from.y
  val distance = sqrt(dx * dx + dy * dy)
  if (distance <= fromRadius + toRadius + 1f) {
    return Pair(from, to)
  }
  val ux = dx / distance
  val uy = dy / distance
  val start = Offset(from.x + ux * fromRadius, from.y + uy * fromRadius)
  val end = Offset(to.x - ux * toRadius, to.y - uy * toRadius)
  return Pair(start, end)
}

private fun androidx.compose.ui.graphics.drawscope.DrawScope.drawArrow(
    tip: Offset,
    tail: Offset,
    color: Color,
    strokeWidth: Float,
) {
  val dx = tip.x - tail.x
  val dy = tip.y - tail.y
  val angle = atan2(dy, dx)
  val arrowSize = 10f + strokeWidth
  val angleOffset = 0.45f
  val x1 = tip.x - arrowSize * cos(angle - angleOffset)
  val y1 = tip.y - arrowSize * sin(angle - angleOffset)
  val x2 = tip.x - arrowSize * cos(angle + angleOffset)
  val y2 = tip.y - arrowSize * sin(angle + angleOffset)
  drawLine(color = color, start = tip, end = Offset(x1, y1), strokeWidth = strokeWidth)
  drawLine(color = color, start = tip, end = Offset(x2, y2), strokeWidth = strokeWidth)
}

private data class ScreenEdgeKey(val from: String, val to: String)

private data class GraphPalette(
    val background: Color,
    val border: Color,
    val edgeDefault: Color,
    val edgeHistory: Color,
    val nodeFill: Color,
    val nodeStroke: Color,
    val nodeCurrentFill: Color,
    val nodeCurrentStroke: Color,
    val nodeHistoryFill: Color,
    val label: Color,
    val labelMuted: Color,
    val error: Color,
)

@Composable
private fun rememberGraphPalette(): GraphPalette {
  val globals = JewelTheme.globalColors
  val baseText = globals.text.normal
  val info = globals.text.info
  val warning = globals.text.warning
  val error = globals.text.error
  return GraphPalette(
      background = globals.panelBackground,
      border = globals.outlines.focused.copy(alpha = 0.4f),
      edgeDefault = baseText.copy(alpha = 0.25f),
      edgeHistory = warning.copy(alpha = 0.9f),
      nodeFill = baseText.copy(alpha = 0.08f),
      nodeStroke = baseText.copy(alpha = 0.45f),
      nodeCurrentFill = info.copy(alpha = 0.2f),
      nodeCurrentStroke = info,
      nodeHistoryFill = warning.copy(alpha = 0.2f),
      label = baseText.copy(alpha = 0.9f),
      labelMuted = baseText.copy(alpha = 0.65f),
      error = error,
  )
}
