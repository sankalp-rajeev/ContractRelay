// The product CLI example uses the existing controlled weather backend unchanged.
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { toolContractSchema } from '@contractrelay/contracts';
import { createFixtureServer } from '@contractrelay/mcp/fixture-server';
import { newContract, weatherInvoker } from '../../fixtures/synthetic/weather/fixture.js';

const backend = createFixtureServer([toolContractSchema.parse(newContract)], weatherInvoker);
await backend.connect(new StdioServerTransport());
process.stdin.once('end', () => { void backend.close(); });
