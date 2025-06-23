# AutoMobile Slides

A presentation system for AutoMobile framework with code highlighting capabilities.

## Features

### Code Sample Highlighting

The `CodeSample` slide type now supports automatic line highlighting to emphasize specific parts of
code during presentations.

#### Usage

```kotlin
SlideContent.CodeSample(
  code = """
    keepClearAreas: restricted=[], unrestricted=[]
    mPrepareSyncSeqId=0
    imeLayeringTarget in display# 0 Window{...}
    imeInputTarget in display# 0 Window{...}
    imeControlTarget in display# 0 Window{...}
    Minimum task size of display#0 220
  """.trimIndent(),
  language = "shell",
  highlight = """
    imeLayeringTarget in display# 0 Window{...}
    imeInputTarget in display# 0 Window{...}
    imeControlTarget in display# 0 Window{...}
  """.trimIndent()
)
```

#### How It Works

- **Highlighted Lines**: Lines that contain any text from the `highlight` parameter are displayed
  with full opacity and bold font weight
- **Dimmed Lines**: All other lines are displayed with 30% opacity to reduce visual emphasis
- **Exact Matching**: The highlighting uses exact substring matching (case-sensitive)
- **Multi-line Support**: The `highlight` parameter can contain multiple lines, each will be matched
  independently

#### Supported Languages

The code highlighting works with all languages supported by Prism.js:

- Kotlin
- Java
- JavaScript
- YAML
- JSON
- Shell/Bash
- And many more...

#### Examples

See `HighlightingExample.kt` for comprehensive examples showing different use cases:

1. **Android Log Output**: Highlighting specific window manager entries
2. **Test Code**: Emphasizing key AutoMobile test actions
3. **Configuration Files**: Highlighting important YAML configuration keys
4. **API Responses**: Focusing on specific JSON fields

#### Visual Styling

- **Light Mode**: Black text on white background with highlighted lines in bold
- **Dark Mode**: Light text on dark background with highlighted lines in bold
- **Dimmed lines**: 30% opacity for non-highlighted content
- **Highlighted lines**: 100% opacity with bold font weight

#### Migration

Existing `CodeSample` slides continue to work without changes. The `highlight` parameter is optional
and defaults to `null` (no highlighting).
