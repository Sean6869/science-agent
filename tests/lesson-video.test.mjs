import {test} from 'node:test';
import assert from 'node:assert/strict';
import {codapanUrl} from '../public/lesson-video.js';

test('Codapan lesson player preserves embed layout and enables autoplay',()=>{
 const url=new URL(codapanUrl('https://www.codapan.com/s/nquACrKoFNZJ?embed=1&layout=full'));
 assert.equal(url.origin,'https://www.codapan.com');
 assert.equal(url.pathname,'/s/nquACrKoFNZJ');
 assert.deepEqual(Object.fromEntries(url.searchParams),{embed:'1',layout:'full',autoplay:'1'});
});
