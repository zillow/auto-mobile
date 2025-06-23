# Plans - Test Authoring

Basic Kotlin DSL, high flexibility



User credential handling
 - Uses injected environment variables for login flows
 - Optional .automobile.local.json file for project configuration

Experiment + Treatment support









```kotlin
@Test
fun `given an excited audience, start the party`() {
val result =
AutoMobilePlan("test-plans/excited-audience.yaml") {
Experiments.Mood.id to Experiments.Mood.Treatments.Party
}
.execute()

    assertTrue("Party mode is active", result.success)
}
```
