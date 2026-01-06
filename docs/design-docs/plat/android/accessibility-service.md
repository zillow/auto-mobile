The Android Accessibility Service provides real-time access to view hierarchy data and user interface
elements without requiring device rooting or special permissions beyond accessibility service enablement.
This service acts as a bridge between the Android system's accessibility framework and AutoMobile's
automation capabilities. When enabled, the accessibility service continuously monitors UI changes and
provides detailed information about view hierarchies. It writes the latest hierarchy to app-private
storage and can stream updates over WebSocket for the MCP Server/Daemon to consume.
