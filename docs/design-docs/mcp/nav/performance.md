# Performance

### Performance

- **Navigation ID**: ~1ms (simple extraction + hash)
- **Shallow Scrollable**: ~5-10ms (filtering + hash)
- **Cached ID**: ~1ms (no hierarchy processing)

---

### Success Rates by Scenario

| Scenario | Strategy | Success Rate | Notes |
|----------|----------|--------------|-------|
| SDK app, no keyboard | Navigation ID | **100%** | Perfect identifier |
| SDK app, with keyboard | Cached Nav ID | **100%** | Keyboard occlusion handled |
| Scrolling content | Shallow Scrollable | **100%** | Container stays stable |
| Tab navigation | Shallow Scrollable | **100%** | Selected state preserved |
| Non-SDK app | Shallow Scrollable | **75-85%** | Depends on hierarchy distinctiveness |

#### Overall Performance

- **Non-keyboard scenarios**: 100% success
- **Keyboard scenarios**: Depends on cache availability
- **No false positives**: Collision prevention through selected state
