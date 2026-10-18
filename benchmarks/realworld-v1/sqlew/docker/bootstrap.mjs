// Historical startup diagnostics otherwise pollute MCP stdout. Tool logic and
// transport writes are unchanged; only console diagnostics move to stderr.
import console from 'node:console';
import process from 'node:process';
console.log = (...values) => console.error(...values);
const { initializeDatabase } = await import('/app/dist/database.js');
const { setDecision } = await import('/app/dist/tools/context.js');
const db = initializeDatabase('/data/sqlew.db');
for (const [key,value] of [['fixture.alpha','alpha-value'],['fixture.beta','beta-value'],['fixture.gamma',37]]) setDecision({key,value,agent:'fixture-agent'});
db.prepare('UPDATE t_decisions SET ts = ?').run(1767225600);
db.prepare('UPDATE t_decisions_numeric SET ts = ?').run(1767225600);
// Fixture-only auditing observes real writes, including same-value updates.
db.exec('CREATE TABLE _contractrelay_audit (table_name TEXT, operation TEXT)');
for(const {name} of db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name != '_contractrelay_audit'").all()) {
  if(!/^[a-z_]+$/.test(name)) throw new Error('Unexpected fixture table');
  for(const operation of ['INSERT','UPDATE','DELETE']) db.exec(`CREATE TRIGGER _audit_${name}_${operation} AFTER ${operation} ON ${name} BEGIN INSERT INTO _contractrelay_audit VALUES ('${name}','${operation}'); END`);
}
process.argv = ['node','/app/dist/index.js','--db-path','/data/sqlew.db'];
await import('/app/dist/index.js');
