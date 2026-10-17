import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { Ajv } from 'ajv';
import { jsonValueSchema, hashJson } from '@contractrelay/contracts';
import type { JsonValue } from '@contractrelay/contracts';
import { normalizeContracts } from '@contractrelay/contracts/policy';
import type { ToolInvoker } from '@contractrelay/compiler';

export const sandboxConfigSchema = z.object({ version: z.literal(1), image: z.string().regex(/^node@sha256:[a-f0-9]{64}$/),
  wallTimeMs: z.number().int().min(100).max(30000), maxCalls: z.number().int().min(1).max(32),
  maxOutputBytes: z.number().int().min(1000).max(2000000) }).strict();
export type SandboxConfig = z.infer<typeof sandboxConfigSchema>;
export class SandboxError extends Error { constructor(readonly code: string) { super(code); } }

/** No mounts, host env, sockets, network or elevated capabilities enter the container. */
export function sandboxArguments(config: SandboxConfig, name: string, runner: string): string[] {
  sandboxConfigSchema.parse(config);
  if (!/^contractrelay-[a-f0-9-]+$/.test(name)) throw new Error('Invalid sandbox name');
  return ['run', '--rm', '-i', '--name', name, '--pull', 'never', '--network', 'none', '--read-only',
    '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges', '--pids-limit', '32', '--memory', '128m',
    '--memory-swap', '128m', '--cpus', '0.5', '--user', '65534:65534', '--tmpfs', '/tmp:rw,noexec,nosuid,size=16m',
    '--workdir', '/tmp', config.image, 'node', '--max-old-space-size=64', '--input-type=module', '-e', runner];
}

export class DockerSandbox {
  readonly config: SandboxConfig;
  constructor(config: unknown) { this.config = sandboxConfigSchema.parse(config); }

  async execute(code: string, input: JsonValue, targets: unknown, invoke: ToolInvoker): Promise<JsonValue> {
    if (!code.trim() || Buffer.byteLength(code) > 100000) throw new SandboxError('INVALID_WRAPPER');
    const contracts = normalizeContracts(targets);
    const ajv = new Ajv({ strict: true, allErrors: true, multipleOfPrecision: 12 });
    const schemas = new Map(contracts.map((contract) => [contract.name, { input: ajv.compile(contract.inputSchema),
      output: contract.outputSchema === undefined ? undefined : ajv.compile(contract.outputSchema) }]));
    const runner = await readFile(new URL('./sandbox-runner.mjs', import.meta.url), 'utf8');
    const name = `contractrelay-${randomUUID()}`;
    return new Promise((resolve, reject) => {
      const child = spawn('docker', sandboxArguments(this.config, name, runner), { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
      let settled = false;
      let buffer = '';
      let bytes = 0;
      let calls = 0;
      const ids = new Set<number>();
      let pending = false;
      const cleanup = () => {
        child.kill();
        // A killed CLI may leave the container alive; remove this exact random name.
        const removal = spawn('docker', ['rm', '--force', name], { stdio: 'ignore', windowsHide: true });
        removal.on('error', () => {});
      };
      const finish = (error?: SandboxError, value?: JsonValue) => {
        if (settled) return;
        settled = true; clearTimeout(timer); cleanup();
        if (error) reject(error); else resolve(value as JsonValue);
      };
      const timer = setTimeout(() => finish(new SandboxError('SANDBOX_TIMEOUT')), this.config.wallTimeMs);
      const handle = async (line: string) => {
        if (settled) return;
        try {
          const message = JSON.parse(line) as Record<string, unknown>;
          if (message.type === 'result') {
            if (pending) throw new SandboxError('PENDING_TOOL_CALL');
            finish(undefined, jsonValueSchema.parse(message.value));
          } else if (message.type === 'call') {
            if (pending || ++calls > this.config.maxCalls || !Number.isSafeInteger(message.id) || ids.has(message.id as number)) throw new SandboxError('SANDBOX_CALL_LIMIT');
            ids.add(message.id as number);
            const schema = schemas.get(String(message.tool));
            const args = jsonValueSchema.parse(message.args);
            if (!schema || args === null || typeof args !== 'object' || Array.isArray(args) || !schema.input(args)) throw new SandboxError('UNALLOWLISTED_TOOL_CALL');
            pending = true;
            try {
              const value = jsonValueSchema.parse(await invoke(String(message.tool), args));
              if (schema.output && !schema.output(value)) throw new SandboxError('INVALID_TARGET_OUTPUT');
              if (!settled) child.stdin.write(`${JSON.stringify({ id: message.id, ok: true, value })}\n`);
            } catch {
              if (!settled) child.stdin.write(`${JSON.stringify({ id: message.id, ok: false })}\n`);
            } finally { pending = false; }
          } else throw new SandboxError('WRAPPER_EXECUTION_FAILED');
        } catch (error) { finish(error instanceof SandboxError ? error : new SandboxError('INVALID_SANDBOX_PROTOCOL')); }
      };
      child.stdout.on('data', (chunk: Buffer) => {
        bytes += chunk.length;
        if (bytes > this.config.maxOutputBytes) { finish(new SandboxError('SANDBOX_OUTPUT_LIMIT')); return; }
        buffer += chunk.toString();
        for (;;) {
          const end = buffer.indexOf('\n'); if (end < 0) break;
          const line = buffer.slice(0, end); buffer = buffer.slice(end + 1);
          void handle(line);
        }
      });
      child.stderr.on('data', (chunk: Buffer) => { bytes += chunk.length; if (bytes > this.config.maxOutputBytes) finish(new SandboxError('SANDBOX_OUTPUT_LIMIT')); });
      child.stdin.on('error', () => {});
      child.on('error', () => finish(new SandboxError('DOCKER_UNAVAILABLE')));
      child.on('close', () => { if (!settled) finish(new SandboxError('SANDBOX_EXITED')); });
      child.stdin.write(`${JSON.stringify({ code, input: jsonValueSchema.parse(input), artifact_hash: hashJson(code) })}\n`);
    });
  }
}
