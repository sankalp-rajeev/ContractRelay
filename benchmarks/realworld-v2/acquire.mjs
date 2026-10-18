import {execFileSync} from 'node:child_process';
import console from 'node:console';
import assert from 'node:assert/strict';
import {mkdir,copyFile,readFile,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {base,selectedCase} from './cases.mjs';
const exec=(cmd,args)=>execFileSync(cmd,args,{stdio:'inherit',windowsHide:true});
for(const entry of selectedCase()) {
  const source=resolve('runs/realworld-v2/sources',entry.id);
  try{await readFile(join(source,'.git/config'));}catch(error){if(error.code!=='ENOENT')throw error;await mkdir(source,{recursive:true});exec('git',['clone','--filter=blob:none','--no-checkout',entry.repository+'.git',source]);}
  for(const version of ['old','new']) {
    if(entry.releaseImages) {
      const image=entry.releaseImages[version];exec('docker',['pull',image]);
      const info=JSON.parse(execFileSync('docker',['image','inspect',image],{encoding:'utf8'}))[0];
      assert.equal(info.Config.Labels['com.azure.dev.image.build.sourceversion'],entry[version],'VENDOR_SOURCE_REVISION_DRIFT');
      const folder=join(base,entry.id,'docker');await mkdir(folder,{recursive:true});
      await writeFile(join(folder,`${version}-release.json`),JSON.stringify({image,source_commit:entry[version],vendor_labels:info.Config.Labels},null,2)+'\n');
      exec('docker',['build','--build-arg',`BASE_IMAGE=${image}`,'--build-arg',`SOURCE_COMMIT=${entry[version]}`,'-t',`contractrelay-realworld-v2-${entry.id}-${version}`,'-f',join(folder,'Dockerfile'),folder]);
      continue;
    }
    const target=resolve(`runs/realworld-v2/sources/${entry.id}-${version}`);await mkdir(target,{recursive:true});
    const archive=`${target}.tar`;
    exec('git',['-C',source,'archive','--format=tar',`--output=${archive}`,entry[version]]);
    exec('tar',['-xf',archive,'-C',target]);
    exec('git',['-C',source,'bundle','create',join(target,'history.bundle'),entry[`${version}Tag`]]);
    const lockFolder=join(base,entry.id,'docker/dependencies');await mkdir(lockFolder,{recursive:true});
    await copyFile(join(target,'package-lock.json'),join(lockFolder,`${version}-package-lock.json`));
    await writeFile(join(target,'source-commit.txt'),entry[version]+'\n');
    exec('docker',['build','--build-arg',`SOURCE_TAG=${entry[`${version}Tag`]}`,'--label',`org.opencontainers.image.revision=${entry[version]}`,'-t',`contractrelay-realworld-v2-${entry.id}-${version}`,'-f',join(base,entry.id,'docker/Dockerfile'),target]);
  }
  console.log(JSON.stringify({case:entry.id,acquired:true,model_calls:0}));
}
