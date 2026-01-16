import SwiftUI

/// Execution view for running automation plans
struct ExecutionView: View {

    @StateObject private var viewModel = ExecutionViewModel()

    var body: some View {
        VStack {
            HStack {
                Text("Plan Execution")
                    .font(.title)

                Spacer()

                Button("Run Plan") {
                    viewModel.executePlan()
                }
                .disabled(viewModel.isExecuting)
            }
            .padding()

            if viewModel.isExecuting {
                ProgressView("Executing plan...")
                    .padding()
            }

            if !viewModel.executionLog.isEmpty {
                List(viewModel.executionLog) { entry in
                    LogEntryRow(entry: entry)
                }
            } else {
                Text("No execution logs")
                    .foregroundColor(.secondary)
            }
        }
    }
}

/// Log entry row
struct LogEntryRow: View {
    let entry: LogEntry

    var body: some View {
        HStack {
            Image(systemName: entry.level.icon)
                .foregroundColor(entry.level.color)

            VStack(alignment: .leading) {
                Text(entry.message)
                    .font(.body)

                Text(entry.timestamp.formatted(date: .omitted, time: .standard))
                    .font(.caption)
                    .foregroundColor(.secondary)
            }
        }
        .padding(.vertical, 2)
    }
}

/// Execution view model
class ExecutionViewModel: ObservableObject {
    @Published var isExecuting = false
    @Published var executionLog: [LogEntry] = []

    func executePlan() {
        isExecuting = true
        executionLog = []

        // TODO: Execute plan via MCP
        // For MVP, simulate execution
        DispatchQueue.main.asyncAfter(deadline: .now() + 2) {
            self.executionLog.append(LogEntry(
                level: .info,
                message: "Plan execution started"
            ))
            self.isExecuting = false
        }
    }
}

/// Log entry model
struct LogEntry: Identifiable {
    let id = UUID()
    let level: Level
    let message: String
    let timestamp = Date()

    enum Level {
        case info, success, warning, error

        var icon: String {
            switch self {
            case .info: return "info.circle"
            case .success: return "checkmark.circle"
            case .warning: return "exclamationmark.triangle"
            case .error: return "xmark.circle"
            }
        }

        var color: Color {
            switch self {
            case .info: return .blue
            case .success: return .green
            case .warning: return .orange
            case .error: return .red
            }
        }
    }
}
