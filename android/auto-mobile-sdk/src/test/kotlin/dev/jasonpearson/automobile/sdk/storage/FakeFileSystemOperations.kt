package dev.jasonpearson.automobile.sdk.storage

import java.io.File

/** Fake implementation of FileSystemOperations for testing. */
class FakeFileSystemOperations : FileSystemOperations {
  private val files = mutableMapOf<String, MutableList<File>>()
  private val existingFiles = mutableSetOf<String>()

  /**
   * Adds a file to a directory for testing.
   *
   * @param directory The directory path
   * @param file The file to add
   */
  fun addFile(directory: String, file: File) {
    files.getOrPut(directory) { mutableListOf() }.add(file)
    existingFiles.add(file.absolutePath)
  }

  /**
   * Sets whether a file exists.
   *
   * @param path The file path
   * @param exists Whether the file exists
   */
  fun setFileExists(path: String, exists: Boolean) {
    if (exists) {
      existingFiles.add(path)
    } else {
      existingFiles.remove(path)
    }
  }

  /** Clears all stored file data. */
  fun clear() {
    files.clear()
    existingFiles.clear()
  }

  override fun listFiles(directory: File): List<File> {
    return files[directory.absolutePath] ?: emptyList()
  }

  override fun exists(file: File): Boolean {
    return existingFiles.contains(file.absolutePath)
  }
}
