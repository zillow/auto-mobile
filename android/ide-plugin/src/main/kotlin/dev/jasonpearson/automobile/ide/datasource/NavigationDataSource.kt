package dev.jasonpearson.automobile.ide.datasource

import dev.jasonpearson.automobile.ide.navigation.ScreenNode
import dev.jasonpearson.automobile.ide.navigation.ScreenTransition

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
