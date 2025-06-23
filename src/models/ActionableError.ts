/**
 If thrown, the MCP server will catch it and send the message to the client.
 */
export class ActionableError extends Error {
  constructor(message: string) {
    super(message);
  }
}

/**
 * Error thrown when an operation requires root access but the emulator is not rooted
 */
export class EmulatorNotRootedError extends ActionableError {
  constructor() {
    super("Current emulator is not rooted, which is required for precise multi-finger gestures. Please use a rooted emulator image.");
  }
}
