import { createMcpServer } from "../../src/server/index";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";

export interface McpTestContext {
  server: ReturnType<typeof createMcpServer>;
  client: Client;
  serverTransport: any;
  clientTransport: any;
}

export class McpTestFixture {
  public server!: ReturnType<typeof createMcpServer>;
  public client!: Client;
  public serverTransport!: any;
  public clientTransport!: any;

  async setup(): Promise<void> {
    this.server = createMcpServer();
    [this.serverTransport, this.clientTransport] = InMemoryTransport.createLinkedPair();

    await this.server.connect(this.serverTransport);

    this.client = new Client({
      name: "test-client",
      version: "0.0.1"
    });

    await this.client.connect(this.clientTransport);
  }

  async teardown(): Promise<void> {
    if (this.client) {
      await this.client.close();
    }
  }

  getContext(): McpTestContext {
    return {
      server: this.server,
      client: this.client,
      serverTransport: this.serverTransport,
      clientTransport: this.clientTransport
    };
  }
}
