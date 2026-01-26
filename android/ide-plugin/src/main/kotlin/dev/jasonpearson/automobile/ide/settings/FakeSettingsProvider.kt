package dev.jasonpearson.automobile.ide.settings

/** In-memory implementation of [SettingsProvider] for testing without IntelliJ dependencies. */
class FakeSettingsProvider(
    override var enableYamlLinting: Boolean = true,
    override var testPlanOutputDirectory: String = "test/resources/test-plans",
) : SettingsProvider
