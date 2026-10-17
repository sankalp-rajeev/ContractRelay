import { runRefundLifecycle } from '../fixtures/synthetic/refund/lifecycle.js';
const result = await runRefundLifecycle('runs/refund-demo');
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
if (!result.sealed_fixture_passed) process.exitCode = 1;
