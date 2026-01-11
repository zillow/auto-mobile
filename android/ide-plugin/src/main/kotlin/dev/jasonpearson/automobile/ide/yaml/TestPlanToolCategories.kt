package dev.jasonpearson.automobile.ide.yaml

object TestPlanToolCategories {
    private val categoryByTool: Map<String, String> = mapOf(
        "App management" to setOf(
            "launchApp",
            "terminateApp",
            "listApps",
            "installApp"
        ),
        "UI interactions" to setOf(
            "tapOn",
            "swipeOn",
            "pinchOn",
            "dragAndDrop"
        ),
        "Input" to setOf(
            "inputText",
            "clearText",
            "selectAllText",
            "imeAction",
            "clipboard"
        ),
        "Navigation" to setOf(
            "pressButton",
            "pressKey",
            "homeScreen",
            "recentApps",
            "openLink",
            "navigateTo"
        ),
        "Observation" to setOf(
            "observe",
            "rawViewHierarchy"
        ),
        "Device management" to setOf(
            "listDevices",
            "startDevice",
            "killDevice",
            "setActiveDevice",
            "listDeviceImages"
        ),
        "Device configuration" to setOf(
            "rotate",
            "shake",
            "systemTray",
            "setLocale",
            "setTimeZone",
            "setTextDirection",
            "set24HourFormat",
            "getCalendarSystem"
        ),
        "Demo mode" to setOf(
            "demoMode"
        ),
        "Plan execution" to setOf(
            "executePlan",
            "criticalSection"
        ),
        "Deep links" to setOf(
            "getDeepLinks"
        ),
        "Navigation graph" to setOf(
            "getNavigationGraph",
            "explore",
            "identifyInteractions"
        ),
        "Snapshots" to setOf(
            "captureDeviceSnapshot",
            "restoreDeviceSnapshot",
            "listSnapshots",
            "deleteSnapshot"
        ),
        "Video recording" to setOf(
            "videoRecording"
        ),
        "Debugging" to setOf(
            "debugSearch",
            "bugReport"
        ),
        "Doctor" to setOf(
            "doctor"
        ),
        "Daemon" to setOf(
            "daemon_available_devices",
            "daemon_refresh_devices",
            "daemon_session_info",
            "daemon_release_session"
        ),
        "Biometrics" to setOf(
            "biometricAuth"
        )
    ).flatMap { (category, tools) ->
        tools.map { tool -> tool to category }
    }.toMap()

    fun categoryFor(toolName: String): String? = categoryByTool[toolName]

    fun tools(): List<String> = categoryByTool.keys.sorted()
}
