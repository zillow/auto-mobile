/**
 If thrown, the MCP server will catch it and send the message to the client.
 */
export class ActionableError extends Error {
  constructor(message: string) {
    super(message);
  }
}
