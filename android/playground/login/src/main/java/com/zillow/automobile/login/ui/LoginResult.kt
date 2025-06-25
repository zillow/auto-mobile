package com.zillow.automobile.login.ui

/** Authentication result : success (user details) or error message. */
data class LoginResult(val success: LoggedInUserView? = null, val error: Int? = null)
