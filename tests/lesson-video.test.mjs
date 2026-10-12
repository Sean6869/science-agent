import {test} from 'node:test';
import assert from 'node:assert/strict';
import {codapanUrl} from '../public/lesson-video.js';

test('Codapan iframe preserves embed layout and requests autoplay',()=>{
 const url=new URL(codapanUrl('https://www.codapan.com/s/tquigusvPrir?embed=1&layout=full'));
 assert.equal(url.origin,'https://www.codapan.com');
 assert.equal(url.pathname,'/s/tquigusvPrir');
 assert.deepEqual(Object.fromEntries(url.searchParams),{embed:'1',layout:'full',autoplay:'1'});
});
