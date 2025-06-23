package com.zillow.automobile.settings.ui

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Person
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlin.math.max

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ProfileTopAppBar(name: String, email: String, scrollProgress: Float, onEmailClick: () -> Unit) {
  // Dynamic text size for name (from 24sp to 18sp)
  val titleSize by remember { derivedStateOf { (24 - (6 * scrollProgress)).sp } }

  // Email alpha (fades out as user scrolls)
  val emailAlpha by remember { derivedStateOf { max(0f, 1f - scrollProgress) } }

  TopAppBar(
      title = {
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween) {
              Column {
                Text(text = name, fontSize = titleSize, fontWeight = FontWeight.Bold)
                if (emailAlpha > 0f) {
                  Text(
                      text = email,
                      fontSize = 14.sp,
                      color = MaterialTheme.colorScheme.onSurfaceVariant,
                      modifier = Modifier.alpha(emailAlpha).clickable { onEmailClick() })
                }
              }

              Icon(
                  imageVector = Icons.Filled.Person,
                  contentDescription = "Profile Photo",
                  modifier = Modifier.size(40.dp).clip(CircleShape),
                  tint = MaterialTheme.colorScheme.primary)
            }
      })
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun EmailEditBottomSheet(
    email: String,
    onEmailChange: (String) -> Unit,
    onDismiss: () -> Unit,
    onSave: () -> Unit
) {
  ModalBottomSheet(onDismissRequest = onDismiss) {
    Column(modifier = Modifier.fillMaxWidth().padding(16.dp)) {
      Text(
          text = "Edit Email",
          fontSize = 20.sp,
          fontWeight = FontWeight.Bold,
          modifier = Modifier.padding(bottom = 16.dp))

      OutlinedTextField(
          value = email,
          onValueChange = onEmailChange,
          label = { Text("Email") },
          modifier = Modifier.fillMaxWidth())

      Spacer(modifier = Modifier.height(16.dp))

      Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceEvenly) {
        Button(
            onClick = onDismiss,
            colors =
                ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.secondary)) {
              Text("Cancel")
            }

        Button(onClick = onSave) { Text("Save") }
      }

      Spacer(modifier = Modifier.height(16.dp))
    }
  }
}

@Composable
fun ProfileSection(
    name: String,
    email: String,
    scrollProgress: Float,
    onEmailUpdated: (String) -> Unit
) {
  var isEditingEmail by remember { mutableStateOf(false) }
  var tempEmail by remember { mutableStateOf(email) }

  ProfileTopAppBar(
      name = name,
      email = email,
      scrollProgress = scrollProgress,
      onEmailClick = {
        tempEmail = email
        isEditingEmail = true
      })

  if (isEditingEmail) {
    EmailEditBottomSheet(
        email = tempEmail,
        onEmailChange = { tempEmail = it },
        onDismiss = { isEditingEmail = false },
        onSave = {
          onEmailUpdated(tempEmail)
          isEditingEmail = false
        })
  }
}

@Composable
fun ProfileWithBottomSheet(
    name: String,
    email: String,
    scrollProgress: Float,
    onEmailUpdated: (String) -> Unit
): @Composable () -> Unit {
  var isEditingEmail by remember { mutableStateOf(false) }
  var tempEmail by remember { mutableStateOf(email) }

  if (isEditingEmail) {
    EmailEditBottomSheet(
        email = tempEmail,
        onEmailChange = { tempEmail = it },
        onDismiss = { isEditingEmail = false },
        onSave = {
          onEmailUpdated(tempEmail)
          isEditingEmail = false
        })
  }

  return {
    ProfileTopAppBar(
        name = name,
        email = email,
        scrollProgress = scrollProgress,
        onEmailClick = {
          tempEmail = email
          isEditingEmail = true
        })
  }
}

@Preview(showBackground = true)
@Composable
fun ProfileTopAppBarPreview() {
  MaterialTheme {
    ProfileTopAppBar(
        name = "John Doe",
        email = "john.doe@example.com",
        scrollProgress = 0f,
        onEmailClick = { /* Preview email click */ })
  }
}

@Preview(showBackground = true)
@Composable
fun EmailEditBottomSheetPreview() {
  MaterialTheme {
    EmailEditBottomSheet(
        email = "john.doe@example.com",
        onEmailChange = { /* Preview email change */ },
        onDismiss = { /* Preview dismiss */ },
        onSave = { /* Preview save */ })
  }
}
