# Contrast Ratio Accessibility

Ensure your app meets WCAG contrast ratio requirements for text and UI elements.


AutoMobile can audit:

- Text contrast ratios
- Interactive element contrast
- WCAG 2.1 Level AA/AAA compliance
- Color accessibility issues

## Contrast Requirements

### WCAG 2.1 Standards

- **Normal Text**: Minimum 4.5:1 contrast ratio (AA), 7:1 (AAA)
- **Large Text**: Minimum 3:1 contrast ratio (AA), 4.5:1 (AAA)
- **UI Components**: Minimum 3:1 contrast ratio

Large text is defined as:

- 18pt (24px) or larger
- 14pt (18.5px) bold or larger

## Using AutoMobile

Example prompt:

```
Audit the login screen for contrast ratio accessibility issues
```

## Common Issues

AutoMobile can detect:

- Light gray text on white backgrounds
- Low-contrast buttons
- Disabled form fields with insufficient contrast
- Link text not distinguishable from body text

## Remediation

When issues are found:

1. **Increase contrast**: Darken text or lighten backgrounds
2. **Add visual indicators**: Don't rely on color alone
3. **Test with tools**: Verify fixes meet WCAG standards
4. **Consider dark mode**: Ensure contrast works in both themes

## Resources

- [WCAG 2.1 Contrast Guidelines](https://www.w3.org/WAI/WCAG21/Understanding/contrast-minimum.html)
- [WebAIM Contrast Checker](https://webaim.org/resources/contrastchecker/)
