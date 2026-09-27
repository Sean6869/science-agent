import {test} from 'node:test';
import assert from 'node:assert/strict';
import {roleHints} from '../public/role-hints.js';

test('all six inquiry stages provide static role guidance',()=>{
 assert.deepEqual(roleHints.map(item=>item.id),[1,2,3,4,5,6]);
 for(const item of roleHints){assert.ok(item.title);assert.match(item.prompt,/领航发言员|两位成员/);assert.match(item.prompt,/记录与质疑员/);assert.match(item.record,/实验任务单/);assert.doesNotMatch(item.prompt+item.record,/AI|智能体|模型/);}
});
