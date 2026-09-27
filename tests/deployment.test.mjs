import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir,mkdtemp,cp,mkdir,rm} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {resolve,join,dirname} from 'node:path';

test('Docker COPY payload imports and starts independently of development files',async()=>{
 const root=fileURLToPath(new URL('../',import.meta.url));
 // Under the repository so installed node_modules resolves exactly as the image's dependencies.
 const staging=await mkdtemp(join(root,'.deployment-test-'));
 let server,store;
 try{
  const docker=await readFile(join(root,'Dockerfile'),'utf8');
  for(const line of docker.split(/\r?\n/).filter(line=>line.startsWith('COPY '))){
   const parts=line.slice(5).trim().split(/\s+/),destination=parts.pop();
   for(const pattern of parts){
    const files=pattern==='*.mjs'?(await readdir(root)).filter(name=>name.endsWith('.mjs')):[pattern];
    for(const name of files){
     const target=destination==='./'?join(staging,name):resolve(staging,destination);
     await mkdir(dirname(target),{recursive:true});await cp(join(root,name),target,{recursive:true});
    }
   }
  }
  const {createApp}=await import(pathToFileURL(join(staging,'server.mjs')));
  const {openSchoolStore}=await import(pathToFileURL(join(staging,'school-store.mjs')));
  store=await openSchoolStore(':memory:',{username:'deployment_admin',password:'Deployment-test-password'});
  server=createApp({store});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base='http://127.0.0.1:'+server.address().port;
  assert.deepEqual(await (await fetch(base+'/health')).json(),{ok:true});
  assert.equal((await fetch(base+'/')).status,200);
 }finally{
  if(server)await new Promise(resolve=>server.close(resolve));store?.close();
  await rm(staging,{recursive:true,force:true});
 }
});
