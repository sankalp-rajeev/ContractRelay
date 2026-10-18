import { createRequire } from 'node:module';
import { pathToFileURL, URL } from 'node:url';
import process from 'node:process';
import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';

// Reuse the flagship's pinned SDK without changing its dependency lockfile.
const require = createRequire(new URL('../../packages/mcp/package.json', import.meta.url));
const { Client } = await import(pathToFileURL(require.resolve('@modelcontextprotocol/sdk/client/index.js')).href);
const { StdioClientTransport } = await import(pathToFileURL(require.resolve('@modelcontextprotocol/sdk/client/stdio.js')).href);
const { InMemoryTransport } = await import(pathToFileURL(require.resolve('@modelcontextprotocol/sdk/inMemory.js')).href);
export {Client,InMemoryTransport};
const exec = promisify(execFile);
const checkedImages=new Set();

async function verifiedImage(project,version) {
  const tag=`contractrelay-realworld-${project}-${version}`;
  const {stdout}=await exec('docker',['image','inspect','--format','{{.Id}}',tag],{windowsHide:true});const image=stdout.trim();
  if(checkedImages.has(image))return image;
  let provenance;
  try{provenance=JSON.parse(await readFile(`benchmarks/realworld-v1/${project}/provenance.json`,'utf8'));}
  catch(error){if(error.code==='ENOENT')return image;throw error;}
  const expected=new Map(Object.entries(provenance.source_sha256).filter(([key])=>key.startsWith(`${version}:`)).map(([key,value])=>[`/app/${key.slice(version.length+1)}`,value]));
  const lock=project==='mindwtr'?'bun.lock':project==='nexus'?'uv.lock':'package-lock.json';
  const bootstrap=project==='mindwtr'?'bootstrap.ts':project==='nexus'?'bootstrap.py':'bootstrap.mjs';
  for(const [path,file] of [[`/app/${lock}`,`benchmarks/realworld-v1/${project}/docker/dependencies/${version}-${lock}`],
    [`/app/_evaluation/${bootstrap}`,`benchmarks/realworld-v1/${project}/docker/${bootstrap}`]])expected.set(path,createHash('sha256').update((await readFile(file,'utf8')).replaceAll('\r\n','\n')).digest('hex'));
  const js="const fs=require('node:fs'),crypto=require('node:crypto'); console.log(JSON.stringify(Object.fromEntries(process.argv.slice(1).map(p=>[p,crypto.createHash('sha256').update(fs.readFileSync(p,'utf8').replaceAll('\\r\\n','\\n')).digest('hex')]))));";
  const py="import sys,json,pathlib,hashlib;print(json.dumps({p:hashlib.sha256(pathlib.Path(p).read_bytes().replace(b'\\r\\n',b'\\n')).hexdigest() for p in sys.argv[1:]}))";
  const sums=await exec('docker',['run','--rm','--network=none','--entrypoint',project==='nexus'?'python':project==='mindwtr'?'bun':'node',image,
    project==='nexus'?'-c':'-e',project==='nexus'?py:js,...expected.keys()],{windowsHide:true});
  const actual=JSON.parse(sums.stdout);assert.equal(Object.keys(actual).length,expected.size);
  for(const [path,hash] of expected)assert.equal(actual[path],hash,`HISTORICAL_IMAGE_DRIFT: ${project}/${version}/${path}`);
  checkedImages.add(image);return image;
}

export async function openHistorical(project, version) {
  if (!['mindwtr','nexus','sqlew'].includes(project) || !['old','new'].includes(version)) throw new Error('UNKNOWN_HISTORICAL_SERVER');
  const image=await verifiedImage(project,version);
  const name = `contractrelay-realworld-${project}-${randomUUID()}`;
  const env = Object.fromEntries(['PATH','Path','SystemRoot','SYSTEMROOT','USERPROFILE','APPDATA','LOCALAPPDATA','TEMP','TMP','HOME'].filter(key=>process.env[key]!==undefined).map(key=>[key,process.env[key]]));
  const transport = new StdioClientTransport({ command: 'docker', args: ['run','--rm','-i','--name',name,
    '--network=none','--read-only','--cap-drop=ALL','--security-opt=no-new-privileges','--pids-limit=64','--memory=768m','--cpus=1',
    '--user=1000:1000','--tmpfs=/data:rw,nosuid,nodev,size=128m,uid=1000,gid=1000,mode=0700',
    '--tmpfs=/tmp:rw,nosuid,nodev,size=64m,mode=1777',image], env, stderr: 'pipe' });
  const client = new Client({name:'contractrelay-realworld-evaluator',version:'1.0.0'});
  let diagnostics = '';
  transport.stderr?.on('data',chunk=>{ diagnostics=(diagnostics+String(chunk)).slice(-12000); });
  const close = async () => { await client.close().catch(()=>undefined); await exec('docker',['rm','-f',name],{windowsHide:true}).catch(()=>undefined); };
  try { await client.connect(transport, {timeout:30000}); }
  catch(error) { await close(); throw new Error(`${project}/${version}: ${error.message}\n${diagnostics}`); }
  return {name,client,close,diagnostics:()=>diagnostics};
}

export function unwrap(response) {
  if(response.isError) throw new Error(`HISTORICAL_TOOL_ERROR: ${JSON.stringify(response.content)}`);
  if(response.structuredContent!==undefined) return response.structuredContent;
  if(response.content?.length!==1 || response.content[0].type!=='text') throw new Error('NON_JSON_MCP_RESPONSE');
  return JSON.parse(response.content[0].text);
}
