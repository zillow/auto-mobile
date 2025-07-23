import SwiftUI

struct InputsView: View {
    
    @State private var basicText = ""
    @State private var placeholderText = ""
    @State private var styledText = ""
    @State private var numberText = ""
    @State private var emailText = ""
    @State private var password = ""
    @State private var multilineText = ""
    @State private var searchText = ""
    @State private var limitedText = ""
    @State private var decimalText = ""
    @State private var phoneText = ""
    
    var body: some View {
        ScrollView {
            VStack(spacing: 20) {
                // Header
                Text("Comprehensive list of text input views")
                    .font(.subheadline)
                    .foregroundColor(.secondary)
                    .padding(.top)
                
                // Basic TextField
                VStack(alignment: .leading, spacing: 8) {
                    Text("Basic TextField")
                        .font(.headline)
                    TextField("Enter text", text: $basicText)
                        .textFieldStyle(.roundedBorder)
                }
                
                // TextField with placeholder
                VStack(alignment: .leading, spacing: 8) {
                    Text("TextField with Custom Placeholder")
                        .font(.headline)
                    TextField("Type something here...", text: $placeholderText)
                        .textFieldStyle(.roundedBorder)
                }
                
                // Styled TextField
                VStack(alignment: .leading, spacing: 8) {
                    Text("Styled TextField")
                        .font(.headline)
                    TextField("Custom styled field", text: $styledText)
                        .padding()
                        .background(Color.gray.opacity(0.1))
                        .cornerRadius(10)
                        .overlay(
                            RoundedRectangle(cornerRadius: 10)
                                .stroke(Color.blue, lineWidth: 2)
                        )
                }
                
                // Number input
                VStack(alignment: .leading, spacing: 8) {
                    Text("Number Input")
                        .font(.headline)
                    TextField("Enter numbers only", text: $numberText)
                        .keyboardType(.numberPad)
                        .textFieldStyle(.roundedBorder)
                }
                
                // Decimal input
                VStack(alignment: .leading, spacing: 8) {
                    Text("Decimal Input")
                        .font(.headline)
                    TextField("0.00", text: $decimalText)
                        .keyboardType(.decimalPad)
                        .textFieldStyle(.roundedBorder)
                }
                
                // Phone input
                VStack(alignment: .leading, spacing: 8) {
                    Text("Phone Number Input")
                        .font(.headline)
                    TextField("(555) 123-4567", text: $phoneText)
                        .keyboardType(.phonePad)
                        .textFieldStyle(.roundedBorder)
                }
                
                // Email input
                VStack(alignment: .leading, spacing: 8) {
                    Text("Email Input")
                        .font(.headline)
                    TextField("user@example.com", text: $emailText)
                        .keyboardType(.emailAddress)
                        .autocapitalization(.none)
                        .disableAutocorrection(true)
                        .textFieldStyle(.roundedBorder)
                }
                
                // Password field
                VStack(alignment: .leading, spacing: 8) {
                    Text("SecureField (Password)")
                        .font(.headline)
                    SecureField("Enter password", text: $password)
                        .textFieldStyle(.roundedBorder)
                }
                
                // Search field
                VStack(alignment: .leading, spacing: 8) {
                    Text("Search Field")
                        .font(.headline)
                    HStack {
                        Image(systemName: "magnifyingglass")
                            .foregroundColor(.gray)
                        TextField("Search...", text: $searchText)
                    }
                    .padding(8)
                    .background(Color.gray.opacity(0.1))
                    .cornerRadius(8)
                }
                
                // Character limited text field
                VStack(alignment: .leading, spacing: 8) {
                    Text("Limited Text Field (20 chars)")
                        .font(.headline)
                    TextField("Max 20 characters", text: $limitedText)
                        .textFieldStyle(.roundedBorder)
                        .onChange(of: limitedText) { _, newValue in
                            if newValue.count > 20 {
                                limitedText = String(newValue.prefix(20))
                            }
                        }
                  
                    Text("\(limitedText.count)/20 characters")
                        .font(.caption)
                        .foregroundColor(.gray)
                }
                
                // Multiline TextEditor
                VStack(alignment: .leading, spacing: 8) {
                    Text("TextEditor (Multiline)")
                        .font(.headline)
                    TextEditor(text: $multilineText)
                        .frame(height: 100)
                        .padding(4)
                        .background(Color.gray.opacity(0.1))
                        .cornerRadius(8)
                        .overlay(
                            RoundedRectangle(cornerRadius: 8)
                                .stroke(Color.gray.opacity(0.3), lineWidth: 1)
                        )
                }
                
                // TextEditor with placeholder effect
                VStack(alignment: .leading, spacing: 8) {
                    Text("TextEditor with Placeholder")
                        .font(.headline)
                    ZStack(alignment: .topLeading) {
                        TextEditor(text: $multilineText)
                            .frame(height: 80)
                        
                        if multilineText.isEmpty {
                            Text("Enter your thoughts here...")
                                .foregroundColor(.gray)
                                .padding(.horizontal, 4)
                                .padding(.vertical, 8)
                        }
                    }
                    .padding(4)
                    .background(Color.gray.opacity(0.1))
                    .cornerRadius(8)
                }
                
                // Form-style inputs
                VStack(alignment: .leading, spacing: 8) {
                    Text("Form Style Inputs")
                        .font(.headline)
                    
                    Form {
                        Section("Personal Information") {
                            TextField("First Name", text: $basicText)
                            TextField("Last Name", text: $placeholderText)
                            TextField("Email", text: $emailText)
                                .keyboardType(.emailAddress)
                        }
                        
                        Section("Security") {
                            SecureField("Password", text: $password)
                            SecureField("Confirm Password", text: $password)
                        }
                    }
                    .frame(height: 200)
                }
                
                Spacer(minLength: 20)
            }
            .padding(.horizontal)
        }
        .navigationTitle("Text Inputs")
        .navigationBarTitleDisplayMode(.inline)
    }
}
