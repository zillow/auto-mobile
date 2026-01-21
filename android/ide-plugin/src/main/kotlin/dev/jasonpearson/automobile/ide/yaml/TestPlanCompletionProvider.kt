package dev.jasonpearson.automobile.ide.yaml

import com.intellij.codeInsight.completion.CompletionParameters
import com.intellij.codeInsight.completion.CompletionProvider
import com.intellij.codeInsight.completion.CompletionResultSet
import com.intellij.codeInsight.lookup.LookupElementBuilder
import com.intellij.openapi.util.TextRange
import com.intellij.psi.PsiElement
import com.intellij.psi.util.PsiTreeUtil
import com.intellij.util.ProcessingContext
import org.jetbrains.yaml.psi.YAMLDocument
import org.jetbrains.yaml.psi.YAMLFile
import org.jetbrains.yaml.psi.YAMLKeyValue
import org.jetbrains.yaml.psi.YAMLMapping
import org.jetbrains.yaml.psi.YAMLSequence
import org.jetbrains.yaml.psi.YAMLSequenceItem

class TestPlanCompletionProvider : CompletionProvider<CompletionParameters>() {
  override fun addCompletions(
      parameters: CompletionParameters,
      context: ProcessingContext,
      result: CompletionResultSet,
  ) {
    val file = parameters.originalFile as? YAMLFile ?: return
    val virtualFile = file.virtualFile ?: return
    if (!TestPlanDetector.isTestPlanFile(virtualFile)) {
      return
    }

    val position = parameters.position
    val keyValue = PsiTreeUtil.getParentOfType(position, YAMLKeyValue::class.java)

    if (keyValue != null && isInValue(position, keyValue)) {
      handleValueCompletion(position, keyValue, result)
      return
    }

    val mapping = PsiTreeUtil.getParentOfType(position, YAMLMapping::class.java) ?: return
    handleKeyCompletion(position, mapping, result)
  }

  private fun handleValueCompletion(
      position: PsiElement,
      keyValue: YAMLKeyValue,
      result: CompletionResultSet,
  ) {
    val stepMapping = findStepMapping(position)
    if (stepMapping != null) {
      if (keyValue.keyText == "tool") {
        addToolNameCompletions(result)
        return
      }

      val path = buildPathForKeyValue(keyValue, stepMapping)
      val schemaContext = resolveStepSchemaContext(stepMapping, path) ?: return
      val enumValues =
          JsonSchemaIntrospector.collectEnumValues(schemaContext.schema, schemaContext.path)
      addEnumValueCompletions(result, enumValues)
      return
    }

    val metadataRoot = findMetadataRootMapping(position) ?: return
    val schema = TestPlanSchemaStore.getMetadataSchema() ?: return
    val path = buildPathForKeyValue(keyValue, metadataRoot)
    val enumValues = JsonSchemaIntrospector.collectEnumValues(schema, path)
    addEnumValueCompletions(result, enumValues)
  }

  private fun handleKeyCompletion(
      position: PsiElement,
      mapping: YAMLMapping,
      result: CompletionResultSet,
  ) {
    if (isTopLevelMapping(mapping)) {
      addPropertyCompletions(result, mapping, TestPlanSchemaStore.getRootProperties())
      return
    }

    val metadataRoot = findMetadataRootMapping(position)
    if (metadataRoot != null) {
      val schema = TestPlanSchemaStore.getMetadataSchema() ?: return
      val path = buildPathForMapping(mapping, metadataRoot)
      val properties = JsonSchemaIntrospector.collectProperties(schema, path)
      addPropertyCompletions(result, mapping, properties)
      return
    }

    val stepMapping = findStepMapping(position) ?: return
    val path = buildPathForMapping(mapping, stepMapping)
    val expectationPath = extractExpectationPath(path)
    if (expectationPath != null) {
      val expectationSchema = TestPlanSchemaStore.getExpectationSchema() ?: return
      val properties = JsonSchemaIntrospector.collectProperties(expectationSchema, expectationPath)
      addPropertyCompletions(result, mapping, properties)
      return
    }

    val properties =
        when {
          path.isEmpty() -> TestPlanSchemaStore.getStepProperties()
          path.firstOrNull()?.key == "params" -> {
            val toolName = getToolName(stepMapping)
            val toolSchema =
                toolName?.let { ToolDefinitionStore.getToolDefinitions()[it]?.inputSchema }
            toolSchema
                ?.let { JsonSchemaIntrospector.collectProperties(it, stripParamsPrefix(path)) }
                .orEmpty()
          }
          else -> emptyMap()
        }

    addPropertyCompletions(result, mapping, properties)
  }

  private fun addToolNameCompletions(result: CompletionResultSet) {
    val definitions = ToolDefinitionStore.getToolDefinitions()
    if (definitions.isEmpty()) {
      TestPlanToolCategories.tools().forEach { toolName ->
        result.addElement(LookupElementBuilder.create(toolName))
      }
      return
    }

    definitions.values
        .sortedBy { it.name }
        .forEach { tool ->
          var builder = LookupElementBuilder.create(tool.name)
          TestPlanToolCategories.categoryFor(tool.name)?.let { category ->
            builder = builder.withTypeText(category, true)
          }
          if (!tool.description.isNullOrBlank()) {
            builder = builder.withTailText(" \u2014 ${tool.description}", true)
          }
          result.addElement(builder)
        }
  }

  private fun addPropertyCompletions(
      result: CompletionResultSet,
      mapping: YAMLMapping,
      properties: Map<String, SchemaPropertyInfo>,
  ) {
    val existingKeys = mapping.keyValues.map { it.keyText }.toSet()
    properties.values
        .filter { it.name !in existingKeys }
        .sortedBy { it.name }
        .forEach { property ->
          var builder = LookupElementBuilder.create(property.name)
          if (!property.description.isNullOrBlank()) {
            builder = builder.withTailText(" \u2014 ${property.description}", true)
          }
          builder =
              when {
                property.deprecated -> builder.strikeout().withTypeText("Deprecated", true)
                property.required -> builder.withTypeText("Required", true)
                else -> builder
              }
          result.addElement(builder)
        }
  }

  private fun addEnumValueCompletions(result: CompletionResultSet, values: Set<String>) {
    values.sorted().forEach { value -> result.addElement(LookupElementBuilder.create(value)) }
  }

  private fun resolveStepSchemaContext(
      stepMapping: YAMLMapping,
      path: List<SchemaPathSegment>,
  ): SchemaContext? {
    val expectationPath = extractExpectationPath(path)
    if (expectationPath != null) {
      val expectationSchema = TestPlanSchemaStore.getExpectationSchema() ?: return null
      return SchemaContext(expectationSchema, expectationPath)
    }

    if (path.firstOrNull()?.key != "params") {
      return null
    }

    val toolName = getToolName(stepMapping) ?: return null
    val toolSchema = ToolDefinitionStore.getToolDefinitions()[toolName]?.inputSchema ?: return null
    return SchemaContext(toolSchema, stripParamsPrefix(path))
  }

  private fun extractExpectationPath(path: List<SchemaPathSegment>): List<SchemaPathSegment>? {
    val index = path.indexOfFirst { it.key == "expectations" }
    if (index == -1) {
      return null
    }
    return path.drop(index + 1)
  }

  private fun stripParamsPrefix(path: List<SchemaPathSegment>): List<SchemaPathSegment> {
    return if (path.firstOrNull()?.key == "params") {
      path.drop(1)
    } else {
      path
    }
  }

  private fun getToolName(stepMapping: YAMLMapping): String? {
    val toolKeyValue = stepMapping.getKeyValueByKey("tool") ?: return null
    return toolKeyValue.valueText.trim().takeIf { it.isNotEmpty() }
  }

  private fun isInValue(position: PsiElement, keyValue: YAMLKeyValue): Boolean {
    val value = keyValue.value
    if (value != null && value.textRange.contains(position.textOffset)) {
      return true
    }

    val key = keyValue.key ?: return false
    val range = TextRange(key.textRange.endOffset, keyValue.textRange.endOffset)
    return range.contains(position.textOffset)
  }

  private fun isTopLevelMapping(mapping: YAMLMapping): Boolean {
    return mapping.parent is YAMLDocument
  }

  private fun findMetadataRootMapping(element: PsiElement): YAMLMapping? {
    var current: PsiElement? = element
    while (current != null) {
      val keyValue = PsiTreeUtil.getParentOfType(current, YAMLKeyValue::class.java) ?: return null
      if (keyValue.keyText == "metadata") {
        val parentMapping = PsiTreeUtil.getParentOfType(keyValue, YAMLMapping::class.java)
        if (parentMapping != null && isTopLevelMapping(parentMapping)) {
          return keyValue.value as? YAMLMapping
        }
      }
      current = keyValue.parent
    }
    return null
  }

  private fun findStepMapping(element: PsiElement): YAMLMapping? {
    var current: PsiElement? = element
    while (current != null) {
      val sequenceItem =
          PsiTreeUtil.getParentOfType(current, YAMLSequenceItem::class.java) ?: return null
      val sequence = sequenceItem.parent as? YAMLSequence ?: return null
      val keyValue = PsiTreeUtil.getParentOfType(sequence, YAMLKeyValue::class.java)
      if (keyValue?.keyText == "steps") {
        return sequenceItem.value as? YAMLMapping
      }
      current = sequence.parent
    }
    return null
  }

  private fun buildPathForMapping(
      mapping: YAMLMapping,
      rootMapping: YAMLMapping,
  ): List<SchemaPathSegment> {
    if (mapping == rootMapping) {
      return emptyList()
    }

    val segments = mutableListOf<SchemaPathSegment>()
    var current: YAMLMapping? = mapping
    while (current != null && current != rootMapping) {
      when (val parent = current.parent) {
        is YAMLSequenceItem -> {
          val sequence = parent.parent as? YAMLSequence
          val owner = sequence?.let { PsiTreeUtil.getParentOfType(it, YAMLKeyValue::class.java) }
          if (owner != null) {
            segments.add(SchemaPathSegment(owner.keyText, true))
            current = PsiTreeUtil.getParentOfType(owner, YAMLMapping::class.java)
            continue
          }
        }
        is YAMLKeyValue -> {
          segments.add(SchemaPathSegment(parent.keyText, false))
          current = PsiTreeUtil.getParentOfType(parent, YAMLMapping::class.java)
          continue
        }
      }
      current = null
    }

    return segments.reversed()
  }

  private fun buildPathForKeyValue(
      keyValue: YAMLKeyValue,
      rootMapping: YAMLMapping,
  ): List<SchemaPathSegment> {
    val parentMapping =
        PsiTreeUtil.getParentOfType(keyValue, YAMLMapping::class.java) ?: return emptyList()
    val basePath = buildPathForMapping(parentMapping, rootMapping)
    return basePath + SchemaPathSegment(keyValue.keyText, false)
  }

  private data class SchemaContext(
      val schema: kotlinx.serialization.json.JsonObject,
      val path: List<SchemaPathSegment>,
  )
}
