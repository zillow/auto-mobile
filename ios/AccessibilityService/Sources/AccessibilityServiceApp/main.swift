import Foundation
import AccessibilityService

/// Entry point for the Accessibility Service app
func main() {
    print("Starting AutoMobile Accessibility Service...")

    let port: UInt16 = 8080
    let server = WebSocketServer(port: port)

    do {
        try server.start()
        print("Accessibility Service is running on port \(port)")

        // Keep the app running
        RunLoop.main.run()
    } catch {
        print("Failed to start server: \(error)")
        exit(1)
    }
}

main()
