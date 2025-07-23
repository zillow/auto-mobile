import SwiftUI

struct ListView: View {
  
    @State private var viewModel = ViewModel()
    
    var body: some View {
        NavigationView {
            VStack {
                List {
                    ForEach(viewModel.todoItems) { item in
                        TodoRowView(
                            item: item,
                            onToggle: { viewModel.toggleItem(item.id) }
                        )
                    }
                    .onMove(perform: viewModel.moveItems)
                    .onDelete(perform: viewModel.deleteItems)
                    
                    if viewModel.isAddingNewItem {
                        HStack {
                            TextField("New todo item", text: $viewModel.newItemText)
                                .textFieldStyle(RoundedBorderTextFieldStyle())
                                .onSubmit {
                                    viewModel.addNewItem()
                                }
                            
                            Button("Cancel") {
                                viewModel.cancelAddingItem()
                            }
                            .foregroundColor(.red)
                        }
                        .padding(.vertical, 4)
                    }
                }
                .navigationTitle("List")
                .navigationBarTitleDisplayMode(.large)
                .toolbar {
                    ToolbarItemGroup(placement: .navigationBarTrailing) {
                        EditButton()
                        
                        Button(action: {
                            viewModel.startAddingNewItem()
                        }) {
                            Image(systemName: "plus")
                        }
                        .disabled(viewModel.isAddingNewItem)
                    }
                }
            }
        }
    }
}

struct TodoRowView: View {
    let item: TodoItem
    let onToggle: () -> Void
    
    var body: some View {
        HStack {
            Button(action: onToggle) {
                Image(systemName: item.isCompleted ? "checkmark.circle.fill" : "circle")
                    .foregroundColor(item.isCompleted ? .green : .gray)
                    .font(.title2)
            }
            .buttonStyle(PlainButtonStyle())
            
            Text(item.text)
                .strikethrough(item.isCompleted)
                .foregroundColor(item.isCompleted ? .gray : .primary)
                .animation(.easeInOut(duration: 0.2), value: item.isCompleted)
            
            Spacer()
        }
    }
}

