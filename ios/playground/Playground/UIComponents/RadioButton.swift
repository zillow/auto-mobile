//
//  RadioButton.swift
//  Playground
//
//  Created by José Antonio Arellano Mendoza on 23/07/25.
//

import SwiftUI

struct RadioButton: View {
    @Binding var isOn: Bool

    var body: some View {
      Image(systemName: isOn ? "largecircle.fill.circle" : "circle")
          .foregroundColor(isOn ? .blue : .gray)
          .font(.title3)
          .onTapGesture {
            isOn.toggle()
          }
    }
}
