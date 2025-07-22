//
//  HomeView.swift
//  Playground
//
//  Created by José Antonio Arellano Mendoza on 22/07/25.
//

import SwiftUI

struct HomeView: View {
  
  var body: some View {
    TabView {
      Tab("Discover", systemImage: "magnifyingglass") {
        DiscoverView()
      }
      Tab("Slides", systemImage: "play.square") {
        SlidesView()
      }
      Tab("Settings", systemImage: "gear") {
        SettingsView()
      }
    }
  }
  
}
