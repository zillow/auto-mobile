declare module '@modelcontextprotocol/sdk/server/index.js' {
  export class Server {
    constructor(
      info: { name: string; version: string },
      config: { capabilities: { tools: Record<string, any> } }
    );
    
    setRequestHandler(schema: any, handler: (request: any) => Promise<any>): void;
    connect(transport: any): Promise<void>;
  }
}

declare module '@modelcontextprotocol/sdk/server/stdio.js' {
  export class StdioServerTransport {
    constructor();
  }
}


declare module '@modelcontextprotocol/sdk/types.js' {
  export const CallToolRequestSchema: any;
  export const ListToolsRequestSchema: any;
  export const GetResourceRequestSchema: any;
  export const ListResourcesRequestSchema: any;
}

declare module 'zod' {
  export const z: {
    object: (schema: Record<string, any>) => any;
    string: () => any;
    number: () => any;
    boolean: () => any;
    enum: (values: string[]) => any;
  };
}