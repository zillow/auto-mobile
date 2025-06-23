package com.zillow.automobile.design.system.components

import androidx.compose.foundation.layout.height
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarDefaults
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationBarItemDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.tooling.preview.Preview
import com.zillow.automobile.design.system.theme.AutoMobileDimensions
import com.zillow.automobile.design.system.theme.AutoMobileTheme

data class BottomNavItem(
    val label: String,
    val icon: ImageVector,
    val selectedIcon: ImageVector = icon,
    val contentDescription: String? = label
)

@Composable
fun AutoMobileBottomNavigation(
    items: List<BottomNavItem>,
    selectedItemIndex: Int,
    onItemSelected: (Int) -> Unit,
    modifier: Modifier = Modifier
) {
  NavigationBar(
      modifier = modifier.height(AutoMobileDimensions.bottomNavHeight),
      containerColor = MaterialTheme.colorScheme.surface,
      contentColor = MaterialTheme.colorScheme.onSurface,
      tonalElevation = AutoMobileDimensions.elevationSmall,
      windowInsets = NavigationBarDefaults.windowInsets) {
        items.forEachIndexed { index, item ->
          NavigationBarItem(
              selected = selectedItemIndex == index,
              onClick = { onItemSelected(index) },
              icon = {
                Icon(
                    imageVector = if (selectedItemIndex == index) item.selectedIcon else item.icon,
                    contentDescription = item.contentDescription)
              },
              label = {
                Text(
                    text = item.label,
                    style = MaterialTheme.typography.labelSmall,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis)
              },
              colors =
                  NavigationBarItemDefaults.colors(
                      selectedIconColor = MaterialTheme.colorScheme.primary,
                      selectedTextColor = MaterialTheme.colorScheme.primary,
                      unselectedIconColor = MaterialTheme.colorScheme.onSurfaceVariant,
                      unselectedTextColor = MaterialTheme.colorScheme.onSurfaceVariant,
                      indicatorColor = MaterialTheme.colorScheme.primaryContainer))
        }
      }
}

@Preview(showBackground = true)
@Composable
private fun AutoMobileBottomNavigationPreview() {
  AutoMobileTheme {
    val items =
        listOf(
            BottomNavItem("Home", Icons.Default.Home),
            BottomNavItem("Search", Icons.Default.Search),
            BottomNavItem("Profile", Icons.Default.Person),
            BottomNavItem("Settings", Icons.Default.Settings))

    AutoMobileBottomNavigation(items = items, selectedItemIndex = 0, onItemSelected = {})
  }
}
