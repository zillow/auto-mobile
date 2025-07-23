//
//  SwipeView.swift
//  Playground
//
//  Created by José Antonio Arellano Mendoza on 23/07/25.
//

import SwiftUI

struct SwipeView: View {
  
  @State private var sections: [[Item]] = (1...3).map { section in
      (1...5).map { index in
          Item(title: "Title \(section)-\(index)", subtitle: "Subtitle for item \(index)")
      }
  }
  
  var body: some View {
    List {
        ForEach(sections.indices, id: \.self) { sectionIndex in
            if !sections[sectionIndex].isEmpty {
                Section(header: Text("Section \(sectionIndex + 1)")) {
                    ForEach(sections[sectionIndex]) { item in
                        VStack(alignment: .leading) {
                            Text(item.title)
                                .font(.headline)
                            Text(item.subtitle)
                                .font(.subheadline)
                                .foregroundColor(.secondary)
                        }
                    }
                    .onDelete { indexSet in
                      withAnimation {
                        sections[sectionIndex].remove(atOffsets: indexSet)
                      }
                    }
                }
            }
        }
    }
  }
}

struct Item: Identifiable {
    let id = UUID()
    let title: String
    let subtitle: String
}
