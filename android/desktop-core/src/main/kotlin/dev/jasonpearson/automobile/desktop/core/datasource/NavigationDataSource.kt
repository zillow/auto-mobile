package dev.jasonpearson.automobile.desktop.core.datasource

import dev.jasonpearson.automobile.desktop.core.navigation.ScreenNode
import dev.jasonpearson.automobile.desktop.core.navigation.ScreenTransition

data class NavigationGraph(
    val screens: List<ScreenNode>,
    val transitions: List<ScreenTransition>,
)

interface NavigationDataSource {
    suspend fun getNavigationGraph(): Result<NavigationGraph>
}

sealed class Result<out T> {
    data class Success<T>(val data: T) : Result<T>()
    data class Error(val message: String) : Result<Nothing>()
    object Loading : Result<Nothing>()
}
