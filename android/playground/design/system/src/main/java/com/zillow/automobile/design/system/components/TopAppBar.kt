package com.zillow.automobile.design.system.components

import androidx.compose.foundation.layout.RowScope
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.CenterAlignedTopAppBar
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarColors
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.tooling.preview.Preview

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AutoMobileTopAppBar(
    title: @Composable () -> Unit,
    modifier: Modifier = Modifier,
    navigationIcon: @Composable () -> Unit = {},
    actions: @Composable RowScope.() -> Unit = {},
    colors: TopAppBarColors =
        TopAppBarDefaults.topAppBarColors(
            containerColor = MaterialTheme.colorScheme.surface,
            titleContentColor = MaterialTheme.colorScheme.onSurface,
            navigationIconContentColor = MaterialTheme.colorScheme.onSurface,
            actionIconContentColor = MaterialTheme.colorScheme.onSurface)
) {
  TopAppBar(
      title = title,
      modifier = modifier,
      navigationIcon = navigationIcon,
      actions = actions,
      colors = colors)
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AutoMobileCenterAlignedTopAppBar(
    title: @Composable () -> Unit,
    modifier: Modifier = Modifier,
    navigationIcon: @Composable () -> Unit = {},
    actions: @Composable RowScope.() -> Unit = {},
    colors: TopAppBarColors =
        TopAppBarDefaults.centerAlignedTopAppBarColors(
            containerColor = MaterialTheme.colorScheme.surface,
            titleContentColor = MaterialTheme.colorScheme.onSurface,
            navigationIconContentColor = MaterialTheme.colorScheme.onSurface,
            actionIconContentColor = MaterialTheme.colorScheme.onSurface)
) {
  CenterAlignedTopAppBar(
      title = title,
      modifier = modifier,
      navigationIcon = navigationIcon,
      actions = actions,
      colors = colors)
}

@Composable
fun AutoMobileBackButton(
    onBackClick: () -> Unit,
    modifier: Modifier = Modifier,
    icon: ImageVector = Icons.AutoMirrored.Filled.ArrowBack,
    contentDescription: String? = "Navigate back"
) {
  IconButton(onClick = onBackClick, modifier = modifier) {
    Icon(
        imageVector = icon,
        contentDescription = contentDescription,
        tint = MaterialTheme.colorScheme.onSurface)
  }
}

@OptIn(ExperimentalMaterial3Api::class)
@Preview(showBackground = true)
@Composable
private fun AutoMobileTopAppBarPreview() {
  com.zillow.automobile.design.system.theme.AutoMobileTheme {
    AutoMobileTopAppBar(
        title = { AutoMobileTitle("App Title") },
        navigationIcon = { AutoMobileBackButton(onBackClick = {}) })
  }
}
