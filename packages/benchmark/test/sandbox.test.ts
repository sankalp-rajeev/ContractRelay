import { describe, expect, it } from 'vitest';
import config from '../../../config/sandbox.json' with { type: 'json' };
import { sandboxArguments, sandboxConfigSchema } from '../src/sandbox.js';

describe('generated-code container boundary (TC-022)', () => {
  it('requires a digest and rejects mutable or arbitrary images', () => {
    expect(() => sandboxConfigSchema.parse({ ...config, image: 'node:latest' })).toThrow();
    expect(() => sandboxArguments(sandboxConfigSchema.parse(config), 'unsafe/name', '')).toThrow();
  });
  it('has no host mounts or env forwarding and bounds every disposable execution', () => {
    const args = sandboxArguments(sandboxConfigSchema.parse(config), 'contractrelay-abcdef', 'trusted runner');
    expect(args).toEqual(expect.arrayContaining(['--network', 'none', '--read-only', '--cap-drop', 'ALL', '--pids-limit', '32',
      '--memory', '128m', '--cpus', '0.5', '--user', '65534:65534', '--pull', 'never']));
    expect(args.filter((arg) => arg === '-e')).toHaveLength(1);
    for (const forbidden of ['-v', '--mount', '--env', '--privileged', '--volume']) expect(args).not.toContain(forbidden);
  });
});
