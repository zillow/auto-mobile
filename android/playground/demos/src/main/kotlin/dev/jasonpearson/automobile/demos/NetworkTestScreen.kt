package dev.jasonpearson.automobile.demos

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
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
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.testTag
import androidx.compose.ui.unit.dp
import coil3.compose.AsyncImage
import dev.jasonpearson.automobile.sdk.TrackRecomposition
import dev.jasonpearson.automobile.sdk.network.AutoMobileNetwork
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody

private data class NetworkResult(
    val label: String,
    val statusCode: Int,
    val durationMs: Long,
    val error: String?,
)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun NetworkTestScreen(onNavigateBack: () -> Unit) {
    TrackRecomposition(id = "screen.demo.network.test", composableName = "NetworkTestScreen") {
        val scope = rememberCoroutineScope()
        val results = remember { mutableStateListOf<NetworkResult>() }
        val randomSeed = remember { mutableStateOf(1) }

        val client = remember {
            OkHttpClient.Builder().apply {
                connectTimeout(5, java.util.concurrent.TimeUnit.SECONDS)
                readTimeout(5, java.util.concurrent.TimeUnit.SECONDS)
                AutoMobileNetwork.interceptor(captureHeaders = true, captureBodies = true)?.let { addInterceptor(it) }
            }.build()
        }

        fun makeRequest(
            label: String,
            url: String,
            method: String = "GET",
            body: okhttp3.RequestBody? = null,
        ) {
            scope.launch {
                val start = System.currentTimeMillis()
                try {
                    val request = Request.Builder()
                        .url(url)
                        .method(method, body)
                        .build()
                    val response = withContext(Dispatchers.IO) {
                        client.newCall(request).execute()
                    }
                    val duration = System.currentTimeMillis() - start
                    results.add(0, NetworkResult(label, response.code, duration, null))
                    response.close()
                } catch (e: Exception) {
                    val duration = System.currentTimeMillis() - start
                    results.add(0, NetworkResult(label, 0, duration, e.message))
                }
            }
        }

        Scaffold(
            topBar = {
                TopAppBar(
                    title = { Text("Network Test") },
                    navigationIcon = {
                        IconButton(
                            onClick = onNavigateBack,
                            modifier = Modifier.semantics { testTag = "network_test_back" },
                        ) {
                            Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                        }
                    },
                )
            }
        ) { paddingValues ->
            LazyColumn(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(paddingValues)
                    .padding(horizontal = 16.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                // Random user image
                item {
                    Card(
                        modifier = Modifier.fillMaxWidth(),
                        elevation = CardDefaults.cardElevation(defaultElevation = 2.dp),
                    ) {
                        Column(
                            modifier = Modifier.padding(16.dp),
                            horizontalAlignment = Alignment.CenterHorizontally,
                        ) {
                            Text("Random User", style = MaterialTheme.typography.titleMedium)
                            Spacer(Modifier.height(8.dp))
                            AsyncImage(
                                model = "https://randomuser.me/api/portraits/lego/${randomSeed.value % 10}.jpg",
                                contentDescription = "Random user avatar",
                                modifier = Modifier.size(120.dp).clip(CircleShape),
                                contentScale = ContentScale.Crop,
                            )
                            Spacer(Modifier.height(8.dp))
                            Button(
                                onClick = { randomSeed.value++ },
                                modifier = Modifier.semantics { testTag = "load_random_user" },
                            ) {
                                Text("Load Random User")
                            }
                        }
                    }
                }

                // HTTP test buttons
                item {
                    Card(
                        modifier = Modifier.fillMaxWidth(),
                        elevation = CardDefaults.cardElevation(defaultElevation = 2.dp),
                    ) {
                        Column(
                            modifier = Modifier.padding(16.dp),
                            verticalArrangement = Arrangement.spacedBy(8.dp),
                        ) {
                            Text("HTTP Requests", style = MaterialTheme.typography.titleMedium)

                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.spacedBy(8.dp),
                            ) {
                                Button(
                                    onClick = { makeRequest("GET 200", "https://httpbin.org/get") },
                                    modifier = Modifier.weight(1f).semantics { testTag = "http_get_200" },
                                    colors = ButtonDefaults.buttonColors(
                                        containerColor = MaterialTheme.colorScheme.primary,
                                    ),
                                ) { Text("GET 200") }

                                Button(
                                    onClick = {
                                        makeRequest(
                                            "POST 200",
                                            "https://httpbin.org/post",
                                            method = "POST",
                                            body = """{"message":"hello","timestamp":${System.currentTimeMillis()}}"""
                                                .toRequestBody("application/json".toMediaType()),
                                        )
                                    },
                                    modifier = Modifier.weight(1f).semantics { testTag = "http_post_200" },
                                    colors = ButtonDefaults.buttonColors(
                                        containerColor = MaterialTheme.colorScheme.primary,
                                    ),
                                ) { Text("POST 200") }
                            }

                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.spacedBy(8.dp),
                            ) {
                                OutlinedButton(
                                    onClick = { makeRequest("404", "https://httpbin.org/status/404") },
                                    modifier = Modifier.weight(1f).semantics { testTag = "http_404" },
                                ) { Text("404") }

                                OutlinedButton(
                                    onClick = { makeRequest("500", "https://httpbin.org/status/500") },
                                    modifier = Modifier.weight(1f).semantics { testTag = "http_500" },
                                ) { Text("500") }

                                OutlinedButton(
                                    onClick = { makeRequest("Timeout", "https://httpbin.org/delay/10") },
                                    modifier = Modifier.weight(1f).semantics { testTag = "http_timeout" },
                                ) { Text("Timeout") }
                            }

                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.spacedBy(8.dp),
                            ) {
                                OutlinedButton(
                                    onClick = { makeRequest("DNS Fail", "https://doesnotexist.invalid/test") },
                                    modifier = Modifier.weight(1f).semantics { testTag = "http_dns_fail" },
                                ) { Text("DNS Fail") }

                                OutlinedButton(
                                    onClick = { makeRequest("302", "https://httpbin.org/redirect/1") },
                                    modifier = Modifier.weight(1f).semantics { testTag = "http_302" },
                                ) { Text("Redirect") }
                            }
                        }
                    }
                }

                // Results
                if (results.isNotEmpty()) {
                    item {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Text("Results", style = MaterialTheme.typography.titleMedium)
                            OutlinedButton(onClick = { results.clear() }) {
                                Text("Clear")
                            }
                        }
                    }

                    items(results) { result ->
                        val color = when {
                            result.error != null || result.statusCode == 0 -> MaterialTheme.colorScheme.error
                            result.statusCode in 200..299 -> MaterialTheme.colorScheme.primary
                            else -> MaterialTheme.colorScheme.tertiary
                        }
                        Card(
                            modifier = Modifier.fillMaxWidth(),
                            colors = CardDefaults.cardColors(containerColor = color.copy(alpha = 0.1f)),
                        ) {
                            Column(modifier = Modifier.padding(12.dp)) {
                                Text(
                                    "${result.label}: ${if (result.statusCode > 0) result.statusCode else "FAILED"} (${result.durationMs}ms)",
                                    style = MaterialTheme.typography.bodyMedium,
                                    color = color,
                                )
                                if (result.error != null) {
                                    Text(
                                        result.error,
                                        style = MaterialTheme.typography.bodySmall,
                                        color = MaterialTheme.colorScheme.error.copy(alpha = 0.7f),
                                    )
                                }
                            }
                        }
                    }
                }

                item { Spacer(Modifier.height(16.dp)) }
            }
        }
    }
}
