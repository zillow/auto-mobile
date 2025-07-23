//
//  Chip.swift
//  Playground
//
//  Created by José Antonio Arellano Mendoza on 23/07/25.
//

import SwiftUI

struct ChipView: View {
    let title: String
    @Binding var isSelected: Bool
    
    var body: some View {
        Button(action: {
            isSelected.toggle()
        }) {
            Text(title)
                .font(.caption)
                .padding(.horizontal, 12)
                .padding(.vertical, 6)
                .background(isSelected ? Color.blue.opacity(0.2) : Color.clear)
                .foregroundColor(isSelected ? .blue : .gray)
                .overlay(
                    RoundedRectangle(cornerRadius: 16)
                        .stroke(isSelected ? Color.blue : Color.gray, lineWidth: 1)
                )
                .cornerRadius(16)
        }
        .buttonStyle(PlainButtonStyle()) // evita efecto de escala por defecto
    }
}
