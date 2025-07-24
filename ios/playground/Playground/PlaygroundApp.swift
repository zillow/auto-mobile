//
//  PlaygroundApp.swift
//  Playground
//
//  Created by Jason Pearson on 7/21/25.
//

import SwiftUI

@main
struct PlaygroundApp: App {
  @AppStorage("onboardingCompelte") private var onboardingCompelte = false
  @State private var showingOnboarding = false
    var body: some Scene {
        WindowGroup {
            HomeView()
            .fullScreenCover(isPresented: $showingOnboarding) {
              OnboardingView()
            }.onAppear {
              showingOnboarding = !onboardingCompelte
            }
        }
    }
}
