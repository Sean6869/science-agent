import test from 'node:test';
import assert from 'node:assert/strict';
import {isNearBottom,updateMessageList} from '../public/chat-scroll.js';

test('periodic message refresh preserves a reader position away from the bottom',()=>{
 const list={scrollTop:180,scrollHeight:1000,clientHeight:300};
 assert.equal(isNearBottom(list),false);
 updateMessageList(list,()=>{list.scrollHeight=1200;});
 assert.equal(list.scrollTop,180);
});

test('message refresh follows the latest item when already near the bottom',()=>{
 const list={scrollTop:680,scrollHeight:1000,clientHeight:300};
 assert.equal(isNearBottom(list),true);
 updateMessageList(list,()=>{list.scrollHeight=1200;});
 assert.equal(list.scrollTop,1200);
});

test('explicit send and conversation changes can force the latest item into view',()=>{
 const list={scrollTop:120,scrollHeight:1000,clientHeight:300};
 updateMessageList(list,()=>{list.scrollHeight=1100;},{forceBottom:true});
 assert.equal(list.scrollTop,1100);
});
