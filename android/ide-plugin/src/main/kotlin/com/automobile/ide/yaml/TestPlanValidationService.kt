package com.automobile.ide.yaml

import com.intellij.openapi.Disposable
import com.intellij.openapi.components.Service
import com.intellij.openapi.editor.EditorFactory
import com.intellij.openapi.project.Project

/**
 * Project-level service that manages test plan YAML validation.
 * Registers document listeners to trigger real-time validation updates.
 */
@Service(Service.Level.PROJECT)
class TestPlanValidationService(private val project: Project) : Disposable {

    private val validationTrigger = IntellijValidationTrigger(project)
    private val listener = TestPlanDocumentListener(validationTrigger)

    init {
        // Register document listener for real-time validation updates
        EditorFactory.getInstance().eventMulticaster.addDocumentListener(listener, this)
    }

    override fun dispose() {
        listener.dispose()
    }

    companion object {
        fun getInstance(project: Project): TestPlanValidationService {
            return project.getService(TestPlanValidationService::class.java)
        }
    }
}
