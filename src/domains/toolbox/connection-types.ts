import type { Client, Transport } from "@modelcontextprotocol/client";

export interface Session {
  client: Client;
  transport: Transport;
  slot: boolean;
}
