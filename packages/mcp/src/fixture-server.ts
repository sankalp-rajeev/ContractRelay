import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { Ajv } from 'ajv';
import { jsonValueSchema } from '@contractrelay/contracts';
import type { ToolContract } from '@contractrelay/contracts';
import type { ToolInvoker } from '@contractrelay/compiler';
import { toMcpTool } from './proxy.js';

/** Trusted controlled backend fixture, validating both sides of every tool call. */
export function createFixtureServer(contracts: readonly ToolContract[], invoke: ToolInvoker): Server {
  const ajv = new Ajv({ strict: true, allErrors: true, multipleOfPrecision: 12 });
  const schemas = new Map(contracts.map((contract) => [contract.name, { input: ajv.compile(contract.inputSchema),
    output: contract.outputSchema === undefined ? undefined : ajv.compile(contract.outputSchema) }]));
  const tools = contracts.map(toMcpTool);
  const server = new Server({ name: 'contractrelay-controlled-fixture', version: '1' }, { capabilities: { tools: {} } });
  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const schema = schemas.get(request.params.name);
    const args = jsonValueSchema.parse(request.params.arguments ?? {});
    if (!schema || !schema.input(args) || args === null || typeof args !== 'object' || Array.isArray(args)) {
      return { isError: true, content: [{ type: 'text' as const, text: '{"code":"FIXTURE_INPUT_INVALID"}' }] };
    }
    try {
      const output = jsonValueSchema.parse(await invoke(request.params.name, args));
      if ((schema.output && !schema.output(output)) || output === null || typeof output !== 'object' || Array.isArray(output)) throw new Error('Invalid fixture output');
      return { content: [{ type: 'text' as const, text: JSON.stringify(output) }], structuredContent: output };
    } catch { return { isError: true, content: [{ type: 'text' as const, text: '{"code":"FIXTURE_EXECUTION_FAILED"}' }] }; }
  });
  return server;
}
