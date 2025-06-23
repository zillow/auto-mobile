package com.zillow.automobile.login.ui.login

import android.content.res.Configuration
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.wrapContentWidth
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.zillow.automobile.design.system.components.AutoMobileButton
import com.zillow.automobile.design.system.components.AutoMobileCard
import com.zillow.automobile.design.system.components.AutoMobileHeadline
import com.zillow.automobile.design.system.components.AutoMobileOutlinedTextField
import com.zillow.automobile.design.system.components.AutoMobileText
import com.zillow.automobile.design.system.theme.AutoMobileDimensions
import com.zillow.automobile.login.R
import com.zillow.automobile.login.data.LoginRepository
import kotlinx.coroutines.delay

/**
 * Login screen composable that handles user authentication.
 *
 * @param viewModel The LoginViewModel that manages authentication state
 * @param onLoginSuccess Callback invoked when login is successful
 * @param onLoginError Callback invoked when login fails
 * @param onGuestMode Callback invoked when guest mode is selected
 */
@Composable
fun LoginScreen(
    viewModel: LoginViewModel,
    onLoginSuccess: (LoggedInUserView) -> Unit,
    onLoginError: (Int) -> Unit,
    onGuestMode: () -> Unit = {}
) {
  val loginFormState by viewModel.loginFormState.collectAsStateWithLifecycle()
  val loginResult by viewModel.loginResult.collectAsStateWithLifecycle()

  var username by remember { mutableStateOf("") }
  var password by remember { mutableStateOf("") }
  var isLoading by remember { mutableStateOf(false) }

  // Track user interaction to control when to show errors
  var usernameHadContent by remember { mutableStateOf(false) }
  var passwordHadContent by remember { mutableStateOf(false) }
  var usernameBlurred by remember { mutableStateOf(false) }
  var passwordBlurred by remember { mutableStateOf(false) }

  // Update interaction tracking
  LaunchedEffect(username) {
    if (username.length >= 5) {
      usernameHadContent = true
    }
  }

  LaunchedEffect(password) {
    if (password.length >= 5) {
      passwordHadContent = true
    }
  }

  // Handle login result
  LaunchedEffect(loginResult) {
    loginResult?.let { result ->
      isLoading = false
      result.error?.let { onLoginError(it) }
      result.success?.let { onLoginSuccess(it) }
    }
  }

  // Handle form validation
  LaunchedEffect(username, password) { viewModel.loginDataChanged(username, password) }

  // Check if form is valid for button animation
  val isFormValid = loginFormState.isDataValid && username.isNotEmpty() && password.isNotEmpty()

  val configuration = LocalConfiguration.current
  val isLandscape = configuration.orientation == Configuration.ORIENTATION_LANDSCAPE

  // Use smaller spacing and make scrollable in landscape
  val verticalSpacing = if (isLandscape) 24.dp else 48.dp
  val scrollState = rememberScrollState()

  Column(
      modifier =
          Modifier.fillMaxSize()
              .then(if (isLandscape) Modifier.verticalScroll(scrollState) else Modifier)
              .padding(16.dp),
      horizontalAlignment = Alignment.CenterHorizontally) {
        Spacer(modifier = Modifier.height(AutoMobileDimensions.spacing12))

        // AutoMobile Logo
        AutoMobileText(text = "🚗", style = MaterialTheme.typography.displayLarge)

        AutoMobileHeadline(text = "AutoMobile", color = MaterialTheme.colorScheme.primary)

        Spacer(modifier = Modifier.height(AutoMobileDimensions.spacing12))

        AutoMobileOutlinedTextField(
            value = username,
            onValueChange = { username = it },
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

        AutoMobileOutlinedTextField(
            value = password,
            onValueChange = { password = it },
            label = { Text(stringResource(R.string.prompt_password)) },
            visualTransformation = PasswordVisualTransformation(),
            keyboardOptions =
                KeyboardOptions(keyboardType = KeyboardType.Password, imeAction = ImeAction.Done),
            keyboardActions =
                KeyboardActions(
                    onDone = {
                      passwordBlurred = true
                      if (isFormValid) {
                        isLoading = true
                        viewModel.login(username, password)
                      }
                    }),
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

        Spacer(modifier = Modifier.height(AutoMobileDimensions.spacing6))

        AnimatedVisibility(
            visible = isFormValid && !isLoading, enter = fadeIn(), exit = fadeOut()) {
              AutoMobileButton(
                  text = stringResource(R.string.action_sign_in),
                  onClick = {
                    usernameBlurred = true
                    passwordBlurred = true
                    isLoading = true
                    viewModel.login(username, password)
                  },
                  modifier = Modifier.wrapContentWidth())
            }

        if (isLoading) {
          Spacer(modifier = Modifier.height(AutoMobileDimensions.spacing4))
          CircularProgressIndicator(color = MaterialTheme.colorScheme.primary)
        }

        Spacer(modifier = Modifier.height(AutoMobileDimensions.spacing4))

        AutoMobileButton(
            text = "Continue as Guest",
            onClick = { onGuestMode() },
            modifier = Modifier.wrapContentWidth())

        Spacer(modifier = Modifier.weight(1f))
      }
}

/**
 * Login screen composable with dependency injection for use in playground app. This version handles
 * creating the ViewModel and managing user preferences.
 *
 * @param userPreferences The user preferences to update on successful login
 * @param onNavigateToHome Callback invoked when login is successful to navigate to home
 * @param onGuestMode Callback invoked when guest mode is selected
 */
@Composable
fun LoginScreen(userPreferences: Any, onNavigateToHome: () -> Unit, onGuestMode: () -> Unit = {}) {
  val context = LocalContext.current
  val viewModelFactory = remember { LoginViewModelFactory(LoginRepository(context)) }

  val loginViewModel: LoginViewModel = viewModel(factory = viewModelFactory)

  // Add error state management
  var loginError by remember { mutableStateOf<String?>(null) }
  var showErrorMessage by remember { mutableStateOf(false) }

  LoginScreen(
      viewModel = loginViewModel,
      onLoginSuccess = { user ->
        // Clear any previous errors
        loginError = null
        showErrorMessage = false

        // Mark user as authenticated using reflection to avoid tight coupling
        try {
          val isAuthenticatedField = userPreferences::class.java.getDeclaredField("isAuthenticated")
          isAuthenticatedField.isAccessible = true
          isAuthenticatedField.setBoolean(userPreferences, true)
          onNavigateToHome()
        } catch (e: Exception) {
          loginError = "Authentication successful but navigation failed"
          showErrorMessage = true
        }
      },
      onLoginError = { errorString ->
        // Handle login error - show error message instead of crashing
        loginError =
            when (errorString) {
              R.string.login_failed -> "Invalid email or password"
              R.string.invalid_username -> "Please enter a valid email address"
              R.string.invalid_password -> "Password must be at least 6 characters"
              else -> "Login failed. Please try again."
            }
        showErrorMessage = true
      },
      onGuestMode = onGuestMode)

  // Show error message if login fails
  if (showErrorMessage && loginError != null) {
    LaunchedEffect(loginError) {
      // Auto-hide error after 3 seconds
      delay(3000)
      showErrorMessage = false
    }

    Box(
        modifier = Modifier.fillMaxWidth().padding(16.dp),
        contentAlignment = Alignment.BottomCenter) {
          AutoMobileCard {
            AutoMobileText(text = loginError!!, color = MaterialTheme.colorScheme.error)
          }
        }
  }
}

/** Preview for the LoginScreen composable with mock data. */
@Preview(showBackground = true)
@Composable
fun LoginScreenPreview() {
  // Use a mock state instead of constructing a real ViewModel
  val mockFormState = LoginFormState(isDataValid = true)

  var username by remember { mutableStateOf("user@example.com") }
  var password by remember { mutableStateOf("password") }
  var isLoading by remember { mutableStateOf(false) }

  val configuration = LocalConfiguration.current
  val isLandscape = configuration.orientation == Configuration.ORIENTATION_LANDSCAPE

  // Use smaller spacing and make scrollable in landscape
  val verticalSpacing = if (isLandscape) 24.dp else 48.dp
  val scrollState = rememberScrollState()

  Column(
      modifier =
          Modifier.fillMaxSize()
              .then(if (isLandscape) Modifier.verticalScroll(scrollState) else Modifier)
              .padding(16.dp),
      horizontalAlignment = Alignment.CenterHorizontally) {
        Spacer(modifier = Modifier.height(AutoMobileDimensions.spacing6))

        // AutoMobile Logo
        AutoMobileText(text = "🚗", style = MaterialTheme.typography.displayLarge)

        AutoMobileHeadline(text = "AutoMobile", color = MaterialTheme.colorScheme.primary)

        Spacer(modifier = Modifier.height(AutoMobileDimensions.spacing12))

        AutoMobileOutlinedTextField(
            value = username,
            onValueChange = { username = it },
            label = { Text("Email") },
            keyboardOptions =
                KeyboardOptions(keyboardType = KeyboardType.Email, imeAction = ImeAction.Next),
            modifier = Modifier.fillMaxWidth())

        Spacer(modifier = Modifier.height(AutoMobileDimensions.spacing4))

        AutoMobileOutlinedTextField(
            value = password,
            onValueChange = { password = it },
            label = { Text("Password") },
            visualTransformation = PasswordVisualTransformation(),
            keyboardOptions =
                KeyboardOptions(keyboardType = KeyboardType.Password, imeAction = ImeAction.Done),
            modifier = Modifier.fillMaxWidth())

        Spacer(modifier = Modifier.height(AutoMobileDimensions.spacing6))

        AnimatedVisibility(
            visible = username.isNotEmpty() && password.isNotEmpty() && !isLoading,
            enter = fadeIn(),
            exit = fadeOut()) {
              AutoMobileButton(
                  text = "Sign in or register",
                  onClick = {
                    isLoading = true
                    // Normally this would call viewModel.login
                  },
                  modifier = Modifier.wrapContentWidth())
            }

        if (isLoading) {
          Spacer(modifier = Modifier.height(AutoMobileDimensions.spacing4))
          CircularProgressIndicator(color = MaterialTheme.colorScheme.primary)
        }

        Spacer(modifier = Modifier.height(AutoMobileDimensions.spacing4))

        AutoMobileButton(
            text = "Continue as Guest",
            onClick = {
              // Normally this would set guest mode and navigate to home
            },
            modifier = Modifier.wrapContentWidth())

        Spacer(modifier = Modifier.weight(1f))
      }
}
