// Historical parsers and gates run at their original commit, never the new DSL.
import assert from 'node:assert/strict';
import process from 'node:process';
import console from 'node:console';
import {execFileSync} from 'node:child_process';
import {access,readFile,writeFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath,URL} from 'node:url';
import {resolve,dirname,join} from 'node:path';
const root=fileURLToPath(new URL('../../',import.meta.url));
const legacy=resolve(root,'.contractrelay/pre-extension');
const baseline='4d307b21c8a964bd7f59c28e807afe6b5956b922';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const git=(...args)=>execFileSync('git',['-c',`safe.directory=${root.replaceAll('\\','/')}`,...args],{cwd:root,windowsHide:true,encoding:'utf8'});
try {await access(join(legacy,'.git'));}
catch {
 try {git('cat-file','-e',`${baseline}^{commit}`);}
 catch {git('fetch','--depth=1','origin',baseline);}
 git('worktree','add','--detach',legacy,baseline);
}
assert.equal(execFileSync('git',['-c',`safe.directory=${legacy.replaceAll('\\','/')}`,'-C',legacy,'rev-parse','HEAD'],{encoding:'utf8',windowsHide:true}).trim(),baseline);
const receipt=JSON.parse(await readFile(join(root,'benchmarks/realworld-v3/protected-before.json'),'utf8'));
for(const [path,expected] of Object.entries({...receipt.immutable,...receipt.pre_extension_core})) {
 const target=join(legacy,path);let bytes;
 try {bytes=await readFile(target);}catch(error){if(error.code==='ENOENT')continue;throw error;}
 const text=bytes.toString('utf8').replaceAll('\r\n','\n');
 assert.equal(sha(text),expected.lf,`LEGACY_CONTENT_DRIFT: ${path}`);
 // Git's LF checkout can differ from the captured Windows bytes. Restore only
 // the original line endings in this disposable checkout, using the raw hash.
 if(process.platform==='win32'&&sha(bytes)!==expected.raw) {
  const restored=text.replaceAll('\n','\r\n');assert.equal(sha(restored),expected.raw,path);await writeFile(target,restored);
 }
}
try {await access(join(legacy,'node_modules/tsx/dist/loader.mjs'));}
catch {
 const selected=process.argv.includes('--pnpm-js')?process.argv[process.argv.indexOf('--pnpm-js')+1]:null;
 if(selected)execFileSync(process.execPath,[resolve(selected),'install','--frozen-lockfile'],{cwd:legacy,stdio:'inherit',windowsHide:true});
 else if(process.platform==='win32')execFileSync(process.execPath,[join(dirname(process.execPath),'node_modules/corepack/dist/pnpm.js'),'install','--frozen-lockfile'],{cwd:legacy,stdio:'inherit',windowsHide:true});
 else execFileSync('pnpm',['install','--frozen-lockfile'],{cwd:legacy,stdio:'inherit',windowsHide:true});
}
const run=(...args)=>execFileSync(process.execPath,['--import=tsx',...args],{cwd:legacy,stdio:'inherit',windowsHide:true});
const tests=[];
for(const version of ['v1','v2'])for(const name of await readdir(join(legacy,`benchmarks/realworld-${version}/test`)))if(name.endsWith('.test.mjs'))tests.push(`benchmarks/realworld-${version}/test/${name}`);
run('--test',...tests);
run('benchmarks/realworld-v1/run.mjs','--validate');
run('benchmarks/realworld-v2/run.mjs','--validate');
if(process.argv.includes('--native')) {
 for(const id of ['mindwtr','nexus','sqlew'])run('benchmarks/realworld-v1/run.mjs','--case',id,'--replay');
 run('benchmarks/realworld-v2/replay.mjs');
}
console.log(JSON.stringify({legacy_commit:baseline,guards:'PASS',native_replay:process.argv.includes('--native'),api_calls:0,original_artifacts_untouched:true}));
