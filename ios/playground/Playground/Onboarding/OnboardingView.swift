//
//  OnboardingView.swift
//  Playground
//
//  Created by Kishore Sajja on 7/23/25.
//

import SwiftUI

struct OnboardingPage: Identifiable {
  enum Image {
    case resource(ImageResource)
    case systemImage(String)
    case emoji(String)
  }
  
  var resource: OnboardingPage.Image
  var title: String
  var description: String
  
  var id: String { "\(title).\(resource)"}
  
  enum Pages {
    static let welcome = OnboardingPage(resource: .resource(.autoMobile),
                                        title: "Welcome to AutoMobile",
                                        description: "Experience the future of iOS UI Test Automation with intelligent source mapping and self-healing tests.")
    
    static let sourceCodeIntelligence = OnboardingPage(resource: .emoji("🔍"),
                                                       title: "Source Code Intelligence",
                                                       description: "Inspect your project source code directly through the view hierarchy using advanced code heuristics and source mapping.")
    
    static let smartGesturesAndInput = OnboardingPage(resource: .emoji("🦾"),
                                                      title: "Smart Gestures & Input",
                                                      description: "Precise gestures with window inset awareness and Unicode text input via virtual keyboards for comprehensive testing.")
    
    static let automaticTestGeneration = OnboardingPage(resource: .emoji("🤖"),
                                                        title: "Automated Test Generation",
                                                        description: "Automatically write tests with configurable credentials and experiment settings. Get highly actionable errors and self-healing capabilities.")
    
    static let openSource = OnboardingPage(resource: .emoji("❤️"),
                                           title: "Open Source",
                                           description: "Built by Zillow and hosted on [GitHub](https://github.com/zillow/auto-mobile)")
  }
}

struct OnboardingViewModel {
  var isOnboardingComplete: Bool = false
  var onboardingPages: [OnboardingPage] = [
    .Pages.welcome,
    .Pages.sourceCodeIntelligence,
    .Pages.smartGesturesAndInput,
    .Pages.automaticTestGeneration,
    .Pages.openSource,
  ]
}

struct OnboardingPageView: View {
  var page: OnboardingPage
    var body: some View {
      VStack(alignment: .center, spacing: 30) {

        if case OnboardingPage.Image.resource(let resource) = page.resource {
          Image(resource)
        } else if case OnboardingPage.Image.systemImage(let systemImage) = page.resource {
          Image(systemName: systemImage)
        } else if case OnboardingPage.Image.emoji(let symbol) = page.resource {
          Text(symbol)
            .font(.system(size: 100))
        }
          
        Text(page.title)
          .font(.title)
          .fontWeight(.bold)
        if let markdown = try? AttributedString(markdown: page.description) {
          Text(markdown)
            .font(.body)
            .foregroundColor(.secondary)
            .multilineTextAlignment(.center)
        } else {
          Text(page.description)
            .font(.body)
            .foregroundColor(.secondary)
            .multilineTextAlignment(.center)
        }
        
      }.padding()
    }
}

struct OnboardingViewMode {
    let pages: [OnboardingPage] = [
      .Pages.welcome,
      .Pages.sourceCodeIntelligence,
      .Pages.smartGesturesAndInput,
      .Pages.automaticTestGeneration,
      .Pages.openSource
    ]
  var currentPage: Int = 0
}

struct OnboardingView: View {
  @State var viewmodel: OnboardingViewMode = .init()
  @AppStorage("onboardingCompelte") private var onboardingCompelte = false
  @Environment(\.dismiss) var dismiss
    var body: some View {
      TabView(selection: $viewmodel.currentPage) {
        ForEach(viewmodel.pages.indices, id: \.self) { index in
          OnboardingPageView(page: viewmodel.pages[index])
            .tag(index)
        }
      }
      .tabViewStyle(PageTabViewStyle(indexDisplayMode: .automatic))
      .indexViewStyle(PageIndexViewStyle(backgroundDisplayMode: .always))
                      
      HStack {
        Button {
          if viewmodel.currentPage > 0 {
            withAnimation {
              viewmodel.currentPage -= 1
            }
          }
        } label: {
          Text("Back")
            .padding([.leading, .trailing])
        }.padding(.leading)
        .buttonStyle(.bordered)
        .buttonBorderShape(.capsule)
        .disabled(viewmodel.currentPage == 0)
        
        Spacer()

        Button {
          if viewmodel.currentPage < viewmodel.pages.count - 1 {
            withAnimation {
              viewmodel.currentPage += 1
            }
          } else {
            onboardingCompelte = true
            dismiss()
          }
            
        } label: {
          if viewmodel.currentPage == viewmodel.pages.count - 1 {
            Text("Get started")
              .padding([.leading, .trailing])
          } else {
            Text("Next")
              .padding([.leading, .trailing])
          }
        }
        .padding(.trailing)
        .buttonStyle(.borderedProminent)
        .buttonBorderShape(.capsule)
        .tint(.black)
      }.padding()
    }
}

#Preview {
    OnboardingView()
}
