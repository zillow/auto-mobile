//
//  DiscoverView.swift
//  Playground
//
//  Created by José Antonio Arellano Mendoza on 22/07/25.
//

import SwiftUI

struct DiscoverView: View {
  @State private var viewModel = ViewModel()
  
  @State private var selection = 0
  
  var body: some View {
    NavigationStack {
      VStack {
        pickerView
        switch self.selection {
        case 0:
          TapView()
        case 1:
          SwipeView()
        case 2:
          MediaView()
        case 3:
          InputsView()
        case 4:
          Text("Chat")
        default:
          EmptyView()
        }
        Spacer()
      }
      .navigationTitle("Discover")
    }
    
    /*NavigationSplitView {
      // Sidebar
      List(selection: $viewModel.selectedItem) {
        ForEach(viewModel.items) { item in
          NavigationLink(value: item.id) {
            Label(item.name, systemImage: item.icon)
          }
        }
      }
      .navigationTitle("Discover")
    } detail: {
      // Detail view
      if let selectedItemId = viewModel.selectedItem,
         let selectedItem = viewModel.items.first(where: { $0.id == selectedItemId }) {
        selectedItem.view
          .navigationTitle(selectedItem.name)
      } else {
        ContentUnavailableView(
          "Select an item",
          systemImage: "sidebar.left",
          description: Text("Choose an item from the sidebar to see its content")
        )
      }
    }*/
  }
  
  var pickerView: some View {
    Picker("", selection: $selection) {
      Text("Tap").tag(0)
      Text("Swipe").tag(1)
      Text("Media").tag(2)
      Text("Text").tag(3)
      Text("Chat").tag(4)
    }
    .pickerStyle(.segmented)
    .padding(.horizontal)
  }
  
}
