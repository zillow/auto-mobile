package com.zillow.automobile.home.ui.home

import androidx.lifecycle.ViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

class HomeViewModel : ViewModel() {

  private val _text = MutableStateFlow("This is home Fragment")
  val text: StateFlow<String> = _text.asStateFlow()
}
