package com.zillow.automobile.discover

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.text.ClickableText
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Clear
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Visibility
import androidx.compose.material.icons.filled.VisibilityOff
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextField
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

@Composable
fun InputTextScreen() {
  // State for various text fields
  var basicText by remember { mutableStateOf("") }
  var emailText by remember { mutableStateOf("") }
  var passwordText by remember { mutableStateOf("") }
  var passwordVisible by remember { mutableStateOf(false) }
  var multilineText by remember { mutableStateOf("") }
  var numericText by remember { mutableStateOf("") }
  var searchText by remember { mutableStateOf("") }
  var selectedChips by remember { mutableStateOf(setOf<String>()) }
  var validationErrorText by remember { mutableStateOf("") }

  LazyColumn(
      modifier = Modifier.fillMaxSize().padding(16.dp),
      verticalArrangement = Arrangement.spacedBy(16.dp)) {
        // Header
        item {
          Text(
              text = "INPUT TEXT SCREEN",
              fontSize = 24.sp,
              fontWeight = FontWeight.Bold,
              modifier = Modifier.fillMaxWidth())
        }

        item {
          Text(
              text = "Comprehensive text input and display components",
              fontSize = 16.sp,
              color = MaterialTheme.colorScheme.onSurfaceVariant,
              modifier = Modifier.fillMaxWidth())
        }

        // Basic Text Fields
        item {
          Card(
              modifier = Modifier.fillMaxWidth(),
              elevation = CardDefaults.cardElevation(defaultElevation = 4.dp)) {
                Column(modifier = Modifier.padding(16.dp)) {
                  Text(
                      text = "Basic Text Fields",
                      fontSize = 18.sp,
                      fontWeight = FontWeight.Bold,
                      modifier = Modifier.padding(bottom = 8.dp))

                  TextField(
                      value = basicText,
                      onValueChange = { basicText = it },
                      label = { Text("Basic Text Field") },
                      placeholder = { Text("Enter some text...") },
                      modifier = Modifier.fillMaxWidth())

                  Spacer(modifier = Modifier.height(8.dp))

                  OutlinedTextField(
                      value = emailText,
                      onValueChange = {
                        emailText = it
                        validationErrorText =
                            if (it.isNotEmpty() && !it.contains("@")) {
                              "Please enter a valid email"
                            } else ""
                      },
                      label = { Text("Email") },
                      placeholder = { Text("Enter your email") },
                      keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email),
                      isError = validationErrorText.isNotEmpty(),
                      supportingText =
                          if (validationErrorText.isNotEmpty()) {
                            { Text(validationErrorText, color = MaterialTheme.colorScheme.error) }
                          } else null,
                      modifier = Modifier.fillMaxWidth())
                }
              }
        }

        // Password Field
        item {
          Card(
              modifier = Modifier.fillMaxWidth(),
              elevation = CardDefaults.cardElevation(defaultElevation = 4.dp)) {
                Column(modifier = Modifier.padding(16.dp)) {
                  Text(
                      text = "Password Field",
                      fontSize = 18.sp,
                      fontWeight = FontWeight.Bold,
                      modifier = Modifier.padding(bottom = 8.dp))

                  OutlinedTextField(
                      value = passwordText,
                      onValueChange = { passwordText = it },
                      label = { Text("Password") },
                      placeholder = { Text("Enter password") },
                      visualTransformation =
                          if (passwordVisible) {
                            VisualTransformation.None
                          } else {
                            PasswordVisualTransformation()
                          },
                      keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
                      trailingIcon = {
                        IconButton(onClick = { passwordVisible = !passwordVisible }) {
                          Icon(
                              imageVector =
                                  if (passwordVisible) Icons.Filled.VisibilityOff
                                  else Icons.Filled.Visibility,
                              contentDescription =
                                  if (passwordVisible) "Hide password" else "Show password")
                        }
                      },
                      modifier = Modifier.fillMaxWidth())
                }
              }
        }

        // Multiline Text Area
        item {
          Card(
              modifier = Modifier.fillMaxWidth(),
              elevation = CardDefaults.cardElevation(defaultElevation = 4.dp)) {
                Column(modifier = Modifier.padding(16.dp)) {
                  Text(
                      text = "Multiline Text Area",
                      fontSize = 18.sp,
                      fontWeight = FontWeight.Bold,
                      modifier = Modifier.padding(bottom = 8.dp))

                  OutlinedTextField(
                      value = multilineText,
                      onValueChange = { multilineText = it },
                      label = { Text("Comments") },
                      placeholder = { Text("Enter your comments here...") },
                      minLines = 3,
                      maxLines = 5,
                      modifier = Modifier.fillMaxWidth())
                }
              }
        }

        // Numeric and Search Fields
        item {
          Card(
              modifier = Modifier.fillMaxWidth(),
              elevation = CardDefaults.cardElevation(defaultElevation = 4.dp)) {
                Column(modifier = Modifier.padding(16.dp)) {
                  Text(
                      text = "Specialized Input Fields",
                      fontSize = 18.sp,
                      fontWeight = FontWeight.Bold,
                      modifier = Modifier.padding(bottom = 8.dp))

                  OutlinedTextField(
                      value = numericText,
                      onValueChange = { newValue ->
                        if (newValue.all { it.isDigit() || it == '.' }) {
                          numericText = newValue
                        }
                      },
                      label = { Text("Numeric Input") },
                      placeholder = { Text("Enter a number") },
                      keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                      modifier = Modifier.fillMaxWidth())

                  Spacer(modifier = Modifier.height(8.dp))

                  OutlinedTextField(
                      value = searchText,
                      onValueChange = { searchText = it },
                      label = { Text("Search") },
                      placeholder = { Text("Search for something...") },
                      leadingIcon = { Icon(Icons.Filled.Search, contentDescription = "Search") },
                      trailingIcon =
                          if (searchText.isNotEmpty()) {
                            {
                              IconButton(onClick = { searchText = "" }) {
                                Icon(Icons.Filled.Clear, contentDescription = "Clear")
                              }
                            }
                          } else null,
                      modifier = Modifier.fillMaxWidth())
                }
              }
        }

        // Chip Input
        item {
          Card(
              modifier = Modifier.fillMaxWidth(),
              elevation = CardDefaults.cardElevation(defaultElevation = 4.dp)) {
                Column(modifier = Modifier.padding(16.dp)) {
                  Text(
                      text = "Chip Input Tags",
                      fontSize = 18.sp,
                      fontWeight = FontWeight.Bold,
                      modifier = Modifier.padding(bottom = 8.dp))

                  Text(
                      text = "Select your interests:",
                      fontSize = 14.sp,
                      color = MaterialTheme.colorScheme.onSurfaceVariant,
                      modifier = Modifier.padding(bottom = 8.dp))

                  val chipOptions = listOf("Technology", "Sports", "Music", "Art", "Travel", "Food")

                  Row(
                      modifier = Modifier.fillMaxWidth(),
                      horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        chipOptions.take(3).forEach { chip ->
                          FilterChip(
                              selected = selectedChips.contains(chip),
                              onClick = {
                                selectedChips =
                                    if (selectedChips.contains(chip)) {
                                      selectedChips - chip
                                    } else {
                                      selectedChips + chip
                                    }
                              },
                              label = { Text(chip) })
                        }
                      }

                  Spacer(modifier = Modifier.height(8.dp))

                  Row(
                      modifier = Modifier.fillMaxWidth(),
                      horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        chipOptions.drop(3).forEach { chip ->
                          FilterChip(
                              selected = selectedChips.contains(chip),
                              onClick = {
                                selectedChips =
                                    if (selectedChips.contains(chip)) {
                                      selectedChips - chip
                                    } else {
                                      selectedChips + chip
                                    }
                              },
                              label = { Text(chip) })
                        }
                      }

                  if (selectedChips.isNotEmpty()) {
                    Spacer(modifier = Modifier.height(8.dp))
                    Text(
                        text = "Selected: ${selectedChips.joinToString(", ")}",
                        fontSize = 12.sp,
                        color = MaterialTheme.colorScheme.primary)
                  }
                }
              }
        }

        // Rich Text Display
        item {
          Card(
              modifier = Modifier.fillMaxWidth(),
              elevation = CardDefaults.cardElevation(defaultElevation = 4.dp)) {
                Column(modifier = Modifier.padding(16.dp)) {
                  Text(
                      text = "Rich Text Display",
                      fontSize = 18.sp,
                      fontWeight = FontWeight.Bold,
                      modifier = Modifier.padding(bottom = 8.dp))

                  Text(
                      text =
                          buildAnnotatedString {
                            append("This text contains ")
                            withStyle(style = SpanStyle(fontWeight = FontWeight.Bold)) {
                              append("bold")
                            }
                            append(", ")
                            withStyle(style = SpanStyle(fontStyle = FontStyle.Italic)) {
                              append("italic")
                            }
                            append(", and ")
                            withStyle(style = SpanStyle(color = Color.Blue)) { append("colored") }
                            append(" text.")
                          },
                      modifier = Modifier.fillMaxWidth())
                }
              }
        }

        // URL Highlighted Text
        item {
          Card(
              modifier = Modifier.fillMaxWidth(),
              elevation = CardDefaults.cardElevation(defaultElevation = 4.dp)) {
                Column(modifier = Modifier.padding(16.dp)) {
                  Text(
                      text = "Clickable URL Text",
                      fontSize = 18.sp,
                      fontWeight = FontWeight.Bold,
                      modifier = Modifier.padding(bottom = 8.dp))

                  val uriHandler = LocalUriHandler.current
                  val annotatedText = buildAnnotatedString {
                    append("Visit our website at ")
                    pushStringAnnotation(tag = "URL", annotation = "https://www.example.com")
                    withStyle(
                        style =
                            SpanStyle(
                                color = Color.Blue, textDecoration = TextDecoration.Underline)) {
                          append("example.com")
                        }
                    pop()
                    append(" for more information.")
                  }

                  ClickableText(
                      text = annotatedText,
                      onClick = { offset ->
                        annotatedText
                            .getStringAnnotations(tag = "URL", start = offset, end = offset)
                            .firstOrNull()
                            ?.let { annotation -> uriHandler.openUri(annotation.item) }
                      })
                }
              }
        }

        // Selectable Text
        item {
          Card(
              modifier = Modifier.fillMaxWidth(),
              elevation = CardDefaults.cardElevation(defaultElevation = 4.dp)) {
                Column(modifier = Modifier.padding(16.dp)) {
                  Text(
                      text = "Selectable Text",
                      fontSize = 18.sp,
                      fontWeight = FontWeight.Bold,
                      modifier = Modifier.padding(bottom = 8.dp))

                  SelectionContainer {
                    Text(
                        text =
                            "This text can be selected and copied. Long press to start text selection and drag to select the desired text portion.",
                        modifier = Modifier.fillMaxWidth())
                  }
                }
              }
        }
      }
}

@Preview(showBackground = true)
@Composable
fun PreviewInputTextScreen() {
  MaterialTheme { InputTextScreen() }
}
