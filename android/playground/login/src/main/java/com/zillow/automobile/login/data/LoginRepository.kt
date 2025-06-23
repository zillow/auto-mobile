package com.zillow.automobile.login.data

import android.content.Context
import com.zillow.automobile.login.data.model.LoggedInUser
import com.zillow.automobile.storage.AuthRepository

/**
 * Class that requests authentication and user information from the remote data source and maintains
 * an in-memory cache of login status and user credentials information.
 */
class LoginRepository(context: Context) {
  private val authRepository = AuthRepository(context)

  // Map from storage model to login model
  val user: LoggedInUser?
    get() = authRepository.user?.let { LoggedInUser(it.userId, it.displayName) }

  val isLoggedIn: Boolean
    get() = authRepository.isLoggedIn

  fun logout() {
    authRepository.logout()
  }

  fun login(username: String, password: String): Result<LoggedInUser> {
    val result = authRepository.login(username, password)

    return result.success?.let { successData ->
      val loginUser = LoggedInUser(successData.userId, successData.displayName)
      Result.Success(loginUser)
    } ?: Result.Error(Exception("Login failed"))
  }
}
