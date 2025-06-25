package com.zillow.automobile.login.ui

import android.util.Patterns
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.zillow.automobile.login.R
import com.zillow.automobile.login.data.LoginRepository
import com.zillow.automobile.login.data.Result
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

class LoginViewModel(private val loginRepository: LoginRepository) : ViewModel() {

  private val _loginForm = MutableStateFlow(LoginFormState())
  val loginFormState: StateFlow<LoginFormState> = _loginForm.asStateFlow()

  private val _loginResult = MutableStateFlow<LoginResult?>(null)
  val loginResult: StateFlow<LoginResult?> = _loginResult.asStateFlow()

  fun login(username: String, password: String) {
    viewModelScope.launch {
      val result = loginRepository.login(username, password)

      if (result is Result.Success) {
        _loginResult.value =
            LoginResult(success = LoggedInUserView(displayName = result.data.displayName))
      } else {
        _loginResult.value = LoginResult(error = R.string.login_failed)
      }
    }
  }

  fun loginDataChanged(username: String, password: String) {
    if (!isUserNameValid(username)) {
      _loginForm.value = LoginFormState(usernameError = R.string.invalid_username)
    } else if (!isPasswordValid(password)) {
      _loginForm.value = LoginFormState(passwordError = R.string.invalid_password)
    } else {
      _loginForm.value = LoginFormState(isDataValid = true)
    }
  }

  // A placeholder username validation check
  private fun isUserNameValid(username: String): Boolean {
    return if (username.contains('@')) {
      Patterns.EMAIL_ADDRESS.matcher(username).matches()
    } else {
      username.isNotBlank()
    }
  }

  // A placeholder password validation check
  private fun isPasswordValid(password: String): Boolean {
    return password.length > 5
  }
}
