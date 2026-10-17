import { compileCandidate } from '../packages/compiler/src/index.js';
import oldContract from '../fixtures/synthetic/weather/old.contract.json' with { type: 'json' };
import newContract from '../fixtures/synthetic/weather/new.contract.json' with { type: 'json' };
import plan from '../fixtures/synthetic/weather/adapter.plan.json' with { type: 'json' };

const candidate = compileCandidate(plan, oldContract, newContract);
const result = await candidate.executeForVerification({ city: 'Ann Arbor' }, async (tool, args) => {
  if (tool !== 'fetch_forecast' || args.location !== 'Ann Arbor' || args.units !== 'imperial') {
    throw new Error('Unexpected fixture invocation');
  }
  return { current: { temperature: 64, summary: 'Clear' } };
});

process.stdout.write(`${JSON.stringify({
  status: 'candidate-fixture-only',
  planHash: candidate.planHash,
  oldContractHash: candidate.oldContractHash,
  newContractHash: candidate.newContractHash,
  result
}, null, 2)}\n`);
