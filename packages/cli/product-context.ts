import { access } from 'node:fs/promises';
import { basename, dirname, relative, resolve } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { hashContract, hashJson, jsonValueSchema, toolContractSchema } from '@contractrelay/contracts';
import type { JsonValue, ToolContract } from '@contractrelay/contracts';
import { normalizeContracts } from '@contractrelay/contracts/policy';
import { readJson } from '@contractrelay/contracts/artifacts';
import { snapshotTools } from '@contractrelay/mcp';
import type { SnapshotOptions } from '@contractrelay/mcp';
import { gateEvidenceSchema } from '@contractrelay/verifier';
import type { GateEvidence } from '@contractrelay/verifier';
import { synthesisEvidenceSchema } from '../synthesizer/src/index.js';

export interface MigrationContext {
  version: 1;
  planHash: string;
  oldContract: ToolContract;
  newContracts: ToolContract[];
  snapshot: SnapshotOptions;
  gateEvidence: GateEvidence;
  target: { command: string; args: string[]; cwd: string };
}

export function object(value: unknown): Record<string, JsonValue> {
  const parsed = jsonValueSchema.parse(value);
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Expected a JSON object');
  return parsed;
}
export function text(value: unknown, name: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`Missing or invalid ${name}`);
  return value;
}
function strings(value: unknown): string[] {
  if (!Array.isArray(value) || value.length > 256 || value.some(item => typeof item !== 'string')) throw new Error('target.args must be a string array');
  return value as string[];
}
function metadata(value: unknown): NonNullable<SnapshotOptions['metadata']> {
  return Object.fromEntries(Object.entries(object(value)).map(([name, entry]) => [name,
    toolContractSchema.pick({ sideEffect: true, idempotency: true }).strict().parse(entry)]));
}
export function artifactPaths(plan: string) {
  const file = resolve(plan);
  return { plan: file, context: `${file}.context.json`, verified: `${file}.verified.json`, registry: `${file}.registry`, synthesis: `${file}.synthesis` };
}
export async function exists(path: string): Promise<boolean> {
  try { await access(path); return true; }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false; throw error; }
}

/** Feed saved tools/list JSON through the existing MCP ingestion path. */
export async function prepareMigration(options: { old: string; new: string; evidence: string; out: string; tool?: string }) {
  const [oldRaw, newRaw, settingsRaw] = await Promise.all([readJson(options.old), readJson(options.new), readJson(options.evidence)]);
  const settings = object(settingsRaw);
  if (settings.version !== 1) throw new Error('Evidence version must be 1');
  if (settings.policy !== undefined && settings.policy !== 'read-only-v1') throw new Error('The snapshot CLI supports read-only-v1; use the existing isolated fixture CLI for write demos');
  const oldOptions: SnapshotOptions = { namespace: 'cli/old', source: `json-tools-list:${basename(options.old)}#${hashJson(oldRaw)}`, metadata: metadata(settings.oldMetadata) };
  const snapshot: SnapshotOptions = { namespace: 'cli/new', source: `json-tools-list:${basename(options.new)}#${hashJson(newRaw)}`, metadata: metadata(settings.newMetadata) };
  const old = await snapshotTools({ listTools: async () => oldRaw }, oldOptions);
  const next = await snapshotTools({ listTools: async () => newRaw }, snapshot);
  const name = options.tool ?? (typeof settings.sourceTool === 'string' ? settings.sourceTool : undefined);
  if (!name && old.tools.length !== 1) throw new Error('Multiple old tools: select --tool NAME');
  const selected = name ? old.tools.find(tool => tool.name === name) : old.tools[0];
  if (!selected) throw new Error('Selected old tool is not in the snapshot');
  const synthesis = synthesisEvidenceSchema.parse({ dataClass: settings.dataClass ?? 'public', oldContract: selected, newContracts: next.tools, documents: settings.documents });
  const rawGate = object(settings.gate);
  if (!Array.isArray(rawGate.traces)) throw new Error('gate.traces must be an array');
  const contractHash = hashContract(selected);
  const traces = rawGate.traces.map(value => {
    const trace = object(value);
    if (trace.contractHash !== undefined && trace.contractHash !== contractHash) throw new Error('Gate trace contractHash does not match the old snapshot');
    return { ...trace, tool: trace.tool ?? selected.name, contractHash };
  });
  const gateEvidence = gateEvidenceSchema.parse({ ...rawGate, traces });
  const target = object(settings.target);
  const command = text(target.command, 'target.command');
  const cwd = resolve(dirname(resolve(options.evidence)), typeof target.cwd === 'string' ? target.cwd : '.');
  const context: Omit<MigrationContext, 'planHash'> = { version: 1, oldContract: selected, newContracts: normalizeContracts(next.tools), snapshot, gateEvidence,
    target: { command, args: strings(target.args ?? []), cwd: relative(dirname(resolve(options.out)), cwd) || '.' } };
  return { context, synthesis };
}

export async function readContext(plan: string): Promise<MigrationContext> {
  const raw = object(await readJson(artifactPaths(plan).context));
  if (raw.version !== 1 || !/^[a-f0-9]{64}$/.test(text(raw.planHash, 'context.planHash'))) throw new Error('Invalid migration context');
  const snapshot = object(raw.snapshot);
  const target = object(raw.target);
  return { version: 1, planHash: text(raw.planHash, 'context.planHash'), oldContract: toolContractSchema.parse(raw.oldContract), newContracts: normalizeContracts(raw.newContracts),
    gateEvidence: gateEvidenceSchema.parse(raw.gateEvidence), snapshot: { namespace: text(snapshot.namespace, 'snapshot.namespace'), source: text(snapshot.source, 'snapshot.source'), metadata: metadata(snapshot.metadata) },
    target: { command: text(target.command, 'target.command'), args: strings(target.args), cwd: text(target.cwd, 'target.cwd') } };
}

export async function connectTarget(plan: string, context: MigrationContext) {
  const client = new Client({ name: 'contractrelay-cli-target', version: '0.1.0' });
  const transport = new StdioClientTransport({ command: context.target.command, args: context.target.args,
    cwd: resolve(dirname(artifactPaths(plan).plan), context.target.cwd), stderr: 'inherit' });
  try { await client.connect(transport); return client; }
  catch { await client.close().catch(() => undefined); throw new Error('TARGET_CONNECTION_FAILED: check the operator-supplied target command'); }
}
