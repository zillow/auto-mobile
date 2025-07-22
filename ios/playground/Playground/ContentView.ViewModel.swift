import Foundation

extension ContentView {
    @Observable
    class ViewModel {
        var selectedItem: SampleItem? = SampleItem.samples.first
    }

    struct SampleItem: Identifiable, Hashable {
        let id = UUID()
        let name: String
        let icon: String
        
        static let samples = [
            SampleItem(name: "Home", icon: "house"),
            SampleItem(name: "Profile", icon: "person"),
            SampleItem(name: "Settings", icon: "gear"),
            SampleItem(name: "Messages", icon: "message"),
            SampleItem(name: "Favorites", icon: "heart")
        ]
    }
}
