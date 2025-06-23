package com.zillow.automobile.design.system.theme

import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Shapes
import androidx.compose.ui.unit.dp

// AutoMobile Design System Shapes
val AutoMobileShapes = Shapes(
  extraSmall = RoundedCornerShape(4.dp),
  small = RoundedCornerShape(8.dp),
  medium = RoundedCornerShape(12.dp),
  large = RoundedCornerShape(16.dp),
  extraLarge = RoundedCornerShape(28.dp),
)

// Additional custom shapes for specific use cases
object AutoMobileCustomShapes {
  val button = RoundedCornerShape(8.dp)
  val card = RoundedCornerShape(12.dp)
  val bottomSheet = RoundedCornerShape(topStart = 16.dp, topEnd = 16.dp)
  val dialog = RoundedCornerShape(16.dp)
  val textField = RoundedCornerShape(8.dp)
}
