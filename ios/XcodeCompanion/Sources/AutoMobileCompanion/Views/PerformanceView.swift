import SwiftUI

/// Performance view for displaying metrics and graphs
struct PerformanceView: View {
    var body: some View {
        VStack {
            Text("Performance Metrics")
                .font(.title)
                .padding()

            Text("Performance graphs will be rendered here")
                .foregroundColor(.secondary)

            Spacer()
        }
    }
}
