// Fixture setup only. The native historical server below is unmodified.
import Database from 'better-sqlite3';
import {readFileSync} from 'node:fs';
import process from 'node:process';
const db=new Database('/tmp/collab.db');
for(const name of ['0001_init.sql','0002_auth.sql','0002_session_status.sql','0003_config.sql','0004_symbols.sql','0005_references.sql','0006_composite_indexes.sql','0007_priority.sql'])db.exec(readFileSync(`/app/migrations/${name}`,'utf8'));
const time='2026-01-01 00:00:00';
const session=db.prepare('INSERT INTO sessions (id,name,project_root,created_at,last_heartbeat,status) VALUES (?,?,?,?,?,?)');
session.run('fixture-reader','Reader','/project',time,time,'active');
session.run('fixture-owner','Owner','/project',time,time,'active');
session.run('fixture-ended','Ended','/project',time,time,'inactive');
const claim=db.prepare('INSERT INTO claims (id,session_id,intent,scope,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?)');
const file=db.prepare('INSERT INTO claim_files (claim_id,file_path,is_pattern) VALUES (?,?,0)');
for(const [id,owner,intent,path] of [['claim-blocked','fixture-owner','Maintain parser','/project/blocked.ts'],['claim-locked','fixture-owner','Maintain router','/project/locked.ts'],['claim-own','fixture-reader','Own work','/project/own.ts'],['claim-ended','fixture-ended','Inactive work','/project/ended.ts']]) {
 claim.run(id,owner,intent,'medium','active',time,time);file.run(id,path);
}
db.exec('CREATE TABLE _contractrelay_audit (table_name TEXT, operation TEXT)');
for(const {name} of db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name != '_contractrelay_audit'").all())for(const operation of ['INSERT','UPDATE','DELETE']) {
 if(!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name))throw new Error('Unsafe fixture table');
 db.exec(`CREATE TRIGGER audit_${name}_${operation} AFTER ${operation} ON ${name} BEGIN INSERT INTO _contractrelay_audit VALUES ('${name}','${operation}'); END`);
}
db.close();
// Both historical CLIs repeat already-applied auth ALTERs on startup. Their
// existing warning is retained; applying upstream migrations is fixture setup.
process.argv=['node','/app/dist/cli.js','--db','/tmp/collab.db'];
await import('/app/dist/cli.js');
