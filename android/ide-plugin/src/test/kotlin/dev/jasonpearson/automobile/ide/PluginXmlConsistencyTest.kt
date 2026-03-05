package dev.jasonpearson.automobile.ide

import kotlin.test.assertNotNull
import kotlin.test.assertTrue
import org.junit.Test
import org.w3c.dom.Element
import javax.xml.XMLConstants
import javax.xml.parsers.DocumentBuilderFactory

/**
 * Verifies that every class reference declared in plugin.xml (factoryClass, instance,
 * serviceImplementation, implementationClass, listener class) points to a real class on the
 * compile classpath. Catches rename/delete regressions without needing to boot an IDE instance.
 */
class PluginXmlConsistencyTest {

    // Maps element tag names to the attribute that holds a class name.
    private val classAttributes = mapOf(
        "toolWindow" to "factoryClass",
        "applicationConfigurable" to "instance",
        "applicationService" to "serviceImplementation",
        "externalAnnotator" to "implementationClass",
        "completion.contributor" to "implementationClass",
        "localInspection" to "implementationClass",
    )

    @Test
    fun `all plugin xml extension classes are loadable`() {
        val document = loadPluginXml()
        val missing = mutableListOf<String>()

        for ((tagName, attr) in classAttributes) {
            val elements = document.getElementsByTagName(tagName)
            for (i in 0 until elements.length) {
                val element = elements.item(i) as Element
                val className = element.getAttribute(attr).trim()
                if (className.isNotEmpty() && !isLoadable(className)) {
                    missing.add("<$tagName $attr=\"$className\">")
                }
            }
        }

        // projectListeners use "class" (not "topic")
        val listeners = document.getElementsByTagName("listener")
        for (i in 0 until listeners.length) {
            val element = listeners.item(i) as Element
            val className = element.getAttribute("class").trim()
            if (className.isNotEmpty() && !isLoadable(className)) {
                missing.add("<listener class=\"$className\">")
            }
        }

        assertTrue(
            missing.isEmpty(),
            "plugin.xml references classes that are not on the classpath:\n${missing.joinToString("\n")}",
        )
    }

    @Test
    fun `tool window icon resources exist on classpath`() {
        listOf("/icons/toolWindow.svg", "/expui/automobile/toolWindow.svg").forEach { path ->
            assertNotNull(
                javaClass.getResourceAsStream(path),
                "Tool window icon not found on classpath: $path",
            )
        }
    }

    private fun isLoadable(className: String): Boolean = try {
        Class.forName(className, false, javaClass.classLoader)
        true
    } catch (_: ClassNotFoundException) {
        false
    }

    private fun loadPluginXml(): org.w3c.dom.Document {
        val stream = assertNotNull(
            javaClass.classLoader.getResourceAsStream("META-INF/plugin.xml"),
            "META-INF/plugin.xml not found on the classpath",
        )
        return stream.use {
            val factory = DocumentBuilderFactory.newInstance()
            factory.setFeature(XMLConstants.FEATURE_SECURE_PROCESSING, true)
            factory.setFeature("http://apache.org/xml/features/disallow-doctype-decl", true)
            factory.setFeature("http://xml.org/sax/features/external-general-entities", false)
            factory.setFeature("http://xml.org/sax/features/external-parameter-entities", false)
            factory.isXIncludeAware = false
            factory.isExpandEntityReferences = false
            factory.newDocumentBuilder().parse(it)
        }
    }
}
