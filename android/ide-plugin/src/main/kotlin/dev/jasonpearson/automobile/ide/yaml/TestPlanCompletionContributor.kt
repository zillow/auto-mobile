package dev.jasonpearson.automobile.ide.yaml

import com.intellij.codeInsight.completion.CompletionContributor
import com.intellij.codeInsight.completion.CompletionType
import com.intellij.patterns.PlatformPatterns.psiElement
import org.jetbrains.yaml.YAMLLanguage

class TestPlanCompletionContributor : CompletionContributor() {
  init {
    extend(
        CompletionType.BASIC,
        psiElement().withLanguage(YAMLLanguage.INSTANCE),
        TestPlanCompletionProvider(),
    )
  }
}
