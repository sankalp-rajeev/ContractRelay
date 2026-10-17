import { readFileSync } from 'node:fs';
import process from 'node:process';

try {
  const value = JSON.parse(readFileSync(process.argv[2], 'utf8'));
  process.stdout.write(JSON.stringify({ ok: true, value }));
} catch (error) {
  process.stdout.write(JSON.stringify({ ok: false, code: error.code ?? 'INVALID_JSON' }));
  process.exitCode = 1;
}
