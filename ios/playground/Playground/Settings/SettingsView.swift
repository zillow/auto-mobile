//
//  SettingsView.swift
//  Playground
//
//  Created by José Antonio Arellano Mendoza on 22/07/25.
//

import SwiftUI

struct SettingsViewModel{
  @AppStorage("onboardingCompelte") private var onboardingCompelte = false
  @AppStorage("didLogIn") private var loggedInUser: Bool = false
  @AppStorage("loggedInUserData") private var loggedInUserData: Data = Data()
  
  var user: User? {
//    return User(email: "email@example.com", fullname: "José Antonio Arellano Mendoza")
    guard loggedInUser else { return nil }
    let decoder = JSONDecoder()
    return try? decoder.decode(User.self, from: loggedInUserData)
  }
  
  func logout() {
    self.loggedInUserData = Data()
    self.loggedInUser = false
  }
  
  func resetOnboarding() {
    self.onboardingCompelte = false
  }
}

struct ElevatedCard: ViewModifier {
  func body(content: Content) -> some View {
    content
      .background(Color.white.opacity(0.95))
      .clipShape(RoundedRectangle(cornerRadius: 10))
      .shadow(color: Color.black.opacity(0.2), radius: 8, x: 5, y: 5)
  }
}
extension View {
    func cardStyled() -> some View {
        modifier(ElevatedCard())
    }
}

struct SettingsView: View {
  let viewModel = SettingsViewModel()
  var body: some View {
    NavigationStack {
      VStack {
        if let user = viewModel.user {
          HStack {
            VStack(alignment: .leading) {
              Text(user.fullname)
              Text(user.email)
            }
            
            Spacer()
            Image(systemName: "person")
              .resizable()
              .frame(width: 44, height: 44)
              .foregroundColor(.black)
          }
          .padding()
          .background(Color.gray.opacity(0.1))
          Divider()
        } else {
          Text("Not logged in")
        }
        ScrollView {
          VStack(alignment: .center, spacing: 30) {
            Text("Account actions")
              .font(.title2)
              .fontWeight(.semibold)
              .padding(.top)

            Button(role: .destructive) {
              viewModel.logout()
            } label: {
              Label("Logout", systemImage: "rectangle.portrait.and.arrow.forward")
            }
            .buttonStyle(.borderedProminent)
            .buttonBorderShape(.capsule)
           
            Button(role: .destructive) {
              viewModel.resetOnboarding()
            } label: {
              Label("Reset Onboarding State", systemImage: "trash")
            }
            .buttonStyle(.borderedProminent)
            .buttonBorderShape(.capsule)
            Text("")
          }
          .frame(maxWidth: .infinity)
          .background(Color.red.opacity(0.15))
          .cardStyled()
          .padding()
        }
      }
    }
  }
}

#Preview {
  SettingsView()
}
