import Foundation
import SwiftUI

extension DiscoverView {
  @Observable
  class ViewModel {
    var selectedItem: UUID?
    let items: [ViewItems] = ViewItems.samples
    
    // Alternative: Enum-based selection (more type-safe)
    var selectedSection: NavigationSection?
  }
  
  // Enum for type-safe navigation
  enum NavigationSection: String, CaseIterable, Hashable {
    case inputs = "Inputs"
    case lists = "Lists"
    case buttons = "Buttons"
    case forms = "Forms"
    
    var icon: String {
      switch self {
      case .inputs: return "keyboard"
      case .lists: return "list.bullet"
      case .buttons: return "button.programmable"
      case .forms: return "doc.text"
      }
    }
    
    var view: AnyView {
      switch self {
      case .inputs: return AnyView(InputsView())
      case .lists: return AnyView(Text("Lists View Coming Soon!"))
      case .buttons: return AnyView(Text("Buttons View Coming Soon!"))
      case .forms: return AnyView(Text("Forms View Coming Soon!"))
      }
    }
  }

  struct ViewItems: Identifiable {
    var id: UUID = UUID()
    var name: String
    var icon: String
    var view: AnyView

    static let samples = [
      ViewItems(name: "Inputs", icon: "keyboard", view: AnyView(InputsView())),
      ViewItems(name: "Lists", icon: "list.bullet", view: AnyView(Text("Lists View Coming Soon!"))),
    ]
  }
}
