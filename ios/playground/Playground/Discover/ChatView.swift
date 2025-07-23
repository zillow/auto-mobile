//
//  ChatView.swift
//  Playground
//
//  Created by José Antonio Arellano Mendoza on 23/07/25.
//

import SwiftUI
struct Message: Identifiable {
  let id = UUID()
  let text: String
  let isFromUser: Bool
}
struct BubbleTail: Shape {
  let isOutgoing: Bool // Determines tail direction
  
  func path(in rect: CGRect) -> Path {
    var path = Path()
    if !isOutgoing {
      path.move(to: CGPoint(x: rect.maxX, y: rect.maxY))
      path.addLine(to: CGPoint(x: rect.maxX - 15, y: rect.maxY - 15))
      path.addLine(to: CGPoint(x: rect.maxX - 15, y: rect.maxY))
    } else {
      path.move(to: CGPoint(x: rect.minX, y: rect.maxY))
      path.addLine(to: CGPoint(x: rect.minX + 15, y: rect.maxY - 15))
      path.addLine(to: CGPoint(x: rect.minX + 15, y: rect.maxY))
    }
    path.closeSubpath()
    return path
  }
}
extension Color {
  static let outgoingMessageBackground: Color = .init(red: 0.05, green: 0.05, blue: 0.05)
  static let incomingMessageBackground: Color = .init(red: 0.95, green: 0.95, blue: 0.95)
}

struct ChatBubbleView: View {
  let message: String
  let isOutgoing: Bool
  
  var body: some View {
    HStack {
      Text(message)
        .padding()
        .background(
          RoundedRectangle(cornerRadius: 15)
            .fill(isOutgoing ? Color.outgoingMessageBackground : Color.incomingMessageBackground)
        )
        .foregroundColor(isOutgoing ? .white : .black)
        .overlay(
          BubbleTail(isOutgoing: isOutgoing)
            .fill(isOutgoing ? Color.outgoingMessageBackground : Color.incomingMessageBackground)
            .frame(width: 15, height: 15)
            .offset(x: isOutgoing ? 0 : 0, y: 0), // Adjust offset as needed
          alignment: isOutgoing ? .bottomTrailing : .bottomLeading
        )
    }
  }
}
struct ChatViewModel {
  var messages: [Message] = [
    .init(text: "Hello! Welcome to the chat screen. This is an example of realistic chat interface.", isFromUser: false),
    
      .init(text: "You can type message and they will appear here. Try sending a message!", isFromUser: false),
  ]
  
  static let botResponses = [
    "That's interesting! Tell me more.",
    "I see what you mean.",
    "Thanks for sharing that with me.",
    "How do you feel about that?",
    "What do you think about this topic?",
    "That sounds great!",
    "I understand your perspective.",
    "Could you elaborate on that?",
    "That's a good point.",
    "I appreciate you telling me this."]
  
  
}

struct ChatView: View {
  @State private var inputText: String = ""
  @State private var viewModel = ChatViewModel()
  
  var body: some View {
    VStack {
      VStack {
        HStack {
          VStack(alignment: .leading) {
            Text("AI")
              .font(.headline)
              .fontWeight(.bold)
              .padding()
              .background(Circle().fill(Color.black))
              .foregroundColor(.white)
          }
          
          VStack(alignment: .leading) {
            Text("Chat assistant")
              .font(.headline)
              .fontWeight(.bold)
            Text("Online")
          }
          .frame(maxWidth: .infinity, alignment: .center)
          
          VStack(alignment: .trailing) {
            Button {
              requestMessage()
            } label: {
              Text("Request Message")
                .font(.subheadline)
                .frame(width: 140)
                .padding()
            }
            .foregroundColor(.white)
            .background(.black)
            .cornerRadius(100)
          }
          .frame(maxWidth: .infinity, alignment: .center)
        }
        .padding()
      }
      .background(Color.gray.opacity(0.2))
      
      ScrollViewReader { proxy in
        ScrollView {
          LazyVStack(spacing: 10) {
            ForEach(viewModel.messages) { message in
              HStack {
                if message.isFromUser {
                  HStack {
                    Spacer()
                    ChatBubbleView(message: message.text, isOutgoing: message.isFromUser)
                    Text("You")
                      .font(.subheadline)
                      .fontWeight(.bold)
                      .padding()
                      .background(Circle().fill(Color.black))
                      .foregroundColor(.white)
                    
                  }
                } else {
                  HStack {
                    Text("AI")
                      .font(.subheadline)
                      .fontWeight(.bold)
                      .padding()
                      .background(Circle().fill(Color.red))
                      .foregroundColor(.white)
                    ChatBubbleView(message: message.text, isOutgoing: message.isFromUser)
                  }
                  Spacer()
                }
              }
              .padding(.horizontal)
              .id(message.id)
            }
          }
          .padding(.top)
        }
        .onChange(of: viewModel.messages.count) {
          // Scroll to bottom when new message is added
          if let last = viewModel.messages.last {
            withAnimation {
              proxy.scrollTo(last.id, anchor: .bottom)
            }
          }
        }
      }
      
      Divider()
      
      HStack(alignment: .center, spacing: 20) {
        TextField("What do you want to say?", text: $inputText, axis: .vertical)
          .font(.system(size: 20))
          .textFieldStyle(.roundedBorder)
          .lineLimit(3, reservesSpace: true)
        
        Button {
          sendMessage()
        } label: {
          Image(systemName:"paperplane.circle")
            .resizable()
            .frame(width: 50, height: 50)
        }
        .buttonStyle(.bordered)
        .buttonBorderShape(.roundedRectangle)
        .disabled(inputText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
      }
      .padding()
    }
  }
  private func requestMessage() {
    Task.detached {
      try? await Task.sleep(for: .seconds(1))
      await MainActor.run {
        let message = ChatViewModel.botResponses.randomElement() ?? "I see.."
        viewModel.messages.append(Message(text:message, isFromUser: false))
      }
    }
  }
  private func sendMessage() {
    let trimmed = inputText.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmed.isEmpty else { return }
    viewModel.messages.append(Message(text: trimmed, isFromUser: true))
    self.requestMessage()
    inputText = ""
  }
}

struct ChatView_Previews: PreviewProvider {
  static var previews: some View {
    ChatView()
  }
}
