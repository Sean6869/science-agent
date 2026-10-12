import {test} from 'node:test';
import assert from 'node:assert/strict';
import {bilibiliUrl} from '../public/lesson-video.js';

test('Bilibili lesson player uses the selected part without tracking parameters',()=>{
 const url=new URL(bilibiliUrl({bvid:'BV1GQpR6iE44',page:3}));
 assert.equal(url.origin,'https://player.bilibili.com');
 assert.equal(url.pathname,'/player.html');
 assert.deepEqual(Object.fromEntries(url.searchParams),{bvid:'BV1GQpR6iE44',p:'3',autoplay:'0',danmaku:'0',poster:'1'});
});
