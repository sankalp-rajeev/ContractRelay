import { parseArgs } from 'node:util';

const command = process.argv[2] ?? '--help';

if (command === 'status') {
  process.stdout.write(`${JSON.stringify({
    version: '0.1.0',
    milestone: 'phase-3-complete-benchmark-in-progress',
    implemented: ['contract-schema', 'canonical-hashing', 'primitive-plan-schema', 'candidate-interpreter',
      'mcp-snapshot-ingestion', 'evidence-isolation', 'read-only-verifier', 'promotion-registry',
      'structured-gemini-provider', 'persistent-quota-scheduler', 'mcp-compatibility-stdio',
      'bounded-composition', 'sqlite-state-side-effect-gate'],
    available_cli_commands: ['status', 'serve'],
    planned_cli_commands: ['snapshot', 'prepare', 'synthesize', 'verify', 'promote', 'eval']
  }, null, 2)}\n`);
} else if (command === '--help' || command === '-h') {
  process.stdout.write('ContractRelay development CLI\n\nAvailable: status, serve --fixture weather|refund [--registry path] [--plan path]\nPhase gate: pnpm check\nLocal demos: pnpm demo, pnpm demo:verified, pnpm demo:refund\nLive dev synthesis: pnpm synthesize:weather --resume, pnpm synthesize:refund --resume\n\nPlanned CLI commands: snapshot, prepare, synthesize, verify, promote, eval\n');
} else if (command === 'serve') {
  try {
    const { values } = parseArgs({ args: process.argv.slice(3), options: { fixture: { type: 'string' }, registry: { type: 'string' }, plan: { type: 'string' } } });
    if (values.fixture !== 'weather' && values.fixture !== 'refund') throw new Error('Choose --fixture weather or --fixture refund');
    const { serveFixture } = await import('./serve-fixture.js');
    await serveFixture({ fixture: values.fixture, registry: values.registry ?? '.contractrelay/registry',
      ...(values.plan === undefined ? {} : { plan: values.plan }) });
  } catch (error) { process.stderr.write(`${error instanceof Error ? error.message : 'SERVE_FAILED'}\n`); process.exitCode = 1; }
} else {
  process.stderr.write(`Command ${JSON.stringify(command)} is not implemented. Run pnpm cli --help.\n`);
  process.exitCode = 1;
}
