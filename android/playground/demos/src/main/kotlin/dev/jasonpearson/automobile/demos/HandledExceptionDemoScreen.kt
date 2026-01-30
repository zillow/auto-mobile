package dev.jasonpearson.automobile.demos

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.testTag
import androidx.compose.ui.unit.dp
import dev.jasonpearson.automobile.sdk.TrackRecomposition
import dev.jasonpearson.automobile.sdk.failures.AutoMobileFailures

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HandledExceptionDemoScreen(onNavigateBack: () -> Unit) {
    TrackRecomposition(
        id = "screen.demo.handled.exception",
        composableName = "HandledExceptionDemoScreen",
    ) {
        var exceptionCount by remember { mutableIntStateOf(0) }
        var lastExceptionType by remember { mutableStateOf<String?>(null) }
        var statusMessage by remember { mutableStateOf("No exceptions recorded yet") }

        Scaffold(
            topBar = {
                TopAppBar(
                    title = { Text(text = "Handled Exceptions Demo") },
                    navigationIcon = {
                        IconButton(
                            onClick = onNavigateBack,
                            modifier = Modifier.semantics { testTag = "handled_exception_back" },
                        ) {
                            Icon(
                                imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                                contentDescription = "Back",
                            )
                        }
                    },
                )
            }
        ) { paddingValues ->
            Column(
                modifier =
                    Modifier.fillMaxSize()
                        .padding(paddingValues)
                        .padding(16.dp)
                        .verticalScroll(rememberScrollState())
                        .semantics { testTag = "handled_exception_content" },
                verticalArrangement = Arrangement.spacedBy(16.dp),
            ) {
                Text(
                    text = "Test the handled exceptions API by triggering different exception types. " +
                        "These exceptions are caught and reported to the MCP server.",
                    style = MaterialTheme.typography.bodyLarge,
                )

                Card(
                    modifier =
                        Modifier.fillMaxWidth().semantics { testTag = "handled_exception_status_card" },
                    elevation = CardDefaults.cardElevation(defaultElevation = 2.dp),
                ) {
                    Column(
                        modifier = Modifier.fillMaxWidth().padding(16.dp),
                        verticalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        Text(
                            text = "Exceptions recorded: $exceptionCount",
                            style = MaterialTheme.typography.titleMedium,
                            modifier = Modifier.semantics { testTag = "handled_exception_count" },
                        )
                        Text(
                            text = "Last type: ${lastExceptionType ?: "None"}",
                            style = MaterialTheme.typography.bodyMedium,
                            modifier = Modifier.semantics { testTag = "handled_exception_last_type" },
                        )
                        Text(
                            text = statusMessage,
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.semantics { testTag = "handled_exception_status" },
                        )
                    }
                }

                Text(
                    text = "Trigger Exception Types",
                    style = MaterialTheme.typography.titleMedium,
                )

                // NullPointerException
                Button(
                    onClick = {
                        try {
                            val nullString: String? = null
                            @Suppress("UNUSED_VARIABLE")
                            val length = nullString!!.length
                        } catch (e: NullPointerException) {
                            AutoMobileFailures.recordHandledException(
                                e,
                                "Intentional NPE from demo screen",
                                "HandledExceptionDemoScreen",
                            )
                            exceptionCount++
                            lastExceptionType = "NullPointerException"
                            statusMessage = "Recorded NullPointerException"
                        }
                    },
                    modifier =
                        Modifier.fillMaxWidth()
                            .semantics { testTag = "trigger_null_pointer_exception" },
                ) {
                    Text("Trigger NullPointerException")
                }

                // IllegalArgumentException
                Button(
                    onClick = {
                        try {
                            require(false) { "This is an intentional IllegalArgumentException" }
                        } catch (e: IllegalArgumentException) {
                            AutoMobileFailures.recordHandledException(
                                e,
                                "Intentional IAE from demo screen",
                                "HandledExceptionDemoScreen",
                            )
                            exceptionCount++
                            lastExceptionType = "IllegalArgumentException"
                            statusMessage = "Recorded IllegalArgumentException"
                        }
                    },
                    modifier =
                        Modifier.fillMaxWidth()
                            .semantics { testTag = "trigger_illegal_argument_exception" },
                ) {
                    Text("Trigger IllegalArgumentException")
                }

                // IllegalStateException
                Button(
                    onClick = {
                        try {
                            check(false) { "This is an intentional IllegalStateException" }
                        } catch (e: IllegalStateException) {
                            AutoMobileFailures.recordHandledException(
                                e,
                                "Intentional ISE from demo screen",
                                "HandledExceptionDemoScreen",
                            )
                            exceptionCount++
                            lastExceptionType = "IllegalStateException"
                            statusMessage = "Recorded IllegalStateException"
                        }
                    },
                    modifier =
                        Modifier.fillMaxWidth()
                            .semantics { testTag = "trigger_illegal_state_exception" },
                ) {
                    Text("Trigger IllegalStateException")
                }

                // IndexOutOfBoundsException
                Button(
                    onClick = {
                        try {
                            val list = listOf(1, 2, 3)
                            @Suppress("UNUSED_VARIABLE")
                            val item = list[10]
                        } catch (e: IndexOutOfBoundsException) {
                            AutoMobileFailures.recordHandledException(
                                e,
                                "Intentional IOOBE from demo screen",
                                "HandledExceptionDemoScreen",
                            )
                            exceptionCount++
                            lastExceptionType = "IndexOutOfBoundsException"
                            statusMessage = "Recorded IndexOutOfBoundsException"
                        }
                    },
                    modifier =
                        Modifier.fillMaxWidth()
                            .semantics { testTag = "trigger_index_out_of_bounds_exception" },
                ) {
                    Text("Trigger IndexOutOfBoundsException")
                }

                // NumberFormatException
                Button(
                    onClick = {
                        try {
                            @Suppress("UNUSED_VARIABLE")
                            val number = "not_a_number".toInt()
                        } catch (e: NumberFormatException) {
                            AutoMobileFailures.recordHandledException(
                                e,
                                "Intentional NFE from demo screen",
                                "HandledExceptionDemoScreen",
                            )
                            exceptionCount++
                            lastExceptionType = "NumberFormatException"
                            statusMessage = "Recorded NumberFormatException"
                        }
                    },
                    modifier =
                        Modifier.fillMaxWidth()
                            .semantics { testTag = "trigger_number_format_exception" },
                ) {
                    Text("Trigger NumberFormatException")
                }

                // Custom exception without message
                Button(
                    onClick = {
                        try {
                            throw RuntimeException("Custom runtime exception for testing")
                        } catch (e: RuntimeException) {
                            AutoMobileFailures.recordHandledException(e)
                            exceptionCount++
                            lastExceptionType = "RuntimeException"
                            statusMessage = "Recorded RuntimeException (no custom message)"
                        }
                    },
                    modifier =
                        Modifier.fillMaxWidth()
                            .semantics { testTag = "trigger_runtime_exception" },
                ) {
                    Text("Trigger RuntimeException (no message)")
                }

                // Reset counter
                Button(
                    onClick = {
                        exceptionCount = 0
                        lastExceptionType = null
                        statusMessage = "Counter reset"
                    },
                    colors =
                        ButtonDefaults.buttonColors(
                            containerColor = MaterialTheme.colorScheme.secondary
                        ),
                    modifier =
                        Modifier.fillMaxWidth().semantics { testTag = "reset_exception_counter" },
                ) {
                    Text("Reset Counter")
                }
            }
        }
    }
}
