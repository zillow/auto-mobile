package dev.jasonpearson.automobile.ide.telemetry

import com.intellij.openapi.fileEditor.OpenFileDescriptor
import com.intellij.openapi.project.Project
import com.intellij.psi.search.FilenameIndex
import com.intellij.psi.search.GlobalSearchScope

/**
 * Finds and opens source files in the IDE by file name and optional line number.
 */
object SourceFileFinder {

    /**
     * Find the source file and navigate to the specified line.
     * If multiple matches exist, filters by className package path matching file path.
     */
    fun findAndOpen(project: Project, fileName: String, lineNumber: Int, className: String? = null) {
        val files = FilenameIndex.getVirtualFilesByName(fileName, GlobalSearchScope.projectScope(project))
        if (files.isEmpty()) return

        val target = if (files.size == 1 || className == null) {
            files.first()
        } else {
            // Convert class name package to path segments for matching
            val packagePath = className.substringBeforeLast('.').replace('.', '/')
            files.firstOrNull { file ->
                file.path.contains(packagePath)
            } ?: files.first()
        }

        val line = (lineNumber - 1).coerceAtLeast(0)
        OpenFileDescriptor(project, target, line, 0).navigate(true)
    }
}
