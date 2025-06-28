package com.zillow.automobile.playground.navigation

import androidx.navigation3.runtime.NavKey
import kotlinx.serialization.Serializable

/** App navigation destinations for nav3 */
@Serializable sealed interface AppDestination : NavKey

@Serializable data object OnboardingDestination : AppDestination

@Serializable data object LoginDestination : AppDestination

@Serializable data object HomeDestination : AppDestination

@Serializable data class SlidesDestination(val slideIndex: Int = 0) : AppDestination

@Serializable data class VideoPlayerDestination(val videoId: String) : AppDestination
