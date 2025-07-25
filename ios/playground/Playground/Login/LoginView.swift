//
//  LoginView.swift
//  Playground
//
//  Created by Kishore Sajja on 7/24/25.
//

import SwiftUI
import RegexBuilder

struct User: Codable {
  var email: String = ""
  var fullname: String = ""
}

struct LoginViewModel {
  @AppStorage("didLogIn") var loggedInUser: Bool = false
  @AppStorage("loggedInUserData") var loggedInUserData: Data = Data()
  
  var email: String = ""
  var password: String = ""
    
  var canContinueLogin: Bool = false
  
  let emailPattern = Regex {
      Capture {
          ZeroOrMore {
            OneOrMore(.word)
              "."
          }
        OneOrMore(.word)
      }
      "@"
      Capture {
        OneOrMore(.word)
          OneOrMore {
              "."
            OneOrMore(.word)
          }
      }
  }
  
  mutating func validateCredentials() {
    let isValidEmail = email.wholeMatch(of: emailPattern) != nil
    canContinueLogin = isValidEmail && password.count >= 4
  }
   
  func continueLoggingIn() {
    guard self.canContinueLogin else { return }
    writeUserData(User(email: email, fullname: "John Doe"))
  }
  
  func continueAsGuest() {
    writeUserData(User(email: "guest@exampleuser.com", fullname: "Guest User"))
  }
  
  func logout() {
    writeUserData(nil)
  }
  
  private func writeUserData(_ user: User?) {
    if let user = user, let userData = try? JSONEncoder().encode(user) {
      self.loggedInUserData = userData
      self.loggedInUser = true
    } else {
      self.loggedInUserData = Data()
      self.loggedInUser = false
    }
  }
}

struct LoginView: View {
  @State var viewModel: LoginViewModel = .init()
  
    var body: some View {
      VStack(alignment: .center) {
        Image(.autoMobile)
        
        Text("AutoMobile")
          .font(.largeTitle)
          .fontWeight(.black)

        VStack(alignment: .leading, spacing: 25) {
          TextField("Email", text: $viewModel.email)
            .keyboardType(.emailAddress)
            .textInputAutocapitalization(.never)
            .autocorrectionDisabled(true)
            .onChange(of: viewModel.email) {
              viewModel.validateCredentials()
            }
          
          SecureField("Password", text: $viewModel.password)
            .onChange(of: viewModel.password) {
              viewModel.validateCredentials()
            }
        }
        .padding(25)
        .textFieldStyle(.roundedBorder)
        
        HStack {
          if viewModel.canContinueLogin {
            Button("Sign in or Register") {
              viewModel.continueLoggingIn()
            }
            .buttonStyle(.borderedProminent)
            .buttonBorderShape(.capsule)
          }

          Button("Continue as Guest") {
            viewModel.continueAsGuest()
          }
          .buttonStyle(.bordered)
          .buttonBorderShape(.capsule)
          
        }
      }
    }
}

#Preview {
    LoginView()
}
