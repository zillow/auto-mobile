package com.zillow.automobile.design.system.components

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.BasicAlertDialog
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.window.DialogProperties
import com.zillow.automobile.design.system.theme.AutoMobileDimensions
import com.zillow.automobile.design.system.theme.AutoMobileTheme

@Composable
fun AutoMobileAlertDialog(
  onDismissRequest: () -> Unit,
  title: String,
  text: String,
  confirmButtonText: String,
  onConfirmClick: () -> Unit,
  modifier: Modifier = Modifier,
  dismissButtonText: String? = null,
  onDismissClick: (() -> Unit)? = null,
  properties: DialogProperties = DialogProperties()
) {
  AlertDialog(
    onDismissRequest = onDismissRequest,
    title = {
      AutoMobileTitle(title)
    },
    text = {
      AutoMobileBodyText(text)
    },
    confirmButton = {
      AutoMobileButton(
        text = confirmButtonText,
        onClick = onConfirmClick
      )
    },
    dismissButton = if (dismissButtonText != null && onDismissClick != null) {
      {
        AutoMobileTextButton(
          text = dismissButtonText,
          onClick = onDismissClick
        )
      }
    } else null,
    modifier = modifier,
    containerColor = MaterialTheme.colorScheme.surface,
    titleContentColor = MaterialTheme.colorScheme.onSurface,
    textContentColor = MaterialTheme.colorScheme.onSurfaceVariant,
    properties = properties
  )
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AutoMobileCustomDialog(
  onDismissRequest: () -> Unit,
  modifier: Modifier = Modifier,
  properties: DialogProperties = DialogProperties(),
  content: @Composable () -> Unit
) {
  BasicAlertDialog(
    onDismissRequest = onDismissRequest,
    modifier = modifier,
    properties = properties
  ) {
    Card(
      colors = CardDefaults.cardColors(
        containerColor = MaterialTheme.colorScheme.surface,
        contentColor = MaterialTheme.colorScheme.onSurface
      ),
      elevation = CardDefaults.cardElevation(
        defaultElevation = AutoMobileDimensions.elevationLarge
      )
    ) {
      Column(
        modifier = Modifier.padding(AutoMobileDimensions.spacing6)
      ) {
        content()
      }
    }
  }
}

@Composable
fun AutoMobileConfirmationDialog(
  onDismissRequest: () -> Unit,
  title: String,
  text: String,
  onConfirm: () -> Unit,
  onCancel: () -> Unit,
  modifier: Modifier = Modifier,
  confirmText: String = "Confirm",
  cancelText: String = "Cancel"
) {
  AutoMobileAlertDialog(
    onDismissRequest = onDismissRequest,
    title = title,
    text = text,
    confirmButtonText = confirmText,
    onConfirmClick = onConfirm,
    dismissButtonText = cancelText,
    onDismissClick = onCancel,
    modifier = modifier
  )
}

@Preview(showBackground = true)
@Composable
private fun AutoMobileDialogPreview() {
  AutoMobileTheme {
    Column(
      verticalArrangement = Arrangement.spacedBy(AutoMobileDimensions.spacing4)
    ) {
      AutoMobileCustomDialog(
        onDismissRequest = { }
      ) {
        AutoMobileHeadline("Custom Dialog")
        Spacer(modifier = Modifier.height(AutoMobileDimensions.spacing2))
        AutoMobileBodyText("This is a custom dialog with any content.")
        Spacer(modifier = Modifier.height(AutoMobileDimensions.spacing4))
        Row(
          modifier = Modifier.fillMaxWidth(),
          horizontalArrangement = Arrangement.End
        ) {
          AutoMobileTextButton(
            text = "Cancel",
            onClick = { }
          )
          Spacer(modifier = Modifier.width(AutoMobileDimensions.spacing2))
          AutoMobileButton(
            text = "OK",
            onClick = { }
          )
        }
      }
    }
  }
}
