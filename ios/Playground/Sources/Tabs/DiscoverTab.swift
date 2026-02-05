import SwiftUI

struct DiscoverTab: View {
    @State private var searchText = ""
    @Environment(\.autoMobileTheme) private var theme

    private let videos = [
        VideoItem(id: "1", title: "Getting Started with SwiftUI", thumbnail: "video.fill", duration: "10:23"),
        VideoItem(id: "2", title: "Advanced Animations", thumbnail: "wand.and.stars", duration: "15:45"),
        VideoItem(id: "3", title: "Building Custom Components", thumbnail: "cube.fill", duration: "22:10"),
        VideoItem(id: "4", title: "State Management Deep Dive", thumbnail: "arrow.triangle.2.circlepath", duration: "18:30"),
        VideoItem(id: "5", title: "Networking Best Practices", thumbnail: "network", duration: "12:55"),
    ]

    var filteredVideos: [VideoItem] {
        if searchText.isEmpty {
            return videos
        }
        return videos.filter { $0.title.localizedCaseInsensitiveContains(searchText) }
    }

    var body: some View {
        NavigationStack {
            List(filteredVideos) { video in
                NavigationLink(value: video) {
                    VideoRowView(video: video)
                }
            }
            .scrollContentBackground(.hidden)
            .background(theme.background)
            .navigationTitle("Discover")
            .searchable(text: $searchText, prompt: "Search videos")
            .navigationDestination(for: VideoItem.self) { video in
                VideoDetailView(video: video)
            }
        }
    }
}

struct VideoItem: Identifiable, Hashable {
    let id: String
    let title: String
    let thumbnail: String
    let duration: String
}

struct VideoRowView: View {
    let video: VideoItem
    @Environment(\.autoMobileTheme) private var theme

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: video.thumbnail)
                .font(.system(size: 24))
                .foregroundStyle(theme.primary)
                .frame(width: 60, height: 40)
                .background(theme.surfaceVariant)
                .cornerRadius(8)

            VStack(alignment: .leading, spacing: 4) {
                Text(video.title)
                    .font(.headline)
                    .foregroundStyle(theme.textPrimary)
                    .lineLimit(2)

                Text(video.duration)
                    .font(.caption)
                    .foregroundStyle(theme.textSecondary)
            }
        }
        .padding(.vertical, 4)
    }
}

struct VideoDetailView: View {
    let video: VideoItem
    @Environment(\.autoMobileTheme) private var theme

    var body: some View {
        VStack(spacing: 20) {
            // Video player placeholder
            ZStack {
                Rectangle()
                    .fill(Color.autoMobileBlack)
                    .aspectRatio(16/9, contentMode: .fit)

                Image(systemName: "play.circle.fill")
                    .font(.system(size: 60))
                    .foregroundStyle(Color.autoMobileWhite)
            }
            .cornerRadius(12)
            .padding(.horizontal)

            VStack(alignment: .leading, spacing: 8) {
                Text(video.title)
                    .font(.title2)
                    .fontWeight(.bold)
                    .foregroundStyle(theme.textPrimary)

                Text("Duration: \(video.duration)")
                    .font(.subheadline)
                    .foregroundStyle(theme.textSecondary)

                Text("This is a sample video for testing the AutoMobile iOS Playground app. The video demonstrates various features and capabilities.")
                    .font(.body)
                    .foregroundStyle(theme.textSecondary)
                    .padding(.top, 8)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal)

            Spacer()
        }
        .background(theme.background)
        .navigationTitle("Video")
        .navigationBarTitleDisplayMode(.inline)
    }
}

#Preview {
    DiscoverTab()
        .autoMobileTheme()
}
