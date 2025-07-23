import SwiftUI

extension ListView {
  @Observable
  class ViewModel: ObservableObject {
          var todoItems: [TodoItem] = TodoItem.sampleData
          
          var newItemText = ""
          var isAddingNewItem = false
          
          func toggleItem(_ id: UUID) {
              if let index = todoItems.firstIndex(where: { $0.id == id }) {
                  todoItems[index].isCompleted.toggle()
              }
          }
          
          func moveItems(from source: IndexSet, to destination: Int) {
              todoItems.move(fromOffsets: source, toOffset: destination)
          }
          
          func deleteItems(at offsets: IndexSet) {
              todoItems.remove(atOffsets: offsets)
          }
          
          func addNewItem() {
              guard !newItemText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
                  return
              }
              
              let newItem = TodoItem(text: newItemText.trimmingCharacters(in: .whitespacesAndNewlines))
              todoItems.append(newItem)
              newItemText = ""
              isAddingNewItem = false
          }
          
          func cancelAddingItem() {
              newItemText = ""
              isAddingNewItem = false
          }
          
          func startAddingNewItem() {
              isAddingNewItem = true
          }
      }
}

// MARK: - Sample Model

struct TodoItem: Identifiable {
    let id = UUID()
    var text: String
    var isCompleted: Bool = false
}

extension TodoItem {
    static let sampleData = [
        TodoItem(text: "Buy groceries"),
        TodoItem(text: "Walk the dog"),
        TodoItem(text: "Finish project"),
        TodoItem(text: "Call mom"),
        TodoItem(text: "Read a book")
    ]
}
