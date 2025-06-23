package com.zillow.automobile.home.navigation

/**
 * Home tab destinations
 */
sealed class HomeTabDestination(val route: String)

object DiscoverTabDestination : HomeTabDestination("discover")

object SettingsTabDestination : HomeTabDestination("settings")
