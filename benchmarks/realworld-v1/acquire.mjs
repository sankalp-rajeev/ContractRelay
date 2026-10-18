import {mkdir,copyFile,writeFile,readFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {resolve,join} from 'node:path';
import process from 'node:process';
import console from 'node:console';
import {cases} from './cases.mjs';
const selected=process.argv.includes('--case')?process.argv[process.argv.indexOf('--case')+1]:null;
if(selected&&!cases.some(entry=>entry.id===selected))throw new Error('UNKNOWN_REALWORLD_CASE');
const exec=(command,args)=>execFileSync(command,args,{stdio:'inherit',windowsHide:true});
for(const entry of cases.filter(entry=>!selected||entry.id===selected)) {
 const source=resolve('runs/realworld-v1/sources',entry.id);await mkdir(source,{recursive:true});
 try{await readFile(join(source,'.git/config'));}
 catch(error){if(error.code!=='ENOENT')throw error;exec('git',['clone','--filter=blob:none','--no-checkout',`${entry.repository}.git`,source]);}
 for(const version of ['old','new']) {
  const directory=resolve(`runs/realworld-v1/sources/${entry.id}-${version}`);await mkdir(directory,{recursive:true});
  const archive=`${directory}.tar`;exec('git',['-C',source,'archive','--format=tar',`--output=${archive}`,entry[version]]);exec('tar',['-xf',archive,'-C',directory]);
  const helper=join(directory,'_evaluation');await mkdir(helper,{recursive:true});
  const bootstrap=entry.id==='mindwtr'?'bootstrap.ts':entry.id==='nexus'?'bootstrap.py':'bootstrap.mjs';
  await copyFile(`benchmarks/realworld-v1/${entry.id}/docker/${bootstrap}`,join(helper,bootstrap));
  if(entry.id==='nexus')await copyFile('benchmarks/realworld-v1/nexus/docker/requirements.lock',join(helper,'requirements.lock'));
  await writeFile(join(helper,'source-commit.txt'),entry[version]+'\n');
  exec('docker',['build','-t',`contractrelay-realworld-${entry.id}-${version}`,'-f',`benchmarks/realworld-v1/${entry.id}/docker/Dockerfile`,directory]);
 }
 console.log(JSON.stringify({case:entry.id,acquired:true,model_calls:0}));
}
