import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createApp} from '../server.mjs';
import {openSchoolStore} from '../school-store.mjs';

test('student HLS proxy resolves Codapan page and serves rewritten encrypted segments',async()=>{
 const store=await openSchoolStore(':memory:',{username:'admin',password:'Admin-test-password'}),admin=await store.login('admin','Admin-test-password');
 const created=await store.addStudent({name:'学生甲',gender:'女',className:'八年级6班',username:'student-video',password:'Student-video-password'},admin.user),student=await store.login(created.username,'Student-video-password');
 const upstream='https://www.codapan.com/play/video/2026-10/12/test/index.m3u8',calls=[];
 const fetchMedia=async input=>{const url=String(input);calls.push(url);if(url.startsWith('https://www.codapan.com/s/'))return new Response(`<script>var playUrl = "${upstream}";</script>`);if(url===upstream)return new Response('#EXTM3U\n#EXT-X-KEY:METHOD=AES-128,URI="key.key"\n0000.ts\n#EXT-X-ENDLIST\n');if(url.endsWith('/key.key'))return new Response(new Uint8Array([1,2,3]));if(url.endsWith('/0000.ts'))return new Response(new Uint8Array([4,5,6]),{headers:{'content-type':'video/mp2t'}});return new Response('',{status:404});};
 const server=createApp({store,fetchMedia});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base=`http://127.0.0.1:${server.address().port}`,headers={cookie:`xiaoke_session=${student.token}`,'x-csrf-token':student.csrf};
 try{
  const manifest=await fetch(base+'/api/lesson-video/bending-light/index.m3u8',{headers});assert.equal(manifest.status,200);const body=await manifest.text();assert.match(body,/\/api\/lesson-video\/bending-light\/key\.key/);assert.match(body,/\/api\/lesson-video\/bending-light\/0000\.ts/);
  const segment=await fetch(base+'/api/lesson-video/bending-light/0000.ts',{headers});assert.equal(segment.status,200);assert.equal(segment.headers.get('content-type'),'video/mp2t');assert.deepEqual([...new Uint8Array(await segment.arrayBuffer())],[4,5,6]);
  assert.equal(calls.filter(url=>url.startsWith('https://www.codapan.com/s/')).length,1);
  assert.equal((await fetch(base+'/api/lesson-video/unknown/index.m3u8',{headers})).status,404);
  assert.equal((await fetch(base+'/api/lesson-video/bending-light/index.m3u8')).status,401);
 }finally{await new Promise(resolve=>server.close(resolve));store.close();}
});
