import {test} from 'node:test';
import assert from 'node:assert/strict';
import {requiresSessionReload} from '../public/api-response.js';

test('business conflicts preserve the page while expired or switched sessions reload',async()=>{
 const conflict=Response.json({message:'请等待本环节反馈完成后再申请清空记录'},{status:409});
 assert.equal(await requiresSessionReload(conflict,'/api/inquiry-record/clear'),false);
 assert.equal((await conflict.json()).message,'请等待本环节反馈完成后再申请清空记录');
 assert.equal(await requiresSessionReload(Response.json({code:'SESSION_CHANGED'},{status:409}),'/api/config'),true);
 assert.equal(await requiresSessionReload(new Response('temporary conflict',{status:409}),'/api/groups/roles'),false);
 assert.equal(await requiresSessionReload(new Response('',{status:401}),'/api/auth/login'),false);
 assert.equal(await requiresSessionReload(new Response('',{status:401}),'/api/me'),true);
 assert.equal(await requiresSessionReload(new Response('',{status:200}),'/api/me'),false);
});
