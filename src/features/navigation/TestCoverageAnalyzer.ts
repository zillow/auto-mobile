import { testCoverageRepository } from "../../db/testCoverageRepository";
import { NavigationRepository } from "../../db/navigationRepository";
import type { NavigationNode, NavigationEdge } from "../../db/types";
import { logger } from "../../utils/logger";
import { Timer, defaultTimer } from "../../utils/SystemTimer";

interface CoverageGap {
  type: "node" | "edge";
  id: number;
  screenName?: string;
  fromScreen?: string;
  toScreen?: string;
  criticalityScore: number;
  recommendation: string;
}

interface TestCoverageReport {
  appId: string;
  generatedAt: number;

  // Overall metrics
  totalNodes: number;
  coveredNodes: number;
  uncoveredNodes: number;
  nodeCoveragePercent: number;

  totalEdges: number;
  coveredEdges: number;
  uncoveredEdges: number;
  edgeCoveragePercent: number;

  overallCoveragePercent: number;

  // Detailed gaps
  criticalGaps: CoverageGap[];

  // Recommendations
  recommendations: string[];

  // Suggested test scenarios
  suggestedScenarios: TestScenario[];
}

interface TestScenario {
  title: string;
  description: string;
  priority: "high" | "medium" | "low";
  targetScreens: string[];
  estimatedCoverageImprovement: number;
}

/**
 * Analyzes test coverage for navigation graphs and generates recommendations.
 */
class TestCoverageAnalyzer {
  private navigationRepository: NavigationRepository;
  private timer: Timer;

  constructor(timer: Timer = defaultTimer) {
    this.navigationRepository = new NavigationRepository();
    this.timer = timer;
  }

  /**
   * Generate a comprehensive test coverage report for an app.
   */
  async generateReport(appId: string): Promise<TestCoverageReport> {
    logger.info(`[TEST_COVERAGE] Generating coverage report for app: ${appId}`);

    // Get aggregated coverage data
    const coverageData = await testCoverageRepository.getAggregatedCoverageAnalysis(appId);

    // Calculate criticality scores for uncovered elements
    const criticalGaps = await this.identifyCriticalGaps(
      appId,
      coverageData.uncoveredNodes,
      coverageData.uncoveredEdges
    );

    // Generate recommendations
    const recommendations = this.generateRecommendations(coverageData, criticalGaps);

    // Generate suggested test scenarios
    const suggestedScenarios = await this.generateTestScenarios(appId, criticalGaps);

    const nodeCoveragePercent = coverageData.totalNodes > 0
      ? (coverageData.coveredNodes / coverageData.totalNodes) * 100
      : 0;

    const edgeCoveragePercent = coverageData.totalEdges > 0
      ? (coverageData.coveredEdges / coverageData.totalEdges) * 100
      : 0;

    const report: TestCoverageReport = {
      appId,
      generatedAt: this.timer.now(),
      totalNodes: coverageData.totalNodes,
      coveredNodes: coverageData.coveredNodes,
      uncoveredNodes: coverageData.uncoveredNodes.length,
      nodeCoveragePercent,
      totalEdges: coverageData.totalEdges,
      coveredEdges: coverageData.coveredEdges,
      uncoveredEdges: coverageData.uncoveredEdges.length,
      edgeCoveragePercent,
      overallCoveragePercent: coverageData.coveragePercentage,
      criticalGaps,
      recommendations,
      suggestedScenarios,
    };

    logger.info(
      `[TEST_COVERAGE] Report generated: ${report.overallCoveragePercent.toFixed(1)}% overall coverage, ` +
      `${report.criticalGaps.length} critical gaps identified`
    );

    return report;
  }

  /**
   * Identify critical coverage gaps based on edge frequency and depth.
   * Higher frequency and shallower depth = more critical.
   */
  private async identifyCriticalGaps(
    appId: string,
    uncoveredNodes: NavigationNode[],
    uncoveredEdges: NavigationEdge[]
  ): Promise<CoverageGap[]> {
    const gaps: CoverageGap[] = [];

    // Get all nodes and edges for frequency/depth analysis
    const allNodes = await this.navigationRepository.getNodes(appId);
    const allEdges = await this.navigationRepository.getEdges(appId);

    // Calculate max values for normalization
    const maxVisits = Math.max(...allNodes.map(n => n.visit_count), 1);

    // Analyze uncovered nodes
    for (const node of uncoveredNodes) {
      const inEdges = allEdges.filter(e => e.to_screen === node.screen_name);
      const outEdges = allEdges.filter(e => e.from_screen === node.screen_name);
      const edgeCount = inEdges.length + outEdges.length;

      // Calculate depth (minimum hops from entry point)
      const depth = await this.calculateNodeDepth(appId, node.screen_name, allEdges);

      // Criticality score: high frequency + shallow depth = high criticality
      // Frequency score: 0-50 based on visit count
      // Depth score: 0-50 based on inverse of depth (shallower = higher score)
      const frequencyScore = (node.visit_count / maxVisits) * 50;
      const depthScore = depth > 0 ? (1 / depth) * 50 : 25;
      const criticalityScore = frequencyScore + depthScore;

      gaps.push({
        type: "node",
        id: node.id,
        screenName: node.screen_name,
        criticalityScore,
        recommendation: this.generateNodeRecommendation(node, depth, edgeCount),
      });
    }

    // Analyze uncovered edges
    for (const edge of uncoveredEdges) {
      // Get frequency data for connected nodes
      const fromNode = allNodes.find(n => n.screen_name === edge.from_screen);
      const toNode = allNodes.find(n => n.screen_name === edge.to_screen);

      if (!fromNode || !toNode) {
        continue;
      }

      // Calculate depth of source node
      const depth = await this.calculateNodeDepth(appId, edge.from_screen, allEdges);

      // Edge criticality based on node visit counts and depth
      const avgVisits = (fromNode.visit_count + toNode.visit_count) / 2;
      const frequencyScore = (avgVisits / maxVisits) * 50;
      const depthScore = depth > 0 ? (1 / depth) * 50 : 25;
      const criticalityScore = frequencyScore + depthScore;

      gaps.push({
        type: "edge",
        id: edge.id,
        fromScreen: edge.from_screen,
        toScreen: edge.to_screen,
        criticalityScore,
        recommendation: this.generateEdgeRecommendation(edge, depth),
      });
    }

    // Sort by criticality score (descending)
    gaps.sort((a, b) => b.criticalityScore - a.criticalityScore);

    return gaps;
  }

  /**
   * Calculate the depth (minimum hops) of a node from entry points.
   * Entry points are nodes with no incoming edges.
   */
  private async calculateNodeDepth(
    appId: string,
    screenName: string,
    allEdges: NavigationEdge[]
  ): Promise<number> {
    // Find entry points (nodes with no incoming edges)
    const allScreens = new Set<string>();
    allEdges.forEach(e => {
      allScreens.add(e.from_screen);
      allScreens.add(e.to_screen);
    });

    const entryPoints = [...allScreens].filter(screen => {
      return !allEdges.some(e => e.to_screen === screen);
    });

    if (entryPoints.length === 0) {
      // No clear entry point, assume depth of 1
      return 1;
    }

    // BFS to find shortest path from any entry point
    let minDepth = Infinity;

    for (const entryPoint of entryPoints) {
      const depth = this.bfsDepth(entryPoint, screenName, allEdges);
      if (depth < minDepth) {
        minDepth = depth;
      }
    }

    return minDepth === Infinity ? 99 : minDepth;
  }

  /**
   * BFS to find depth from start to target screen.
   */
  private bfsDepth(start: string, target: string, edges: NavigationEdge[]): number {
    if (start === target) {
      return 0;
    }

    const queue: Array<{ screen: string; depth: number }> = [{ screen: start, depth: 0 }];
    const visited = new Set<string>([start]);

    while (queue.length > 0) {
      const { screen, depth } = queue.shift()!;

      // Find outgoing edges
      const outgoing = edges.filter(e => e.from_screen === screen);

      for (const edge of outgoing) {
        if (edge.to_screen === target) {
          return depth + 1;
        }

        if (!visited.has(edge.to_screen)) {
          visited.add(edge.to_screen);
          queue.push({ screen: edge.to_screen, depth: depth + 1 });
        }
      }
    }

    return Infinity;
  }

  /**
   * Generate recommendation text for an uncovered node.
   */
  private generateNodeRecommendation(
    node: NavigationNode,
    depth: number,
    edgeCount: number
  ): string {
    const visitText = node.visit_count > 1 ? `${node.visit_count} visits` : "1 visit";
    const depthText = depth <= 2 ? "shallow" : depth <= 4 ? "medium" : "deep";

    return `Screen "${node.screen_name}" (${visitText}, ${depthText} in navigation tree, ${edgeCount} connections) has not been tested. Add test coverage to verify functionality.`;
  }

  /**
   * Generate recommendation text for an uncovered edge.
   */
  private generateEdgeRecommendation(edge: NavigationEdge, depth: number): string {
    const depthText = depth <= 2 ? "shallow" : depth <= 4 ? "medium" : "deep";
    const toolText = edge.tool_name ? ` via ${edge.tool_name}` : "";

    return `Transition from "${edge.from_screen}" to "${edge.to_screen}"${toolText} (${depthText} in navigation tree) has not been tested. Add test coverage for this user journey.`;
  }

  /**
   * Generate high-level recommendations based on coverage data.
   */
  private generateRecommendations(
    coverageData: any,
    criticalGaps: CoverageGap[]
  ): string[] {
    const recommendations: string[] = [];

    // Overall coverage recommendation
    if (coverageData.coveragePercentage < 50) {
      recommendations.push(
        `Overall coverage is ${coverageData.coveragePercentage.toFixed(1)}% - significantly increase test coverage across the application.`
      );
    } else if (coverageData.coveragePercentage < 80) {
      recommendations.push(
        `Overall coverage is ${coverageData.coveragePercentage.toFixed(1)}% - add tests for critical user journeys to reach 80%+ coverage.`
      );
    } else {
      recommendations.push(
        `Overall coverage is ${coverageData.coveragePercentage.toFixed(1)}% - focus on edge cases and less common user flows.`
      );
    }

    // Node vs edge coverage
    const nodeCoverage = coverageData.totalNodes > 0
      ? (coverageData.coveredNodes / coverageData.totalNodes) * 100
      : 0;
    const edgeCoverage = coverageData.totalEdges > 0
      ? (coverageData.coveredEdges / coverageData.totalEdges) * 100
      : 0;

    if (nodeCoverage - edgeCoverage > 20) {
      recommendations.push(
        `Node coverage (${nodeCoverage.toFixed(1)}%) is significantly higher than edge coverage (${edgeCoverage.toFixed(1)}%). Focus on testing transitions and user journeys between screens.`
      );
    } else if (edgeCoverage - nodeCoverage > 20) {
      recommendations.push(
        `Edge coverage (${edgeCoverage.toFixed(1)}%) is higher than node coverage (${nodeCoverage.toFixed(1)}%). Ensure all screens are visited during tests.`
      );
    }

    // Critical gaps
    const highCriticalityGaps = criticalGaps.filter(g => g.criticalityScore > 60);
    if (highCriticalityGaps.length > 0) {
      recommendations.push(
        `${highCriticalityGaps.length} high-priority coverage gap(s) identified in frequently-used, shallow screens. Prioritize testing these areas.`
      );
    }

    // Uncovered screens
    if (coverageData.uncoveredNodes.length > 0) {
      const topUncovered = coverageData.uncoveredNodes
        .slice(0, 3)
        .map((n: NavigationNode) => n.screen_name)
        .join(", ");
      recommendations.push(
        `${coverageData.uncoveredNodes.length} screen(s) have no test coverage. Top uncovered: ${topUncovered}`
      );
    }

    return recommendations;
  }

  /**
   * Generate suggested test scenarios based on coverage gaps.
   */
  private async generateTestScenarios(
    appId: string,
    criticalGaps: CoverageGap[]
  ): Promise<TestScenario[]> {
    const scenarios: TestScenario[] = [];

    // Group gaps by criticality
    const highPriority = criticalGaps.filter(g => g.criticalityScore > 60);
    const mediumPriority = criticalGaps.filter(g => g.criticalityScore > 30 && g.criticalityScore <= 60);

    // Generate scenarios for high-priority gaps
    if (highPriority.length > 0) {
      const nodeGaps = highPriority.filter(g => g.type === "node");
      const edgeGaps = highPriority.filter(g => g.type === "edge");

      if (nodeGaps.length > 0) {
        scenarios.push({
          title: "Cover Critical Screens",
          description: `Test ${nodeGaps.length} frequently-accessed screen(s) that currently have no coverage. These are shallow in the navigation tree and likely part of core user journeys.`,
          priority: "high",
          targetScreens: nodeGaps.map(g => g.screenName!),
          estimatedCoverageImprovement: (nodeGaps.length / (criticalGaps.length || 1)) * 100,
        });
      }

      if (edgeGaps.length > 0) {
        const uniqueScreens = new Set<string>();
        edgeGaps.forEach(g => {
          if (g.fromScreen) {uniqueScreens.add(g.fromScreen);}
          if (g.toScreen) {uniqueScreens.add(g.toScreen);}
        });

        scenarios.push({
          title: "Test Critical User Journeys",
          description: `Test ${edgeGaps.length} common navigation path(s) between screens. These transitions are frequently used but not covered by tests.`,
          priority: "high",
          targetScreens: Array.from(uniqueScreens),
          estimatedCoverageImprovement: (edgeGaps.length / (criticalGaps.length || 1)) * 100,
        });
      }
    }

    // Generate scenarios for medium-priority gaps
    if (mediumPriority.length > 0 && scenarios.length < 3) {
      const nodeGaps = mediumPriority.filter(g => g.type === "node");

      if (nodeGaps.length > 0) {
        scenarios.push({
          title: "Expand Screen Coverage",
          description: `Add tests for ${nodeGaps.length} additional screen(s) to improve overall coverage. These are moderately important screens in the navigation flow.`,
          priority: "medium",
          targetScreens: nodeGaps.slice(0, 5).map(g => g.screenName!),
          estimatedCoverageImprovement: (nodeGaps.length / (criticalGaps.length || 1)) * 100,
        });
      }
    }

    return scenarios.slice(0, 5); // Limit to top 5 scenarios
  }
}

// Export singleton instance
export const testCoverageAnalyzer = new TestCoverageAnalyzer();
