const command = process.argv[2] ?? '--help';

if (command === 'status') {
  process.stdout.write(`${JSON.stringify({
    version: '0.1.0',
    milestone: 'phase-2-complete',
    implemented: ['contract-schema', 'canonical-hashing', 'primitive-plan-schema', 'candidate-interpreter',
      'mcp-snapshot-ingestion', 'evidence-isolation', 'read-only-verifier', 'promotion-registry',
      'structured-gemini-provider', 'persistent-quota-scheduler'],
    planned_cli_commands: ['snapshot', 'prepare', 'synthesize', 'verify', 'promote', 'serve', 'eval']
  }, null, 2)}\n`);
} else if (command === '--help' || command === '-h') {
  process.stdout.write('ContractRelay development CLI\n\nAvailable: status\nPhase gate: pnpm check\nLocal demos: pnpm demo, pnpm demo:verified\nLive dev synthesis: pnpm synthesize:weather --resume\n\nPlanned CLI commands: snapshot, prepare, synthesize, verify, promote, serve, eval\n');
} else {
  process.stderr.write(`Command ${JSON.stringify(command)} is not implemented. Run pnpm cli --help.\n`);
  process.exitCode = 1;
}
