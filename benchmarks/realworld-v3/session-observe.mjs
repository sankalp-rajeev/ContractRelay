import Database from 'better-sqlite3';
import console from 'node:console';
const db=new Database('/tmp/collab.db',{readonly:true});
const tables={};
for(const {name} of db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all()) {
 if(!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name))throw new Error('Unsafe fixture table');
 tables[name]=db.prepare(`SELECT * FROM ${name} ORDER BY rowid`).all();
}
console.log(JSON.stringify({tables,side_effect_count:tables._contractrelay_audit.length,writable_layer_changes:[]}));
db.close();
