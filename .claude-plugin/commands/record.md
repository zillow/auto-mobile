---
description: Record video of device screen for documentation or bug reports
allowed-tools: mcp__auto-mobile__videoRecording, mcp__auto-mobile__observe
---

Start and stop video recording of the device screen for documentation, bug reports, or demonstrations.

## Workflow

### Starting a Recording

1. **Prepare the device**: Navigate to the starting point
2. **Start recording** using `videoRecording` with action: "start"
3. **Perform actions**: Execute the workflow you want to capture
4. **Note timestamps**: Track when key events occur for later reference

### Stopping a Recording

1. **Stop recording** using `videoRecording` with action: "stop"
2. **Access the recording**: Available via `automobile:video/latest` resource
3. **Review**: Check the captured footage

## Use Cases

- **Bug documentation**: Capture visual evidence of issues
- **Demo creation**: Record feature walkthroughs
- **Test evidence**: Prove test execution and results
- **Training materials**: Create how-to videos
- **Stakeholder communication**: Share app behavior visually

## Best Practices

- Start recording before the action sequence begins
- Keep recordings focused on specific flows (shorter is better)
- Note timestamp markers for key moments
- Stop recording promptly after completing the flow
- Use with `reproduce-bug` skill for comprehensive bug reports

## Recording Resources

Access recordings via MCP resources:
- `automobile:video/latest` - Most recent recording
- `automobile:video/archive` - All recordings
- `automobile:video/archive/{recordingId}` - Specific recording

## Output

After stopping a recording, report:
- Recording duration
- File location/resource URI
- Key timestamps if noted
- Suggestions for the recording (trim points, highlights)
