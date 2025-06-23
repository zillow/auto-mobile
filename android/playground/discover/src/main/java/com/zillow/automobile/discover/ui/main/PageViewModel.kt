package com.zillow.automobile.discover.ui.main

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn

class PageViewModel : ViewModel() {

  private val _index = MutableStateFlow(0)
  val text: StateFlow<String> =
      _index
          .map { "Hello world from section: $it" }
          .stateIn(
              scope = viewModelScope,
              started = SharingStarted.WhileSubscribed(5000),
              initialValue = "Hello world from section: 0")

  fun setIndex(index: Int) {
    _index.value = index
  }
}
