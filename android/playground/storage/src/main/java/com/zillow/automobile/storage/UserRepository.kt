package com.zillow.automobile.storage

import android.content.Context
import android.content.SharedPreferences
import androidx.core.content.edit

data class UserProfile(
  val name: String,
  val email: String,
  val profileImageUrl: String? = null,
  val createdAt: Long = System.currentTimeMillis()
)

class UserRepository(context: Context) {
  private val sharedPreferences: SharedPreferences =
    context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
  private val authRepository = AuthRepository(context)

  var onGuestModeProfileModificationAttempt: (() -> Unit)? = null

  fun getUserProfile(): UserProfile? {
    return if (authRepository.isGuestMode) {
      UserProfile(
        name = "Anon Ymous",
        email = "you@somewhere.net",
        profileImageUrl = null,
        createdAt = System.currentTimeMillis()
      )
    } else {
      val name = sharedPreferences.getString(KEY_NAME, null)
      val email = sharedPreferences.getString(KEY_EMAIL, null)
      val profileImageUrl = sharedPreferences.getString(KEY_PROFILE_IMAGE_URL, null)
      val createdAt = sharedPreferences.getLong(KEY_CREATED_AT, System.currentTimeMillis())

      if (name != null && email != null) {
        UserProfile(name, email, profileImageUrl, createdAt)
      } else {
        null
      }
    }
  }

  fun saveUserProfile(profile: UserProfile) {
    if (authRepository.isGuestMode) {
      onGuestModeProfileModificationAttempt?.invoke()
      return
    }

    sharedPreferences.edit {
      putString(KEY_NAME, profile.name)
      putString(KEY_EMAIL, profile.email)
      profile.profileImageUrl?.let { putString(KEY_PROFILE_IMAGE_URL, it) }
      putLong(KEY_CREATED_AT, profile.createdAt)
    }
  }

  fun updateName(name: String) {
    if (authRepository.isGuestMode) {
      onGuestModeProfileModificationAttempt?.invoke()
      return
    }

    sharedPreferences.edit {
      putString(KEY_NAME, name)
    }
  }

  fun updateEmail(email: String) {
    if (authRepository.isGuestMode) {
      onGuestModeProfileModificationAttempt?.invoke()
      return
    }

    sharedPreferences.edit {
      putString(KEY_EMAIL, email)
    }
  }

  fun updateProfileImage(imageUrl: String?) {
    if (authRepository.isGuestMode) {
      onGuestModeProfileModificationAttempt?.invoke()
      return
    }

    sharedPreferences.edit {
      if (imageUrl != null) {
        putString(KEY_PROFILE_IMAGE_URL, imageUrl)
      } else {
        remove(KEY_PROFILE_IMAGE_URL)
      }
    }
  }

  fun clearUserData() {
    sharedPreferences.edit { clear() }
  }

  companion object {
    private const val PREFS_NAME = "user_prefs"
    private const val KEY_NAME = "name"
    private const val KEY_EMAIL = "email"
    private const val KEY_PROFILE_IMAGE_URL = "profile_image_url"
    private const val KEY_CREATED_AT = "created_at"
  }
}
