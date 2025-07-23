//
//  TapView.swift
//  Playground
//
//  Created by José Antonio Arellano Mendoza on 23/07/25.
//

import SwiftUI

struct TapView: View {
  
  @State private var buttonCount: Int = 0
  @State private var iconCount: Int = 0
  @State private var isSwitchOn = false
  @State private var isCheckboxSelected = false
  @State private var isRadioButtonSelected = false
  @State private var chip1Selected = false
  @State private var chip2Selected = false
  @State private var chip3Selected = false
  @State private var sliderValue: Double = 50
  
  var body: some View {
    ScrollView(.vertical) {
      VStack(alignment: .leading, spacing: 16) {
        titleView
        buttonsSectionView
        togglesSectionView
        chipsSectionView
        slidersSectionView
        iconButtonsSectionView
        Spacer(minLength: 20)
      }
    }
    .padding()
  }
  
  var titleView: some View {
    VStack(alignment: .leading, spacing: 32) {
      Text("TAP SCREEN")
        .font(.title)
      Text("Various tappable widgets for testing")
        .font(.body)
    }
  }
  
  var buttonsSectionView: some View {
    VStack(spacing: 16) {
      HStack {
        Text("Buttons")
          .font(.headline)
        Spacer()
      }
      HStack {
        Text("Count: \(buttonCount)")
          .font(.body)
        Spacer()
      }
      HStack {
        borderedProminentButton
        borderedButton
      }
      HStack {
        borderlessButton
        plainButton
      }
      largeButton
    }
    .padding()
    .background(
        RoundedRectangle(cornerRadius: 12)
            .stroke(Color.gray, lineWidth: 2)
    )
    .padding(.horizontal, 2)
  }
  
  var borderedProminentButton: some View {
    Button {
      buttonCount += 1
    } label: {
      HStack {
        Spacer()
        Text("Prominent")
        Spacer()
      }
    }
    .buttonStyle(.borderedProminent)
  }
  
  var borderedButton: some View {
    Button {
      buttonCount += 1
    } label: {
      HStack {
        Spacer()
        Text("Bordered")
        Spacer()
      }
    }
    .buttonStyle(.bordered)
  }
  
  var borderlessButton: some View {
    Button {
      buttonCount += 1
    } label: {
      HStack {
        Spacer()
        Text("Borderless")
        Spacer()
      }
    }
    .buttonStyle(.borderless)
  }
  
  var plainButton: some View {
    Button {
      buttonCount += 1
    } label: {
      HStack {
        Spacer()
        Text("Plain")
        Spacer()
      }
    }
    .buttonStyle(.plain)
  }
  
  var largeButton: some View {
    Button {
      buttonCount += 1
    } label: {
      HStack {
        Spacer()
        Text("Large")
        Spacer()
      }
    }
    .buttonStyle(.borderedProminent)
  }
  
  var togglesSectionView: some View {
    VStack(alignment: .leading, spacing: 16) {
      HStack {
        Text("Toggle controls")
          .font(.headline)
        Spacer()
      }
      HStack(spacing: 16) {
        Toggle("", isOn: $isSwitchOn)
          .labelsHidden()
        Text("Switch")
        Spacer()
      }
      HStack(spacing: 16) {
        Checkbox(isOn: $isCheckboxSelected)
        Text("Checkbox")
        Spacer()
      }
      HStack(spacing: 16) {
        RadioButton(isOn: $isRadioButtonSelected)
        Text("Radio Button")
        Spacer()
      }
    }
    .padding()
    .background(
        RoundedRectangle(cornerRadius: 12)
            .stroke(Color.gray, lineWidth: 2)
    )
    .padding(.horizontal, 2)
  }
  
  var iconButtonsSectionView: some View {
    VStack(alignment: .leading, spacing: 16) {
      HStack {
        Text("Icon buttons")
          .font(.headline)
        Spacer()
      }
      HStack {
        Text("Count: \(iconCount)")
          .font(.body)
        Spacer()
      }
      HStack(spacing: 16) {
        Button {
          iconCount += 1
        } label: {
          Image(systemName: "pencil")
        }
        Button {
          iconCount += 1
        } label: {
          Image(systemName: "trash.fill")
        }
        Button {
          iconCount += 1
        } label: {
          Image(systemName: "heart.fill")
        }
        Button {
          iconCount += 1
        } label: {
          Image(systemName: "star.fill")
        }
        Button {
          iconCount += 1
        } label: {
          Image(systemName: "arrow.clockwise")
        }
      }
    }
    .padding()
    .background(
        RoundedRectangle(cornerRadius: 12)
            .stroke(Color.gray, lineWidth: 2)
    )
    .padding(.horizontal, 2)
  }
  
  var chipsSectionView: some View {
    VStack(alignment: .leading, spacing: 16) {
      HStack {
        Text("Filter Chips")
          .font(.headline)
        Spacer()
      }
      HStack(spacing: 16) {
        ChipView(title: "First chip", isSelected: $chip1Selected)
        ChipView(title: "Second chip", isSelected: $chip2Selected)
        ChipView(title: "Third chip", isSelected: $chip3Selected)
      }
    }
    .padding()
    .background(
        RoundedRectangle(cornerRadius: 12)
            .stroke(Color.gray, lineWidth: 2)
    )
    .padding(.horizontal, 2)
  }
  
  var slidersSectionView: some View {
    VStack(alignment: .leading, spacing: 16) {
      HStack {
        Text("Sliders")
          .font(.headline)
        Spacer()
      }
      Text("Slider value: \(sliderValue)")
      Slider(value: $sliderValue, in: 0...100)
      Text("Progress indicator")
      ProgressView("", value: sliderValue, total: 100)
        .progressViewStyle(.linear)
        .labelsHidden()
    }
    .padding()
    .background(
        RoundedRectangle(cornerRadius: 12)
            .stroke(Color.gray, lineWidth: 2)
    )
    .padding(.horizontal, 2)
  }
  
}
