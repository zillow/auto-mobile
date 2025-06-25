package com.zillow.automobile.login.ui

import android.content.res.Configuration
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
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
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.zillow.automobile.design.system.components.AutoMobileCard
import com.zillow.automobile.design.system.components.AutoMobileText
import com.zillow.automobile.design.system.theme.AutoMobileDimensions
import com.zillow.automobile.design.system.theme.AutoMobileTheme
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
  val scrollState = rememberScrollState()

  Column(
      modifier =
          Modifier.fillMaxSize()
              .then(if (isLandscape) Modifier.verticalScroll(scrollState) else Modifier)
              .padding(16.dp),
      horizontalAlignment = Alignment.CenterHorizontally) {
        Spacer(modifier = Modifier.height(AutoMobileDimensions.spacing12))

        LoginHeader()

        Spacer(modifier = Modifier.height(AutoMobileDimensions.spacing12))

        LoginForm(
            username = username,
            password = password,
            onUsernameChange = {
              username = it
              if (it.length >= 5) usernameHadContent = true
            },
            onPasswordChange = {
              password = it
              if (it.length >= 5) passwordHadContent = true
            },
            loginFormState = loginFormState,
            usernameHadContent = usernameHadContent,
            passwordHadContent = passwordHadContent,
            usernameBlurred = usernameBlurred,
            passwordBlurred = passwordBlurred,
            onPasswordDone = {
              passwordBlurred = true
              if (isFormValid) {
                isLoading = true
                viewModel.login(username, password)
              }
            })

        Spacer(modifier = Modifier.height(AutoMobileDimensions.spacing6))

        LoginActions(
            isFormValid = isFormValid,
            isLoading = isLoading,
            onSignInClick = {
              usernameBlurred = true
              passwordBlurred = true
              isLoading = true
              viewModel.login(username, password)
            },
            onGuestModeClick = onGuestMode)

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

/** Preview-friendly version of LoginScreen that doesn't require complex dependencies. */
@Composable
fun LoginScreen(
    onLoginSuccess: () -> Unit = {},
    onLoginError: () -> Unit = {},
    onGuestMode: () -> Unit = {}
) {
  var username by remember { mutableStateOf("") }
  var password by remember { mutableStateOf("") }
  var isLoading by remember { mutableStateOf(false) }
  var usernameHadContent by remember { mutableStateOf(false) }
  var passwordHadContent by remember { mutableStateOf(false) }
  var usernameBlurred by remember { mutableStateOf(false) }
  var passwordBlurred by remember { mutableStateOf(false) }

  val mockFormState = LoginFormState(isDataValid = username.length >= 5 && password.length >= 5)
  val isFormValid = mockFormState.isDataValid && username.isNotEmpty() && password.isNotEmpty()

  val configuration = LocalConfiguration.current
  val isLandscape = configuration.orientation == Configuration.ORIENTATION_LANDSCAPE
  val scrollState = rememberScrollState()

  Column(
      modifier =
          Modifier.fillMaxSize()
              .then(if (isLandscape) Modifier.verticalScroll(scrollState) else Modifier)
              .padding(16.dp),
      horizontalAlignment = Alignment.CenterHorizontally) {
        Spacer(modifier = Modifier.height(AutoMobileDimensions.spacing12))

        LoginHeader()

        Spacer(modifier = Modifier.height(AutoMobileDimensions.spacing12))

        LoginForm(
            username = username,
            password = password,
            onUsernameChange = {
              username = it
              if (it.length >= 5) usernameHadContent = true
            },
            onPasswordChange = {
              password = it
              if (it.length >= 5) passwordHadContent = true
            },
            loginFormState = mockFormState,
            usernameHadContent = usernameHadContent,
            passwordHadContent = passwordHadContent,
            usernameBlurred = usernameBlurred,
            passwordBlurred = passwordBlurred,
            onPasswordDone = {
              passwordBlurred = true
              if (isFormValid) {
                onLoginSuccess()
              }
            })

        Spacer(modifier = Modifier.height(AutoMobileDimensions.spacing6))

        LoginActions(
            isFormValid = isFormValid,
            isLoading = isLoading,
            onSignInClick = {
              usernameBlurred = true
              passwordBlurred = true
              onLoginSuccess()
            },
            onGuestModeClick = onGuestMode)

        Spacer(modifier = Modifier.weight(1f))
      }
}

/** Preview for the LoginScreen composable with mock data. */
@Preview(showBackground = true)
@Composable
fun LoginScreenPreview() {
  AutoMobileTheme {
    LoginScreen(
        onLoginSuccess = { /* Preview login success */ },
        onLoginError = { /* Preview login error */ },
        onGuestMode = { /* Preview guest mode */ })
  }
}
