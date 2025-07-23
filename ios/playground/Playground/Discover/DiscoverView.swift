//
//  DiscoverView.swift
//  Playground
//
//  Created by José Antonio Arellano Mendoza on 22/07/25.
//

import SwiftUI

struct DiscoverView: View {
  @State private var viewModel = ViewModel()
  
  var body: some View {
    NavigationSplitView {
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
    }
  }
}
