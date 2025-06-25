package com.zillow.automobile.login.ui

import android.content.res.Configuration
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.wrapContentWidth
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.tooling.preview.Preview
import com.zillow.automobile.design.system.components.AutoMobileButton
import com.zillow.automobile.design.system.theme.AutoMobileDimensions
import com.zillow.automobile.design.system.theme.AutoMobileTheme
import com.zillow.automobile.login.R

/** Action buttons section containing sign in button, loading indicator, and guest mode button. */
@Composable
internal fun LoginActions(
    isFormValid: Boolean,
    isLoading: Boolean,
    onSignInClick: () -> Unit,
    onGuestModeClick: () -> Unit,
    modifier: Modifier = Modifier
) {
  Column(modifier = modifier, horizontalAlignment = Alignment.CenterHorizontally) {
    AnimatedVisibility(visible = isFormValid && !isLoading, enter = fadeIn(), exit = fadeOut()) {
      AutoMobileButton(
          text = stringResource(R.string.action_sign_in),
          onClick = onSignInClick,
          modifier = Modifier.wrapContentWidth())
    }

    if (isLoading) {
      Spacer(modifier = Modifier.height(AutoMobileDimensions.spacing4))
      CircularProgressIndicator(color = MaterialTheme.colorScheme.primary)
    }

    Spacer(modifier = Modifier.height(AutoMobileDimensions.spacing4))

    AutoMobileButton(
        text = "Continue as Guest",
        onClick = onGuestModeClick,
        modifier = Modifier.wrapContentWidth())
  }
}

@Preview(name = "Login Actions", showBackground = true, uiMode = Configuration.UI_MODE_NIGHT_NO)
@Preview(
    name = "Login Actions - Dark", showBackground = true, uiMode = Configuration.UI_MODE_NIGHT_YES)
@Composable
fun LoginActionsPreview() {
  AutoMobileTheme {
    LoginActions(isFormValid = true, isLoading = false, onSignInClick = {}, onGuestModeClick = {})
  }
}
