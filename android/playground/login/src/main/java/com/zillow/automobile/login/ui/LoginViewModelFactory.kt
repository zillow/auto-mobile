package com.zillow.automobile.login.ui

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import com.zillow.automobile.login.data.LoginRepository

/**
 * ViewModel provider factory to instantiate LoginViewModel. Required given LoginViewModel has a
 * non-empty constructor
 */
class LoginViewModelFactory(private val loginRepository: LoginRepository) :
    ViewModelProvider.Factory {

  @Suppress("UNCHECKED_CAST")
  override fun <T : ViewModel> create(modelClass: Class<T>): T {
    if (modelClass.isAssignableFrom(LoginViewModel::class.java)) {
      return LoginViewModel(loginRepository) as T
    }
    throw IllegalArgumentException("Unknown ViewModel class")
  }
}
