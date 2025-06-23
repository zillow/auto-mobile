# Plans - User Credentials


User credential handling
- Uses injected environment variables for login flows
- Optional .automobile.local.json file for project configuration

Experiment + Treatment support




```kotlin
@Test
fun `given valid credentials, login should succeed`() {
    val result = AutoMobilePlan("test-plans/login.yaml", {
      envCredentials = ".env.dev.credentials"
    }).execute()
    assertThat(result.status).isEqualTo(SUCCESS)
}
```
