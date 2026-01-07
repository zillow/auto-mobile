# Tap Target Size Accessibility

Ensure interactive elements meet minimum size requirements for accessibility.


AutoMobile can audit:

- Tap target dimensions
- Touch target spacing
- WCAG 2.1 compliance
- Material Design compliance

## Size Requirements

### WCAG 2.1 Level AAA
- **Minimum size**: 44x44 dp (density-independent pixels)

### Material Design Guidelines
- **Recommended size**: 48x48 dp minimum
- **Spacing**: 8dp between tap targets

## Using AutoMobile

Prerequisites: [UI auditing prerequisites](../ui-auditing-prereqs.md).

Example prompt:

```
Check if all buttons and links meet the minimum tap target size of 48x48dp
```

## Common Issues

AutoMobile can detect:

- Small icon buttons (<44dp)
- Closely spaced list items
- Tiny checkboxes or radio buttons
- Links embedded in dense text

## Remediation

When issues are found:

1. **Increase padding**: Add touch padding without changing visual size
2. **Increase spacing**: Add margins between interactive elements
3. **Resize elements**: Make buttons physically larger
4. **Use touch delegates**: Extend touch area beyond visual bounds (Android)

### Example Fix (Android)

```kotlin
// Extend touch area for small button
val parent = button.parent as View
parent.post {
    val rect = Rect()
    button.getHitRect(rect)
    rect.top -= 16.dp // Extend by 16dp
    rect.bottom += 16.dp
    rect.left -= 16.dp
    rect.right += 16.dp
    parent.touchDelegate = TouchDelegate(rect, button)
}
```

## Resources

- [WCAG 2.1 Target Size](https://www.w3.org/WAI/WCAG21/Understanding/target-size.html)
- [Material Design Touch Targets](https://m3.material.io/foundations/overview/principles)
