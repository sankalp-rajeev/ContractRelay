import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createRequire} from 'node:module';
import {pathToFileURL,URL} from 'node:url';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {readJson} from '../../packages/contracts/src/artifacts.ts';
import {base} from './cases.mjs';
const require=createRequire(new URL('../../packages/mcp/package.json',import.meta.url));
export const {Client}=await import(pathToFileURL(require.resolve('@modelcontextprotocol/sdk/client/index.js')).href);
const {StdioClientTransport}=await import(pathToFileURL(require.resolve('@modelcontextprotocol/sdk/client/stdio.js')).href);
export const {InMemoryTransport}=await import(pathToFileURL(require.resolve('@modelcontextprotocol/sdk/inMemory.js')).href);
const exec=promisify(execFile);
export async function openHistorical(entry,version) {
  assert(['old','new'].includes(version));
  const tag=entry.runtimeKind==='session-collab'?`contractrelay-realworld-v3-session-collab-${version}`:`contractrelay-realworld-v2-${entry.project}-${version}`;
  const inspect=JSON.parse((await exec('docker',['image','inspect',tag],{windowsHide:true})).stdout)[0];
  assert.equal(inspect.Config.Labels['org.opencontainers.image.revision'],entry[version],'IMAGE_REVISION_DRIFT');
  const name=`contractrelay-v2-${entry.id}-${randomUUID()}`;
  const command=entry.serverArgs?.[version]??[];
  const transport=new StdioClientTransport({command:'docker',args:['run','--rm','-i','--name',name,'--network=none','--read-only','--cap-drop=ALL','--security-opt=no-new-privileges','--pids-limit=128','--memory=1g','--cpus=1','--user=1000:1000','--tmpfs=/tmp:rw,nosuid,nodev,size=128m,mode=1777',inspect.Id,...command],stderr:'pipe'});
  const client=new Client({name:'contractrelay-external-validity-v2',version:'1'});let diagnostics='';
  transport.stderr?.on('data',chunk=>{diagnostics=(diagnostics+String(chunk)).slice(-12000);});
  const close=async()=>{await client.close().catch(()=>undefined);await exec('docker',['rm','-f',name],{windowsHide:true}).catch(()=>undefined);};
  try {await client.connect(transport,{timeout:60000});}
  catch(error){await close();throw new Error(`${entry.id}/${version}: ${error.message}\n${diagnostics}`);}
  const audit=async()=> {
    if(entry.runtimeKind==='session-collab')return {bundle_sha256:(await exec('docker',['exec',name,'sha256sum','/app/dist/cli.js'],{windowsHide:true})).stdout.trim().split(/\s/)[0]};
    if(entry.runtimeKind==='fabric')return {binary_sha256:(await exec('docker',['exec',name,'sha256sum',entry.binaryPath],{windowsHide:true})).stdout.trim().split(/\s/)[0]};
    const script="const fs=require('node:fs'),c=require('node:crypto'),p=require('node:path');const sha=b=>c.createHash('sha256').update(b).digest('hex');const files={};function walk(dir){for(const n of fs.readdirSync(dir).sort()){const q=p.join(dir,n);if(fs.statSync(q).isDirectory())walk(q);else files[q]=sha(fs.readFileSync(q));}}walk('dist');console.log(JSON.stringify({compiled_dist_sha256:sha(JSON.stringify(files)),lock_sha256:sha(fs.readFileSync('package-lock.json','utf8').replaceAll('\\r\\n','\\n')),version:JSON.parse(fs.readFileSync('dist/esm/version.json','utf8'))}));";
    return JSON.parse((await exec('docker',['exec',name,'node','-e',script],{windowsHide:true,maxBuffer:1000000})).stdout);
  };
  try {
    const provenance=await readJson(`${base}/${entry.id}/provenance.json`);
    assert.deepEqual(await audit(),provenance.runtime_audit[version],'HISTORICAL_BINARY_DRIFT');
  }catch(error){if(error.code!=='ENOENT'){await close();throw error;}}
  const observe=async()=>entry.runtimeKind==='session-collab'?JSON.parse((await exec('docker',['exec',name,'node','/app/session-observe.mjs'],{windowsHide:true,maxBuffer:1000000})).stdout):({writable_layer_changes:(await exec('docker',['diff',name],{windowsHide:true})).stdout.trim().split('\n').filter(Boolean)});
  return {client,name,image:inspect.Id,close,observe,audit,diagnostics:()=>diagnostics};
}
export function unwrap(response) {
  if(response.isError)throw new Error(`HISTORICAL_TOOL_ERROR: ${JSON.stringify(response.content)}`);
  if(response.structuredContent!==undefined)return response.structuredContent;
  if(response.content?.length!==1||response.content[0].type!=='text')throw new Error('NON_JSON_MCP_RESPONSE');
  return JSON.parse(response.content[0].text);
}
export async function assertSnapshot(entry,version,client) {
  const actual=await client.listTools();const expected=await readJson(`${base}/${entry.id}/${version}-tools-list.json`);
  assert.deepEqual(actual,expected,'HISTORICAL_TOOLS_LIST_DRIFT');return actual;
}
