const command = process.argv[2] ?? '--help';

if (command === 'status') {
  process.stdout.write(`${JSON.stringify({
    version: '0.1.0',
    milestone: 'deterministic-foundation',
    implemented: ['contract-schema', 'canonical-hashing', 'primitive-plan-schema', 'candidate-interpreter'],
    planned: ['snapshot', 'prepare', 'synthesize', 'verify', 'promote', 'serve', 'eval']
  }, null, 2)}\n`);
} else if (command === '--help' || command === '-h') {
  process.stdout.write('ContractRelay development CLI\n\nAvailable: status\nLocal fixture demo: pnpm demo\n\nPlanned: snapshot, prepare, synthesize, verify, promote, serve, eval\n');
} else {
  process.stderr.write(`Command ${JSON.stringify(command)} is not implemented. Run pnpm cli --help.\n`);
  process.exitCode = 1;
}
