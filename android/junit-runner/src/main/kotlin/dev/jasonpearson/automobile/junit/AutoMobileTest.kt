package dev.jasonpearson.automobile.junit

/**
 * Annotation to mark a test method for execution with AutoMobile YAML plans.
 *
 * The JUnitRunner will detect this annotation and execute the specified YAML plan using the
 * AutoMobile daemon execution with optional AI-assisted failure recovery.
 */
@Target(AnnotationTarget.FUNCTION)
@Retention(AnnotationRetention.RUNTIME)
annotation class AutoMobileTest(

    /** Path to the YAML test plan relative to test resources. */
    val plan: String = "",

    /** Original prompt used to author the test */
    val prompt: String = "",

    /**
     * Maximum retry attempts before AI intervention. Default: 0 (no retries before AI assistance)
     */
    val maxRetries: Int = 0,

    /** Enable/disable AI agent recovery on failure. Default: true */
    val aiAssistance: Boolean = true,

    /** Maximum execution time per test in milliseconds. Default: 60000 (1 minute) */
    val timeoutMs: Long = 60000L,

    /** Target device ID or "auto" for any available device. Default: "auto" */
    val device: String = "auto",

    /**
     * App package name to clean up after the test (terminate or clear app data).
     * Required when cleanupAfter is enabled.
     */
    val appId: String = "",

    /** Terminate app after the test completes. Default: true */
    val cleanupAfter: Boolean = true,

    /** Clear app data after the test completes. Default: false */
    val clearAppData: Boolean = false,
)
