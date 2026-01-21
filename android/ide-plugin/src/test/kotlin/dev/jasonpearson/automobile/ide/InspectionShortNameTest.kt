package dev.jasonpearson.automobile.ide

import com.intellij.codeInspection.InspectionProfileEntry
import javax.xml.XMLConstants
import javax.xml.parsers.DocumentBuilderFactory
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertTrue
import org.junit.Test
import org.w3c.dom.Element

class InspectionShortNameTest {

  @Test
  fun `localInspection short names match implementation`() {
    val document = loadPluginXml()
    val inspections = document.getElementsByTagName("localInspection")
    assertTrue(inspections.length > 0, "Expected at least one localInspection in plugin.xml")

    for (index in 0 until inspections.length) {
      val element = inspections.item(index) as Element
      val implementationClass = element.getAttribute("implementationClass").trim()
      assertTrue(
          implementationClass.isNotEmpty(),
          "localInspection entry is missing implementationClass",
      )

      val expectedShortName =
          element.getAttribute("shortName").trim().ifEmpty { deriveShortName(implementationClass) }
      val inspection = newInspectionInstance(implementationClass)
      val actualShortName = inspection.shortName

      assertEquals(
          expectedShortName,
          actualShortName,
          "Short name mismatch for $implementationClass",
      )
    }
  }

  private fun loadPluginXml(): org.w3c.dom.Document {
    val resource =
        assertNotNull(
            javaClass.classLoader.getResourceAsStream("META-INF/plugin.xml"),
            "META-INF/plugin.xml not found on the classpath",
        )

    resource.use {
      val factory = DocumentBuilderFactory.newInstance()
      factory.setFeature(XMLConstants.FEATURE_SECURE_PROCESSING, true)
      factory.setFeature("http://apache.org/xml/features/disallow-doctype-decl", true)
      factory.setFeature("http://xml.org/sax/features/external-general-entities", false)
      factory.setFeature("http://xml.org/sax/features/external-parameter-entities", false)
      factory.isXIncludeAware = false
      factory.isExpandEntityReferences = false
      return factory.newDocumentBuilder().parse(it)
    }
  }

  private fun deriveShortName(implementationClass: String): String {
    val simpleName = implementationClass.substringAfterLast('.')
    return if (simpleName.endsWith("Inspection") && simpleName != "Inspection") {
      simpleName.removeSuffix("Inspection")
    } else {
      simpleName
    }
  }

  private fun newInspectionInstance(implementationClass: String): InspectionProfileEntry {
    val inspectionClass = Class.forName(implementationClass, true, javaClass.classLoader)
    val constructor = inspectionClass.getDeclaredConstructor()
    constructor.isAccessible = true
    val instance = constructor.newInstance()
    return instance as? InspectionProfileEntry
        ?: error("Class $implementationClass is not an InspectionProfileEntry")
  }
}
