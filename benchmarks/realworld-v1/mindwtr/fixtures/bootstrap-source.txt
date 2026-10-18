import { Database } from 'bun:sqlite';
import { SQLITE_SCHEMA } from '/app/packages/core/src/sqlite-schema.ts';
const db = new Database('/data/mindwtr.db');
db.exec(SQLITE_SCHEMA);
const insert = db.prepare('INSERT INTO tasks (id,title,status,createdAt,updatedAt,tags,contexts,checklist,attachments) VALUES (?,?,?,?,?,?,?,?,?)');
for (const [id, title, status] of [['task-alpha','Alpha fixture','inbox'], ['task-beta','Beta fixture','next'], ['task-gamma','Gamma fixture','inbox']]) {
  insert.run(id, title, status, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z', '[]', '[]', '[]', '[]');
}
db.close();
const { startMcpServer } = await import('/app/apps/mcp-server/src/index.ts');
await startMcpServer(['--db', '/data/mindwtr.db', '--readonly']);
