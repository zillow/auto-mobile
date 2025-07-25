//
//  PlaygroundApp.swift
//  Playground
//
//  Created by Jason Pearson on 7/21/25.
//

import SwiftUI

@main
struct PlaygroundApp: App {
  @AppStorage("onboardingCompelte") var onboardingCompelte = false
  @AppStorage("didLogIn") var loggedInUser: Bool = false

  @State private var showingOnboarding = false
  
    var body: some Scene {
        WindowGroup {
          Group {
            if loggedInUser {
              HomeView()
            } else {
              LoginView()
            }
          }
          .fullScreenCover(isPresented: $showingOnboarding) {
            OnboardingView()
          }
          .onAppear {
            showingOnboarding = !onboardingCompelte
          }
        }
    }
}
