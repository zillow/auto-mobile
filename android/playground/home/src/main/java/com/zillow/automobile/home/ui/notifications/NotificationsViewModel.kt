package com.zillow.automobile.home.ui.notifications

import androidx.lifecycle.ViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

class NotificationsViewModel : ViewModel() {

  private val _text = MutableStateFlow("This is notifications Fragment")
  val text: StateFlow<String> = _text.asStateFlow()
}
