package dev.jasonpearson.automobile.validation

object ValidTools {
    val TOOLS = setOf(
        "launchApp", "terminateApp", "listApps", "installApp",
        "tapOn", "swipeOn", "pinchOn", "dragAndDrop",
        "inputText", "clearText", "selectAllText", "imeAction",
        "pressButton", "pressKey", "homeScreen", "recentApps", "openLink", "navigateTo",
        "observe", "rawViewHierarchy",
        "listDevices", "startDevice", "killDevice", "setActiveDevice",
        "rotate", "shake", "openSystemTray", "setLocale", "setTimeZone",
        "setTextDirection", "set24HourFormat", "getCalendarSystem",
        "enableDemoMode", "disableDemoMode",
        "executePlan", "criticalSection",
        "getDeepLinks",
        "getNavigationGraph", "explore", "identifyInteractions",
        "listPerformanceAuditResults",
        "captureDeviceSnapshot", "restoreDeviceSnapshot", "listSnapshots", "deleteSnapshot",
        "startVideoRecording", "stopVideoRecording", "listVideoRecordings", "deleteVideoRecording",
        "listDeviceImages",
        "getTestTimings",
        "debugSearch", "bugReport",
        "doctor",
        "daemon_available_devices", "daemon_session_info", "daemon_release_session",
        "biometricAuth", "clipboard"
    )

    val DEPRECATED_FIELDS = setOf("generated", "appId", "parameters", "description")
}
