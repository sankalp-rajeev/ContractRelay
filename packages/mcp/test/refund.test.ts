import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runRefundLifecycle } from '../../../fixtures/synthetic/refund/lifecycle.js';

const directories: string[] = [];
afterEach(async () => { await Promise.all(directories.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))); });

describe('unchanged MCP client over a stateful composed backend (TC-018/019)', () => {
  it('recovers a three-call refund and hidden retry without duplicate effects', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'contractrelay-mcp-refund-')); directories.push(dir);
    const result = await runRefundLifecycle(dir);
    expect(result).toMatchObject({ verdict: 'PROMOTED', stable_tool: 'refund_order', sealed_fixture_passed: true,
      side_effects: { refund_payment: 1, update_order_status: 1 } });
  });

  it('allows sealed assertions to falsify a promotion instead of reusing the gate oracle', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'contractrelay-sealed-refund-')); directories.push(dir);
    const result = await runRefundLifecycle(dir, { wrongProvenance: true });
    expect(result.verdict).toBe('PROMOTED');
    expect(result.sealed_fixture_passed).toBe(false);
  });
});
