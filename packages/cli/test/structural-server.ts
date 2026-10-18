import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createFixtureServer } from '@contractrelay/mcp/fixture-server';
import { newContract, invoke } from '../../compiler/test/structural.fixture.js';
const server = createFixtureServer([newContract], invoke);
await server.connect(new StdioServerTransport());
process.stdin.once('end', () => { void server.close(); });
