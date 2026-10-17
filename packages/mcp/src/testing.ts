import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import type { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';

export async function connectFixtureClient(server: Server, name: string): Promise<Client> {
  const client = new Client({ name, version: '1' });
  const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport); await client.connect(clientTransport);
  return client;
}
