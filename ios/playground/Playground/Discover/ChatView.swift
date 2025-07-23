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

struct ChatView: View {
    @State private var messages: [Message] = []
    @State private var inputText: String = ""
    
    var body: some View {
        VStack {
            ScrollViewReader { proxy in
                ScrollView {
                    LazyVStack(spacing: 10) {
                        ForEach(messages) { message in
                            HStack {
                                if message.isFromUser {
                                    Spacer()
                                    Text(message.text)
                                        .padding()
                                        .background(Color.blue)
                                        .foregroundColor(.white)
                                        .cornerRadius(12)
                                } else {
                                    Text(message.text)
                                        .padding()
                                        .background(Color.gray.opacity(0.2))
                                        .cornerRadius(12)
                                    Spacer()
                                }
                            }
                            .padding(.horizontal)
                            .id(message.id)
                        }
                    }
                    .padding(.top)
                }
                .onChange(of: messages.count) { _ in
                    // Scroll to bottom when new message is added
                    if let last = messages.last {
                        withAnimation {
                            proxy.scrollTo(last.id, anchor: .bottom)
                        }
                    }
                }
            }

            Divider()

            HStack {
                TextField("Type a message...", text: $inputText)
                    .textFieldStyle(RoundedBorderTextFieldStyle())

                Button("Send") {
                    sendMessage()
                }
                .disabled(inputText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            }
            .padding()
        }
    }

    private func sendMessage() {
        let trimmed = inputText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        
        messages.append(Message(text: trimmed, isFromUser: true))
        
        // Simula respuesta
        DispatchQueue.main.asyncAfter(deadline: .now() + 1) {
            messages.append(Message(text: "Response to: \(trimmed)", isFromUser: false))
        }

        inputText = ""
    }
}

struct ChatView_Previews: PreviewProvider {
    static var previews: some View {
        ChatView()
    }
}
