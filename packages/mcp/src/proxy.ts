import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { CallToolRequestSchema, CallToolResultSchema, ErrorCode, ListToolsRequestSchema, McpError } from '@modelcontextprotocol/sdk/types.js';
import { jsonValueSchema, toolContractSchema } from '@contractrelay/contracts';
import type { JsonValue, ToolContract } from '@contractrelay/contracts';
import { AdapterError } from '@contractrelay/compiler';
import type { ToolInvoker } from '@contractrelay/compiler';
import type { PromotionKey, PromotionRegistry } from '@contractrelay/runtime';
import type { ToolTrace } from '@contractrelay/traces';
import { snapshotTools } from './index.js';
import type { SnapshotOptions, ToolCatalogClient } from './index.js';

export interface McpTargetClient extends ToolCatalogClient {
  callTool(params: { name: string; arguments: Record<string, unknown> }): Promise<unknown>;
}

export function createMcpInvoker(client: McpTargetClient): ToolInvoker {
  return async (tool, args): Promise<JsonValue> => {
    const response = CallToolResultSchema.parse(await client.callTool({ name: tool, arguments: { ...args } }));
    if (response.isError) throw new AdapterError('TARGET_TOOL_ERROR', 'Target tool reported failure');
    if (response.structuredContent !== undefined) return jsonValueSchema.parse(response.structuredContent);
    const only = response.content.length === 1 ? response.content[0] : undefined;
    if (only?.type !== 'text') throw new AdapterError('TARGET_RESPONSE_UNSUPPORTED', 'Expected a JSON object result');
    try { return jsonValueSchema.parse(JSON.parse(only.text)); }
    catch { throw new AdapterError('TARGET_RESPONSE_UNSUPPORTED', 'Target text response is not JSON'); }
  };
}

export function toMcpTool(contract: ToolContract) {
  if (typeof contract.inputSchema !== 'object' || contract.inputSchema.type !== 'object'
    || (contract.outputSchema !== undefined && (typeof contract.outputSchema !== 'object' || contract.outputSchema.type !== 'object'))) {
    throw new AdapterError('MCP_SCHEMA_UNSUPPORTED', 'MCP tool schemas must describe objects');
  }
  return { name: contract.name, ...(contract.description === undefined ? {} : { description: contract.description }),
    inputSchema: contract.inputSchema as { type: 'object'; [key: string]: unknown },
    ...(contract.outputSchema === undefined ? {} : { outputSchema: contract.outputSchema as { type: 'object'; [key: string]: unknown } }) };
}

/** Advertise the old interface, but re-snapshot the live target before EVERY invocation. */
export function createCompatibilityServer(options: {
  oldContract: unknown; registry: PromotionRegistry; key: PromotionKey; target: McpTargetClient;
  snapshot: SnapshotOptions; targetTool?: string; targetTools?: readonly string[];
  executionEnvironment?: 'isolated-fixture' | 'simulator'; onTrace?: (trace: ToolTrace) => void | Promise<void>;
}): Server {
  const oldContract = toolContractSchema.parse(options.oldContract);
  const definition = toMcpTool(oldContract);
  const invoke = createMcpInvoker(options.target);
  const server = new Server({ name: 'contractrelay', version: '0.1.0' }, { capabilities: { tools: {} } });
  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: [definition] }));
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    if (request.params.name !== oldContract.name) throw new McpError(ErrorCode.InvalidParams, 'Unknown stable tool');
    try {
      const snapshot = await snapshotTools(options.target, options.snapshot);
      const names = options.targetTools ?? (options.targetTool ? [options.targetTool] : []);
      if (!names.length || names.some((name) => !snapshot.tools.some((tool) => tool.name === name))) {
        throw new AdapterError('TARGET_TOOL_MISSING', 'A promoted target tool is no longer advertised');
      }
      const selected = snapshot.tools.filter((tool) => names.includes(tool.name));
      const current = options.targetTools ? selected : selected[0];
      const output = await options.registry.execute({ key: options.key, oldContract, newContract: current,
        input: request.params.arguments ?? {}, invoke,
        ...(options.executionEnvironment === undefined ? {} : { executionEnvironment: options.executionEnvironment }),
        ...(options.onTrace === undefined ? {} : { onTrace: options.onTrace }) });
      if (output === null || typeof output !== 'object' || Array.isArray(output)) throw new AdapterError('MCP_RESPONSE_UNSUPPORTED', 'Expected an object result');
      return { content: [{ type: 'text' as const, text: JSON.stringify(output) }], structuredContent: output };
    } catch (error) {
      const code = error instanceof AdapterError ? error.code : 'COMPATIBILITY_CALL_FAILED';
      return { isError: true, content: [{ type: 'text' as const, text: JSON.stringify({ code }) }] };
    }
  });
  return server;
}
