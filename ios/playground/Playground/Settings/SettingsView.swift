//
//  SettingsView.swift
//  Playground
//
//  Created by José Antonio Arellano Mendoza on 22/07/25.
//

import SwiftUI

struct SettingsView: View {
  @AppStorage("onboardingCompelte") private var onboardingCompelte = false
  
  var body: some View {
    NavigationStack {
      ScrollView {
        VStack {
          
          Button(role: .destructive) {
            onboardingCompelte = false
          } label: {
            Label("Reset Onboarding State", systemImage: "trash")
          }.buttonStyle(.borderedProminent)
          .frame(maxWidth: .infinity)
        }.padding()
      }.navigationTitle(Text("Settings"))
    }
  }
}

#Preview {
  SettingsView()
}
