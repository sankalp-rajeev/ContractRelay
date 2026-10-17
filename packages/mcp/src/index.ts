import { ListToolsResultSchema } from '@modelcontextprotocol/sdk/types.js';
import { hashJson, toolContractSchema } from '@contractrelay/contracts';
import type { ToolContract } from '@contractrelay/contracts';

export interface ToolCatalogClient {
  listTools(params?: { cursor?: string }): Promise<unknown>;
}

export interface SnapshotOptions {
  namespace: string;
  source: string;
  version?: string;
  /** Explicit, operator-supplied metadata; server hints are not promotion evidence. */
  metadata?: Readonly<Record<string, Pick<ToolContract, 'sideEffect' | 'idempotency'>>>;
  maxPages?: number;
}

export interface ContractSnapshot {
  version: 1;
  tools: readonly ToolContract[];
  hash: string;
}

/** Snapshot every tools/list page. No invented safety classifications or timestamps. */
export async function snapshotTools(client: ToolCatalogClient, options: SnapshotOptions): Promise<ContractSnapshot> {
  if (!options.namespace || !options.source) throw new Error('Snapshot namespace and source are required');
  const maxPages = options.maxPages ?? 100;
  if (!Number.isSafeInteger(maxPages) || maxPages < 1) throw new Error('Invalid page limit');
  const tools: ToolContract[] = [];
  const names = new Set<string>();
  const cursors = new Set<string>();
  let cursor: string | undefined;
  for (let page = 0; page < maxPages; page++) {
    const response = ListToolsResultSchema.parse(await client.listTools(cursor === undefined ? {} : { cursor }));
    for (const tool of response.tools) {
      if (names.has(tool.name)) throw new Error(`Duplicate tool name: ${tool.name}`);
      names.add(tool.name);
      tools.push(toolContractSchema.parse({
        contractId: `${options.namespace}/${tool.name}`,
        ...(options.version === undefined ? {} : { version: options.version }),
        provenance: { kind: 'mcp-live-snapshot', source: options.source },
        name: tool.name,
        ...(tool.description === undefined ? {} : { description: tool.description }),
        inputSchema: tool.inputSchema,
        ...(tool.outputSchema === undefined ? {} : { outputSchema: tool.outputSchema }),
        sideEffect: options.metadata?.[tool.name]?.sideEffect ?? 'UNKNOWN',
        idempotency: options.metadata?.[tool.name]?.idempotency ?? 'UNKNOWN',
        ...(tool.annotations === undefined ? {} : {
          semanticAnnotations: [{ key: 'mcp.annotations.untrusted-hints', value: tool.annotations, evidenceRef: options.source }]
        })
      }));
    }
    cursor = response.nextCursor;
    if (cursor === undefined) {
      tools.sort((left, right) => left.name < right.name ? -1 : left.name > right.name ? 1 : 0);
      return { version: 1, tools, hash: hashJson({ version: 1, tools }) };
    }
    if (cursors.has(cursor)) throw new Error('Repeated pagination cursor');
    cursors.add(cursor);
  }
  throw new Error('MCP snapshot page limit exceeded');
}
