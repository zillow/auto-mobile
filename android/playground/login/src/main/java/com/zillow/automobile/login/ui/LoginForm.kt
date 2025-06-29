package com.zillow.automobile.login.ui

import android.content.res.Configuration
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.tooling.preview.Preview
import com.zillow.automobile.design.system.theme.AutoMobileDimensions
import com.zillow.automobile.design.system.theme.AutoMobileTheme
import com.zillow.automobile.login.R

/** Form section containing username and password input fields. */
@Composable
internal fun LoginForm(
    username: String,
    password: String,
    onUsernameChange: (String) -> Unit,
    onPasswordChange: (String) -> Unit,
    loginFormState: LoginFormState,
    usernameHadContent: Boolean,
    passwordHadContent: Boolean,
    usernameBlurred: Boolean,
    passwordBlurred: Boolean,
    onPasswordDone: () -> Unit,
    modifier: Modifier = Modifier
) {
  Column(modifier = modifier) {
    OutlinedTextField(
        value = username,
        onValueChange = onUsernameChange,
        label = { Text(stringResource(R.string.prompt_email)) },
        keyboardOptions =
            KeyboardOptions(keyboardType = KeyboardType.Email, imeAction = ImeAction.Next),
        isError =
            (usernameHadContent && username.length < 5) ||
                (usernameBlurred && loginFormState.usernameError != null),
        supportingText = {
          if ((usernameHadContent && username.length < 5) ||
              (usernameBlurred && loginFormState.usernameError != null)) {
            loginFormState.usernameError?.let {
              Text(text = stringResource(it), color = MaterialTheme.colorScheme.error)
            }
          }
        },
        modifier = Modifier.fillMaxWidth())

    Spacer(modifier = Modifier.height(AutoMobileDimensions.spacing4))

    OutlinedTextField(
        value = password,
        onValueChange = onPasswordChange,
        label = { Text(stringResource(R.string.prompt_password)) },
        visualTransformation = PasswordVisualTransformation(),
        keyboardOptions =
            KeyboardOptions(keyboardType = KeyboardType.Password, imeAction = ImeAction.Done),
        keyboardActions = KeyboardActions(onDone = { onPasswordDone() }),
        isError =
            (passwordHadContent && password.length < 5) ||
                (passwordBlurred && loginFormState.passwordError != null),
        supportingText = {
          if ((passwordHadContent && password.length < 5) ||
              (passwordBlurred && loginFormState.passwordError != null)) {
            loginFormState.passwordError?.let {
              Text(text = stringResource(it), color = MaterialTheme.colorScheme.error)
            }
          }
        },
        modifier = Modifier.fillMaxWidth())
  }
}

@Preview(name = "Login Form", showBackground = true, uiMode = Configuration.UI_MODE_NIGHT_NO)
@Preview(
    name = "Login Form - Dark", showBackground = true, uiMode = Configuration.UI_MODE_NIGHT_YES)
@Composable
fun LoginFormPreview() {
  AutoMobileTheme {
    Column(Modifier.background(MaterialTheme.colorScheme.background)) {
      LoginForm(
          username = "user@example.com",
          password = "password123",
          onUsernameChange = {},
          onPasswordChange = {},
          loginFormState = LoginFormState(isDataValid = true),
          usernameHadContent = true,
          passwordHadContent = true,
          usernameBlurred = false,
          passwordBlurred = false,
          onPasswordDone = {})
    }
  }
}
