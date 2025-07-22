//
//  ContentView.swift
//  Playground
//
//  Created by Jason Pearson on 7/21/25.
//

import SwiftUI

struct ContentView: View {
  
    @State private var viewModel = ViewModel()
    
    var body: some View {
      NavigationSplitView {
        List(SampleItem.samples, selection: $viewModel.selectedItem) { item in
          NavigationLink(value: item) {
            Label(item.name, systemImage: item.icon)
          }
        }
        .navigationTitle("Samples")
      } detail: {
          if let selectedItem = viewModel.selectedItem {
                Text("Selected item: \(selectedItem.name)")
            } else {
                Text("Select an item")
                    .foregroundStyle(.secondary)
            }
        }
    }
}
