# AutoMobile Design System

A comprehensive design system for the AutoMobile Android playground app using Compose Material3
theming.

## Overview

The AutoMobile Design System provides consistent UI components, theming, and visual standards across
all UI modules in the project. It follows the design specifications with a black primary color,
bright red accent color, and eggshell white background.

## Design Specifications

- **Primary Color**: Black (#000000)
- **Accent Color**: Bright red (#FF0000)
- **Background Color**: Eggshell white (#F8F8FF)
- **Design Principle**: Flat UI hierarchy avoiding nested cards

## Architecture

### Module Structure

- **playground:design:system** - Main design system module containing theme definitions, component
  specifications, and composable functions
- **playground:design:assets** - Asset-only module containing drawable resources, fonts, and other
  visual assets

### Theme Components

1. **Colors** (`theme/Color.kt`)
    - Primary color palette with semantic color definitions
    - Support for both light and dark themes
    - Consistent color tokens for all UI states

2. **Typography** (`theme/Typography.kt`)
    - Complete Material3 typography scale
    - Consistent font sizing and spacing
    - Optimized for readability across different screen sizes

3. **Shapes** (`theme/Shapes.kt`)
    - Material3 shape definitions
    - Custom shapes for specific use cases
    - Consistent corner radius standards

4. **Dimensions** (`theme/Dimensions.kt`)
    - Spacing scale for consistent layouts
    - Component height definitions
    - Elevation and border width standards

5. **Theme** (`theme/Theme.kt`)
    - Main theme composable function
    - Material3 ColorScheme implementation
    - Dark and light theme support

## Components

### Buttons

- `AutoMobileButton` - Primary button with consistent styling
- `AutoMobileSecondaryButton` - Secondary button variant
- `AutoMobileOutlinedButton` - Outlined button style
- `AutoMobileTextButton` - Text-only button
- `AutoMobileBackButton` - Navigation back button

### Floating Action Buttons

- `AutoMobileFloatingActionButton` - Standard FAB with icon
- `AutoMobileSmallFloatingActionButton` - Smaller FAB variant
- `AutoMobileExtendedFloatingActionButton` - Extended FAB with text and optional icon

### Cards

- `AutoMobileCard` - Standard elevated card
- `AutoMobileOutlinedCard` - Outlined card variant
- Follows flat design principles avoiding nested cards

### Text Components

- `AutoMobileText` - Base text component
- `AutoMobileHeadline` - Headline text styling
- `AutoMobileTitle` - Title text styling
- `AutoMobileBodyText` - Body text styling
- `AutoMobileLabel` - Label text styling

### Text Fields

- `AutoMobileTextField` - Filled text field
- `AutoMobileOutlinedTextField` - Outlined text field variant

### Navigation

- `AutoMobileTopAppBar` - Standard top app bar
- `AutoMobileCenterAlignedTopAppBar` - Center-aligned variant
- `AutoMobileBottomNavigation` - Bottom navigation bar with consistent styling
- `BottomNavItem` - Data class for bottom navigation items

### Dialogs

- `AutoMobileAlertDialog` - Standard alert dialog with title, text, and buttons
- `AutoMobileCustomDialog` - Custom dialog container for any content
- `AutoMobileConfirmationDialog` - Pre-configured confirmation dialog

## Usage

### Adding the Design System Dependency

Add to your module's `build.gradle.kts`:

```kotlin
dependencies {
    implementation(projects.playground.design.system)
}
```

### Using the Theme

Wrap your app content with the `AutoMobileTheme`:

```kotlin
@Composable
fun MyApp() {
    AutoMobileTheme {
        // Your app content
    }
}
```

### Using Components

Import and use components directly:

```kotlin
import com.zillow.automobile.design.system.components.*
import com.zillow.automobile.design.system.theme.*

@Composable
fun MyScreen() {
    AutoMobileCard {
        AutoMobileHeadline("Welcome")
        AutoMobileBodyText("This uses the design system")
        AutoMobileButton(
            text = "Action",
            onClick = { /* handle click */ }
        )
    }
}
```

### Accessing Theme Values

Use Material3 theme values within composables:

```kotlin
@Composable
fun MyComponent() {
    val primaryColor = MaterialTheme.colorScheme.primary
    val spacing = AutoMobileDimensions.spacing4
    val typography = MaterialTheme.typography.bodyLarge
    
    // Use these values in your composables
}
```

## Demo Screen

A comprehensive demo screen is available at `demo/DesignSystemDemoScreen.kt` that showcases all
components and demonstrates proper usage patterns.

## Migration from Old Theme

The design system replaces the old `AutomobileandroidTheme`. To migrate:

1. Replace `AutomobileandroidTheme` with `AutoMobileTheme`
2. Add design system dependency to your module
3. Update imports to use design system components
4. Replace custom color/typography definitions with design system tokens

## Best Practices

1. **Consistent Spacing**: Use `AutoMobileDimensions` for all spacing values
2. **Color Usage**: Use `MaterialTheme.colorScheme` colors instead of hardcoded values
3. **Typography**: Use design system text components for consistent styling
4. **No Nested Cards**: Follow flat design principles and avoid card nesting
5. **Component Composition**: Build complex UIs by composing simple design system components

## Contributing

When adding new components:

1. Follow the established naming convention: `AutoMobile[ComponentName]`
2. Use existing theme tokens (colors, typography, dimensions)
3. Include `@Preview` composables for development and testing
4. Document usage patterns and any special considerations
5. Ensure components follow Material3 guidelines and design specifications
