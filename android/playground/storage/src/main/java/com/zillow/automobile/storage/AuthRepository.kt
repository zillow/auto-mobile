package com.zillow.automobile.storage

import android.content.Context
import android.content.SharedPreferences
import androidx.core.content.edit

data class LoggedInUserRecord(
  val userId: String,
  val displayName: String
)

data class LoginResult<T>(
  val success: T? = null,
  val error: Int? = null
)

class AuthRepository(context: Context) {
  private val sharedPreferences: SharedPreferences =
    context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

  var user: LoggedInUserRecord? = null
    private set

  val isLoggedIn: Boolean
    get() = user != null

  init {
    loadUser()
  }

  private fun loadUser() {
    val userId = sharedPreferences.getString(KEY_USER_ID, null)
    val displayName = sharedPreferences.getString(KEY_DISPLAY_NAME, null)

    if (userId != null && displayName != null) {
      user = LoggedInUserRecord(userId, displayName)
    }
  }

  fun login(username: String, password: String): LoginResult<LoggedInUserRecord> {
    return try {
      // Simulate login validation - in real app this would call API
      if (username.isNotEmpty() && password.isNotEmpty()) {
        val loggedInUser = LoggedInUserRecord(
          userId = username,
          displayName = username.replaceFirstChar { it.uppercase() }
        )
        setLoggedInUser(loggedInUser)
        LoginResult(success = loggedInUser)
      } else {
        LoginResult(error = 1) // Invalid credentials
      }
    } catch (e: Throwable) {
      LoginResult(error = 2) // Network error
    }
  }

  fun logout() {
    user = null
    sharedPreferences.edit {
      remove(KEY_USER_ID)
      remove(KEY_DISPLAY_NAME)
      putBoolean(KEY_IS_AUTHENTICATED, false)
    }
  }

  private fun setLoggedInUser(loggedInUser: LoggedInUserRecord) {
    this.user = loggedInUser
    sharedPreferences.edit {
      putString(KEY_USER_ID, loggedInUser.userId)
      putString(KEY_DISPLAY_NAME, loggedInUser.displayName)
      putBoolean(KEY_IS_AUTHENTICATED, true)
    }
  }

  var isAuthenticated: Boolean
    get() = sharedPreferences.getBoolean(KEY_IS_AUTHENTICATED, false)
    set(value) = sharedPreferences.edit { putBoolean(KEY_IS_AUTHENTICATED, value) }

  var isGuestMode: Boolean
    get() = sharedPreferences.getBoolean(KEY_IS_GUEST_MODE, false)
    set(value) = sharedPreferences.edit { putBoolean(KEY_IS_GUEST_MODE, value) }

  fun loginAsGuest() {
    isGuestMode = true
    isAuthenticated = false
    user = null
  }

  fun clearAuthData() {
    sharedPreferences.edit { clear() }
    user = null
  }

  companion object {
    private const val PREFS_NAME = "auth_prefs"
    private const val KEY_USER_ID = "user_id"
    private const val KEY_DISPLAY_NAME = "display_name"
    private const val KEY_IS_AUTHENTICATED = "is_authenticated"
    private const val KEY_IS_GUEST_MODE = "is_guest_mode"
  }
}
