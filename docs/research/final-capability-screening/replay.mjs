// API-free candidate screening. This is not an evaluation or an adapter.
import assert from 'node:assert/strict';
import process from 'node:process';
import {Buffer} from 'node:buffer';
import console from 'node:console';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {readFile,writeFile,mkdir,access} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {fileURLToPath,pathToFileURL,URL} from 'node:url';
import {resolve,join} from 'node:path';
const base=fileURLToPath(new URL('./',import.meta.url));
const root=resolve(base,'../../..');
const json=async path=>JSON.parse(await readFile(path,'utf8'));
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const require=createRequire(join(root,'packages/mcp/package.json'));
const {ToolSchema}=await import(pathToFileURL(require.resolve('@modelcontextprotocol/sdk/types.js')).href);
const receipt=await json(join(base,'protected-before.json'));
let rawBytesMatch=true;
for(const [path,expected] of Object.entries(receipt.files)) {
 const bytes=await readFile(join(root,path));
 assert.equal(digest(Buffer.from(bytes.toString('utf8').replaceAll('\r\n','\n'))),expected.lf_sha256,path);
 rawBytesMatch=rawBytesMatch&&digest(bytes)===expected.raw_sha256;
 if(process.argv.includes('--strict-bytes'))assert.equal(digest(bytes),expected.raw_sha256,path);
}
const evidence=await json(join(base,'evidence-files.json'));
for(const [path,expected] of Object.entries(evidence)) {
 const bytes=await readFile(join(base,path));
 assert.equal(digest(Buffer.from(bytes.toString('utf8').replaceAll('\r\n','\n'))),expected,path);
}
const responses={};
for(const side of ['old','new']) {
 const response=await json(join(base,'arxiv',side,'categories-response.json'));
 assert.equal(response.isError,false);
 assert.equal(response.content.length,33);
 assert.equal(response.structuredContent.result.length,33);
 assert.deepEqual(response.content.map(block=>JSON.parse(block.text)),response.structuredContent.result);
 responses[side]=response;
}
assert.deepEqual(responses.old,responses.new,'Candidate unexpectedly has a breaking category response');
const kiri=ToolSchema.safeParse({name:'files_search',inputSchema:{type:'object'},outputSchema:{type:'array',items:{type:'object'}}});
assert.equal(kiri.success,false);
assert.deepEqual(kiri.error.issues[0].path,['outputSchema','type']);
if(process.argv.includes('--native')||process.argv.includes('--build')) {
 const {Client}=await import(pathToFileURL(require.resolve('@modelcontextprotocol/sdk/client/index.js')).href);
 const {StdioClientTransport}=await import(pathToFileURL(require.resolve('@modelcontextprotocol/sdk/client/stdio.js')).href);
 for(const side of ['old','new']) {
  const runtime=await json(join(base,'arxiv',side,'runtime.json'));
  let image=runtime.image_id;
  if(process.argv.includes('--build')) {
   const repo=join(root,'runs/realworld-v3/sources/arxiv');
   try {await access(join(repo,'.git'));}
   catch {execFileSync('git',['clone','--filter=blob:none','--no-checkout','https://github.com/Ray0907/arXiv-mcp.git',repo],{stdio:'inherit',windowsHide:true});}
   const archive=execFileSync('git',['-c',`safe.directory=${repo.replaceAll('\\','/')}`,'-C',repo,'archive',runtime.commit],{maxBuffer:5000000,windowsHide:true});
   assert.equal(digest(archive),runtime.source_archive_sha256);
   const context=join(root,'runs/realworld-v3/screening-rebuild',side);
   await mkdir(context,{recursive:true});
   await writeFile(join(context,'source.tar'),archive);
   for(const name of ['uv.lock','Dockerfile'])await writeFile(join(context,name),await readFile(join(base,'arxiv',side,name)));
   const tag=`contractrelay-screening-arxiv-${side}`;
   execFileSync('docker',['build','-t',tag,context],{stdio:'inherit',windowsHide:true});
   image=execFileSync('docker',['image','inspect',tag,'--format','{{.Id}}'],{encoding:'utf8',windowsHide:true}).trim();
  }
  const transport=new StdioClientTransport({command:'docker',args:['run','--rm','-i','--network=none','--read-only','--cap-drop=ALL','--security-opt=no-new-privileges','--pids-limit=128','--memory=1g','--cpus=1','--user=1000:1000','--tmpfs=/tmp:rw,nosuid,nodev,size=128m,mode=1777',image],stderr:'inherit'});
  const client=new Client({name:'historical-candidate-screening',version:'1'});
  try {
   await client.connect(transport,{timeout:60000});
   assert.deepEqual(await client.listTools(),await json(join(base,'arxiv',side,'tools-list.json')));
   assert.deepEqual(await client.callTool({name:'list_categories',arguments:{}}),responses[side]);
  } finally {await client.close();}
 }
}
console.log(JSON.stringify({protected_files:Object.keys(receipt.files).length,protected_unchanged:true,protected_raw_bytes_match:rawBytesMatch,arxiv_response_identical:true,categories:33,kiri_array_root_rejected_by_client:true,native:process.argv.includes('--native')||process.argv.includes('--build'),accepted_cases:0,gemini_calls:0,cost_usd:0},null,2));
