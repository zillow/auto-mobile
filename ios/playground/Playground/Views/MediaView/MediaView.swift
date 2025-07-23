import AVKit
import SwiftUI

struct MediaView: View {
  var body: some View {
    VideoPlayer(player: AVPlayer(url:  Bundle.main.url(forResource: "video", withExtension: "mp4")!))
        .frame(height: 400)
  }
}
