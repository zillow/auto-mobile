# Daemon CLI Plan

## Next Steps

1. Start the daemon and verify a tool call routes through it:
   ```bash
   auto-mobile --daemon start
   auto-mobile --cli listDevices
   ```
2. Validate state persistence across CLI invocations by running a sequence that relies on in-memory state, and confirm it survives multiple calls.
