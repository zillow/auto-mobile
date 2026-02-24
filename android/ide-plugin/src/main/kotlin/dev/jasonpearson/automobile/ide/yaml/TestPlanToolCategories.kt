package dev.jasonpearson.automobile.ide.yaml

object TestPlanToolCategories {
  private val categoryByTool: Map<String, String> =
      mapOf(
              "App management" to setOf("launchApp", "terminateApp", "installApp"),
              "UI interactions" to setOf("tapOn", "swipeOn", "pinchOn", "dragAndDrop"),
              "Input" to
                  setOf(
                      "inputText",
                      "clearText",
                      "selectAllText",
                      "imeAction",
                      "keyboard",
                      "clipboard",
                  ),
              "Navigation" to
                  setOf(
                      "pressButton",
                      "pressKey",
                      "homeScreen",
                      "recentApps",
                      "openLink",
                      "navigateTo",
                  ),
              "Observation" to setOf("observe"),
              "Device management" to
                  setOf(
                      "listDevices",
                      "startDevice",
                      "killDevice",
                      "setActiveDevice",
                      "listDeviceImages",
                  ),
              "Device configuration" to
                  setOf("rotate", "shake", "systemTray", "changeLocalization"),
              "Plan execution" to setOf("executePlan", "criticalSection"),
              "Deep links" to setOf("getDeepLinks"),
              "Navigation graph" to setOf("getNavigationGraph", "explore", "identifyInteractions"),
              "Snapshots" to
                  setOf(
                      "captureDeviceSnapshot",
                      "restoreDeviceSnapshot",
                      "listSnapshots",
                      "deleteSnapshot",
                  ),
              "Video recording" to setOf("videoRecording"),
              "Debugging" to setOf("debugSearch", "bugReport"),
              "Doctor" to setOf("doctor"),
              "Biometrics" to setOf("biometricAuth"),
          )
          .flatMap { (category, tools) -> tools.map { tool -> tool to category } }
          .toMap()

  fun categoryFor(toolName: String): String? = categoryByTool[toolName]

  fun tools(): List<String> = categoryByTool.keys.sorted()
}
