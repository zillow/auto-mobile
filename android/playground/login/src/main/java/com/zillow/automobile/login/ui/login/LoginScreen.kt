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
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.zillow.automobile.design.system.components.AutoMobileButton
import com.zillow.automobile.design.system.components.AutoMobileCard
import com.zillow.automobile.design.system.components.AutoMobileHeadline
import com.zillow.automobile.design.system.components.AutoMobileLogo
import com.zillow.automobile.design.system.components.AutoMobileOutlinedTextField
import com.zillow.automobile.design.system.components.AutoMobileText
import com.zillow.automobile.design.system.theme.AutoMobileDimensions
import com.zillow.automobile.login.R
import com.zillow.automobile.login.data.LoginRepository
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow

/** Header section of the login screen containing logo and title. */
@Composable
private fun LoginHeader() {
  AutoMobileLogo()
  AutoMobileHeadline(text = "AutoMobile", color = MaterialTheme.colorScheme.primary)
}

/** Form section containing username and password input fields. */
@Composable
private fun LoginForm(
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
    AutoMobileOutlinedTextField(
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

    AutoMobileOutlinedTextField(
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

/** Action buttons section containing sign in button, loading indicator, and guest mode button. */
@Composable
private fun LoginActions(
    isFormValid: Boolean,
    isLoading: Boolean,
    onSignInClick: () -> Unit,
    onGuestModeClick: () -> Unit,
    modifier: Modifier = Modifier
) {
  Column(modifier = modifier, horizontalAlignment = Alignment.CenterHorizontally) {
    AnimatedVisibility(visible = isFormValid && !isLoading, enter = fadeIn(), exit = fadeOut()) {
      AutoMobileButton(
          text = stringResource(R.string.action_sign_in),
          onClick = onSignInClick,
          modifier = Modifier.wrapContentWidth())
    }

    if (isLoading) {
      Spacer(modifier = Modifier.height(AutoMobileDimensions.spacing4))
      CircularProgressIndicator(color = MaterialTheme.colorScheme.primary)
    }

    Spacer(modifier = Modifier.height(AutoMobileDimensions.spacing4))

    AutoMobileButton(
        text = "Continue as Guest",
        onClick = onGuestModeClick,
        modifier = Modifier.wrapContentWidth())
  }
}

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
            onUsernameChange = { username = it },
            onPasswordChange = { password = it },
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

/** Preview for the LoginScreen composable with mock data. */
@Preview(
    name = "Login Screen - Light", showBackground = true, uiMode = Configuration.UI_MODE_NIGHT_NO)
@Preview(
    name = "Login Screen - Dark", showBackground = true, uiMode = Configuration.UI_MODE_NIGHT_YES)
@Composable
fun LoginScreenPreview() {
  // Create a simple mock ViewModel using a local class
  class MockLoginViewModel : ViewModel() {
    val loginFormState =
        MutableStateFlow(
            LoginFormState(isDataValid = true, usernameError = null, passwordError = null))
    val loginResult = MutableStateFlow<LoginResult?>(null)

    fun login(username: String, password: String) {
      // Mock implementation - do nothing for preview
    }

    fun loginDataChanged(username: String, password: String) {
      // Mock implementation - do nothing for preview
    }
  }

  val mockViewModel = remember { MockLoginViewModel() }

  // Create a wrapper that matches the expected interface
  val loginViewModel = remember {
    object {
      val loginFormState = mockViewModel.loginFormState.asStateFlow()
      val loginResult = mockViewModel.loginResult.asStateFlow()

      fun login(username: String, password: String) = mockViewModel.login(username, password)

      fun loginDataChanged(username: String, password: String) =
          mockViewModel.loginDataChanged(username, password)
    }
  }

  // Use a simpler approach - just show the UI components directly
  var username by remember { mutableStateOf("user@example.com") }
  var password by remember { mutableStateOf("password123") }
  var isLoading by remember { mutableStateOf(false) }
  val mockFormState = LoginFormState(isDataValid = true)

  val configuration = LocalConfiguration.current
  val isLandscape = configuration.orientation == Configuration.ORIENTATION_LANDSCAPE
  val scrollState = rememberScrollState()
}

@Preview(name = "Login Header", showBackground = true, uiMode = Configuration.UI_MODE_NIGHT_NO)
@Preview(
    name = "Login Header - Dark", showBackground = true, uiMode = Configuration.UI_MODE_NIGHT_YES)
@Composable
fun LoginHeaderPreview() {
  Column(horizontalAlignment = Alignment.CenterHorizontally) { LoginHeader() }
}

@Preview(name = "Login Form", showBackground = true, uiMode = Configuration.UI_MODE_NIGHT_NO)
@Preview(
    name = "Login Form - Dark", showBackground = true, uiMode = Configuration.UI_MODE_NIGHT_YES)
@Composable
fun LoginFormPreview() {
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

@Preview(name = "Login Actions", showBackground = true, uiMode = Configuration.UI_MODE_NIGHT_NO)
@Preview(
    name = "Login Actions - Dark", showBackground = true, uiMode = Configuration.UI_MODE_NIGHT_YES)
@Composable
fun LoginActionsPreview() {
  LoginActions(isFormValid = true, isLoading = false, onSignInClick = {}, onGuestModeClick = {})
}

@Preview(
    name = "Login Actions - Loading",
    showBackground = true,
    uiMode = Configuration.UI_MODE_NIGHT_NO)
@Composable
fun LoginActionsLoadingPreview() {
  LoginActions(isFormValid = true, isLoading = true, onSignInClick = {}, onGuestModeClick = {})
}
