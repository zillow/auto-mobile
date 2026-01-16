import SwiftUI

/// Recording view for capturing automation plans
struct RecordingView: View {

    @StateObject private var viewModel = RecordingViewModel()

    var body: some View {
        VStack {
            HStack {
                Text("Test Recording")
                    .font(.title)

                Spacer()

                if viewModel.isRecording {
                    Button("Stop Recording") {
                        viewModel.stopRecording()
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(.red)
                } else {
                    Button("Start Recording") {
                        viewModel.startRecording()
                    }
                    .buttonStyle(.borderedProminent)
                }
            }
            .padding()

            if viewModel.isRecording {
                RecordingSessionView(events: viewModel.recordedEvents)
            } else if let plan = viewModel.generatedPlan {
                PlanPreviewView(plan: plan)
            } else {
                EmptyRecordingView()
            }
        }
    }
}

/// Recording session view
struct RecordingSessionView: View {
    let events: [RecordedEvent]

    var body: some View {
        VStack {
            Text("Recording in progress...")
                .font(.headline)
                .foregroundColor(.red)

            List(events) { event in
                HStack {
                    Image(systemName: event.icon)
                    Text(event.description)
                    Spacer()
                    Text(event.timestamp.formatted(date: .omitted, time: .standard))
                        .font(.caption)
                        .foregroundColor(.secondary)
                }
            }
        }
    }
}

/// Plan preview view
struct PlanPreviewView: View {
    let plan: String

    var body: some View {
        VStack {
            Text("Generated YAML Plan")
                .font(.headline)

            TextEditor(text: .constant(plan))
                .font(.system(.body, design: .monospaced))
                .padding()

            HStack {
                Button("Copy to Clipboard") {
                    NSPasteboard.general.clearContents()
                    NSPasteboard.general.setString(plan, forType: .string)
                }

                Button("Save to File") {
                    // Save plan to file
                }
                .buttonStyle(.borderedProminent)
            }
            .padding()
        }
    }
}

/// Empty recording view
struct EmptyRecordingView: View {
    var body: some View {
        VStack {
            Image(systemName: "record.circle")
                .font(.system(size: 64))
                .foregroundColor(.secondary)

            Text("No recording in progress")
                .font(.headline)
                .padding(.top)

            Text("Click 'Start Recording' to begin capturing a test plan")
                .font(.caption)
                .foregroundColor(.secondary)
        }
    }
}

/// Recording view model
class RecordingViewModel: ObservableObject {
    @Published var isRecording = false
    @Published var recordedEvents: [RecordedEvent] = []
    @Published var generatedPlan: String?

    func startRecording() {
        isRecording = true
        recordedEvents = []
        generatedPlan = nil
    }

    func stopRecording() {
        isRecording = false
        generatePlan()
    }

    private func generatePlan() {
        // TODO: Generate YAML plan from recorded events
        generatedPlan = """
        # Generated AutoMobile Test Plan
        name: Recorded Test
        steps:
          - action: tapOn
            params:
              text: "Login"
          - action: inputText
            params:
              text: "user@example.com"
        """
    }
}

/// Recorded event model
struct RecordedEvent: Identifiable {
    let id = UUID()
    let type: EventType
    let description: String
    let timestamp: Date

    enum EventType {
        case tap, swipe, input

        var icon: String {
            switch self {
            case .tap: return "hand.tap"
            case .swipe: return "hand.draw"
            case .input: return "keyboard"
            }
        }
    }

    var icon: String {
        type.icon
    }
}
